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

        console.log(`[Worker] Processando ${filaSnap.size} itens em paralelo...`);
        
        await Promise.all(filaSnap.docs.map(async (doc) => {
            const item = doc.data();
            try {
                // Bloqueia o lead
                await doc.ref.update({ status: "enviando" });

                const instanceName = `crm-vmm-${item.userId.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase()}`;
                console.log(`[Worker] Enviando para ${item.leadNome || item.phone}...`);

                // Disparo
                const response = await axios.post(
                    `${EVOLUTION_API_URL}/message/sendText/${instanceName}`,
                    {
                        number: item.phone,
                        textMessage: { text: item.mensagem }
                    },
                    {
                        headers: { apikey: EVOLUTION_API_KEY },
                        timeout: 15000
                    }
                );

                const messageId = response.data?.key?.id || response.data?.messageId;

                // Sucesso
                await doc.ref.update({
                    status: "enviado",
                    messageId: messageId || null,
                    enviadoEm: admin.firestore.Timestamp.now()
                });

                // Atualiza lead
                if (item.leadId) {
                    await db.collection("leads").doc(item.leadId).update({
                        status: "enviado",
                        updatedAt: admin.firestore.Timestamp.now()
                    }).catch(() => {});
                }

                // Atualiza campanha
                if (item.campanhaId) {
                    await db.collection("campanhas").doc(item.campanhaId).update({
                        "progresso.enviados": admin.firestore.FieldValue.increment(1)
                    }).catch(() => {});
                }

                console.log(`[Worker] Sucesso: ${item.phone}`);
            } catch (err) {
                console.error(`[Worker] Falha em ${item.phone}:`, err.message);
                await doc.ref.update({
                    status: "falhou",
                    erro: err.message,
                    enviadoEm: admin.firestore.Timestamp.now()
                });
            }
        }));

        // Espera curta de 2 segundos antes do próximo bloco
        await new Promise(r => setTimeout(r, 2000));

        // Continua o loop
        processQueue();

    } catch (globalErr) {
        console.error("[Worker] Erro Crítico no Loop:", globalErr);
        setTimeout(processQueue, 10000);
    }
}

// Inicia o processo
processQueue();
