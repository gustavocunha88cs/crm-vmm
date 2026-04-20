export const dynamic = "force-dynamic";
export default function DebugPage() {
  const envVars = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Debug Env Vars</h1>
      <pre>{JSON.stringify(envVars, null, 2)}</pre>
    </div>
  );
}
