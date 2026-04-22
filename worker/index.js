const admin = require("firebase-admin");
const axios = require("axios");

// Inicialização do Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = {
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    if (!serviceAccount.privateKey) {
        console.error("ERRO: FIREBASE_ADMIN_PRIVATE_KEY não definida!");
        process.exit(1);
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// Configurações da Evolution API (via variáveis de ambiente)
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
let EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080").trim().replace(/\/$/, "");
if (EVOLUTION_API_URL && !EVOLUTION_API_URL.startsWith("http")) {
    EVOLUTION_API_URL = `https://${EVOLUTION_API_URL}`;
}

console.log("🚀 CRM VMM Worker iniciado...");
console.log("🔗 Evolution API URL:", EVOLUTION_API_URL);

/**
 * Loop principal do Worker
 */
async function processQueue() {
    try {
        // 1. Busca leads pendentes ou que estão travados em 'enviando' há muito tempo
        const now = admin.firestore.Timestamp.now();
        const filaSnap = await db.collection("filaEnvio")
            .where("status", "==", "pendente")
            .limit(5) // Processa em blocos de 5
            .get();

        if (filaSnap.empty) {
            // Ninguém na fila? Espera 5 segundos e tenta de novo
            setTimeout(processQueue, 5000);
            return;
        }

        console.log(`[Worker] Processando ${filaSnap.size} itens da fila...`);

        for (const doc of filaSnap.docs) {
            const item = doc.data();
            const itemId = doc.id;

            // Bloqueia o lead para não ser pego por outro processo
            await doc.ref.update({ status: "enviando" });

            try {
                const instanceName = `crm-vmm-${item.userId.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase()}`;
                
                console.log(`[Worker] Enviando para ${item.leadNome} (${item.phone})...`);

                // 2. Faz o disparo via Evolution API
                const response = await axios.post(
                    `${EVOLUTION_API_URL}/message/sendText/${instanceName}`,
                    {
                        number: item.phone,
                        textMessage: { text: item.mensagem },
                        options: { delay: 1200, presence: "composing" }
                    },
                    {
                        headers: { apikey: EVOLUTION_API_KEY },
                        timeout: 15000
                    }
                );

                const messageId = response.data?.key?.id || response.data?.messageId;

                // 3. Atualiza como enviado e salva o horário real
                await doc.ref.update({
                    status: "enviado",
                    messageId: messageId || null,
                    enviadoEm: admin.firestore.Timestamp.now(),
                    erro: null
                });

                // 4. Se o lead tiver um documento associado na coleção 'leads', atualiza lá também
                if (item.leadId) {
                    await db.collection("leads").doc(item.leadId).update({
                        status: "enviado",
                        lastCampaignName: item.campanhaNome || "Campanha",
                        campaignContacted: true,
                        updatedAt: admin.firestore.Timestamp.now()
                    }).catch(() => {});
                }

                // 5. Atualiza o contador de progresso da campanha
                if (item.campanhaId) {
                    const campRef = db.collection("campanhas").doc(item.campanhaId);
                    await db.runTransaction(async (t) => {
                        const cDoc = await t.get(campRef);
                        if (cDoc.exists) {
                            const progObj = cDoc.data().progresso || { enviados: 0, total: 0 };
                            t.update(campRef, {
                                "progresso.enviados": admin.firestore.FieldValue.increment(1)
                            });
                        }
                    });
                }

                console.log(`[Worker] Sucesso: ${item.leadNome}`);

            } catch (err) {
                console.error(`[Worker] Falha ao enviar para ${item.leadNome}:`, err.message);
                await doc.ref.update({
                    status: "falhou",
                    erro: err.response?.data?.message || err.message,
                    enviadoEm: admin.firestore.Timestamp.now() // salva para registrar que houve tentativa
                });
                
                // Incrementa falhas na campanha
                if (item.campanhaId) {
                    await db.collection("campanhas").doc(item.campanhaId).update({
                        "progresso.falhos": admin.firestore.FieldValue.increment(1)
                    }).catch(() => {});
                }
            }

            // INTERVALO DE SEGURANÇA ENTRE DISPAROS (Baseado no tempo da campanha)
            const waitTime = (item.intervalo || 30) * 1000;
            console.log(`[Worker] Esperando ${item.intervalo}s para o próximo disparo...`);
            await new Promise(r => setTimeout(r, waitTime));
        }

        // Continua o loop
        processQueue();

    } catch (globalErr) {
        console.error("[Worker] Erro Crítico no Loop:", globalErr);
        setTimeout(processQueue, 10000);
    }
}

// Inicia o processo
processQueue();
