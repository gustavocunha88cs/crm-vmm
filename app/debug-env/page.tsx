export const dynamic = "force-dynamic";

export default function DebugPage() {
  const envVars = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "DEFINED (starts with " + process.env.NEXT_PUBLIC_FIREBASE_API_KEY.slice(0, 5) + "...)" : "MISSING",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? "DEFINED" : "MISSING",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? "DEFINED" : "MISSING",
  };

  console.log("Debug Env Vars (Server Side):", envVars);

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>Debug Env Vars</h1>
      <p>Este teste verifica se as variáveis NEXT_PUBLIC estão chegando ao navegador.</p>
      <pre style={{ background: '#eee', padding: 10 }}>
        {JSON.stringify(envVars, null, 2)}
      </pre>
      <p>Se aparecer "MISSING", as variáveis não foram passadas durante o build do Railway.</p>
    </div>
  );
}
