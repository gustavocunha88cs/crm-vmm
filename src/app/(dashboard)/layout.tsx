"use client";

import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/sidebar/Sidebar";
import { ChatProvider } from "@/contexts/ChatContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="dl-loading">
        <div className="dl-loading-mark">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M4 24 L14 4 L24 24" stroke="#4E6550" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M7.5 18 L20.5 18" stroke="#28352A" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="dl-spinner" />
        <style>{`
          .dl-loading {
            min-height: 100vh; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 20px;
            background: #E4E6DB; font-family: 'Syne', sans-serif;
          }
          .dl-loading-mark {
            width: 56px; height: 56px; border-radius: 14px;
            background: #28352A; display: flex;
            align-items: center; justify-content: center;
          }
          .dl-spinner {
            width: 28px; height: 28px;
            border: 3px solid rgba(78,101,80,.2);
            border-top-color: #4E6550; border-radius: 50%;
            animation: dlSpin .8s linear infinite;
          }
          @keyframes dlSpin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!user) return null;

  return (
    <ChatProvider>
      <div className="dl-root">
        <Sidebar />
        <main className="dl-main">
          <div className="dl-content">{children}</div>
        </main>
        <style>{`
          .dl-root { display: flex; min-height: 100vh; background: #E4E6DB; }
          .dl-main { flex: 1; overflow-y: auto; min-width: 0; }
          .dl-content { min-height: 100vh; }
        `}</style>
      </div>
    </ChatProvider>
  );
}
