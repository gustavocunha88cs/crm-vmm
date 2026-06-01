import * as admin from "firebase-admin";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

if (!admin.apps.length) {
  if (projectId && clientEmail && privateKey) {
    try {
      // Limpeza robusta da chave privada para ambientes de produção (Railway/Vercel)
      const formattedKey = privateKey
        .replace(/\\n/g, "\n")
        .replace(/^"(.*)"$/, "$1") // Remove aspas extras se existirem
        .replace(/^'(.*)'$/, "$1");

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: formattedKey,
        }),
      });
      console.log("[Firebase Admin] Inicializado com sucesso.");
    } catch (error) {
      console.error("[Firebase Admin] Erro fatal na inicialização:", error);
    }
  } else {
    const missing = [];
    if (!projectId) missing.push("FIREBASE_ADMIN_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_ADMIN_CLIENT_EMAIL");
    if (!privateKey) missing.push("FIREBASE_ADMIN_PRIVATE_KEY");
    
    if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) {
      console.error(`[Firebase Admin] ERRO: Variáveis de ambiente ausentes em PRODUÇÃO: ${missing.join(", ")}`);
    } else {
      console.warn(`[Firebase Admin] Aviso: Credenciais ausentes (${missing.join(", ")}). Pulando inicialização.`);
    }
  }
}

export const adminDb = admin.apps.length 
  ? admin.firestore() 
  : null as unknown as admin.firestore.Firestore;
