"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LogoVMM } from "@/components/logo/LogoVMM";
import { apiFetch } from "@/lib/api";
import { useChat } from "@/contexts/ChatContext";

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    href:  "/dashboard",
    label: "Dashboard",
    icon:  <DashIcon />,
    exact: true,
  },
  {
    href:  "/leads",
    label: "Leads",
    icon:  <LeadsIcon />,
  },
  {
    href:  "/campanhas",
    label: "Campanhas",
    icon:  <CampIcon />,
  },
  {
    href:  "/whatsapp",
    label: "WhatsApp",
    icon:  <WAIcon />,
    badge: true, // shows connection status dot
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const pathname      = usePathname();
  const { user, logOut } = useAuth();
  const { unreadTotal } = useChat();
  const [collapsed, setCollapsed]   = useState(false);
  const [waStatus, setWaStatus]     = useState<"open"|"close"|"unknown">("unknown");
  const [loggingOut, setLoggingOut] = useState(false);

  // Poll WhatsApp status for the sidebar badge
  useEffect(() => {
    const check = async () => {
      try {
        const res  = await apiFetch("/api/whatsapp/status");
        const data = await res.json();
        setWaStatus(data.state === "open" ? "open" : data.state === "connecting" ? "unknown" : "close");
      } catch {
        setWaStatus("unknown");
      }
    };
    check();
    const t = setInterval(check, 30_000);

    // Call background worker manually since we don't have a real cron.
    const runWorker = async () => {
      try {
        await apiFetch("/api/cron/process-queue");
      } catch (e) {}
    };
    const queueInterval = setInterval(runWorker, 12000); // 12 segundos
    runWorker();

    return () => {
      clearInterval(t);
      clearInterval(queueInterval);
    };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await logOut();
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const waDotColor =
    waStatus === "open"    ? "#4CAF50" :
    waStatus === "unknown" ? "#F5A623" : "#e87070";

  return (
    <aside className={`sb-root ${collapsed ? "sb-root--collapsed" : ""}`}>
      {/* ── Logo area ── */}
      <div className="sb-logo-area">
        {!collapsed && (
          <div className="sb-logo">
            <div className="sb-logo-mark">
              <LogoVMM width="48" height="48" />
            </div>
            <div className="sb-logo-text">
              <span className="sb-logo-name">VMM CRM</span>
              <span className="sb-logo-sub">Agência VMM</span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="sb-logo-mark sb-logo-mark--center">
            <LogoVMM width="48" height="48" />
          </div>
        )}

        <button
          className="sb-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
            <path d="M10 3L5 8l5 5" stroke="rgba(228,230,219,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="sb-nav">
        {!collapsed && (
          <span className="sb-nav-label">Menu</span>
        )}
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sb-nav-item ${active ? "sb-nav-item--active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="sb-nav-icon">{item.icon}</span>
              {!collapsed && <span className="sb-nav-label-text">{item.label}</span>}

              {/* Chat Unread Badge */}
              {item.label === "Chat" && unreadTotal > 0 && (
                <span className={`sb-unread-badge ${collapsed ? "sb-unread-badge--collapsed" : ""}`}>
                  {unreadTotal}
                </span>
              )}

              {item.badge && !collapsed && (
                <span
                  className="sb-nav-dot"
                  style={{ background: waDotColor }}
                  title={`WhatsApp: ${waStatus === "open" ? "conectado" : waStatus === "unknown" ? "conectando" : "desconectado"}`}
                />
              )}
              {item.badge && collapsed && (
                <span
                  className="sb-nav-dot sb-nav-dot--collapsed"
                  style={{ background: waDotColor }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer: user + logout ── */}
      <div className="sb-footer">
        <div className={`sb-user ${collapsed ? "sb-user--collapsed" : ""}`}>
          <div className="sb-user-avatar">
            {user?.email?.charAt(0).toUpperCase() ?? "U"}
          </div>
          {!collapsed && (
            <div className="sb-user-info">
              <span className="sb-user-email" title={user?.email ?? ""}>
                {user?.email?.split("@")[0] ?? "Usuário"}
              </span>
              <span className="sb-user-role">Administrador</span>
            </div>
          )}
          <button
            className="sb-logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sair"
          >
            {loggingOut ? (
              <span className="sb-spinner" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3" stroke="rgba(228,230,219,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M7 11l3-3-3-3" stroke="rgba(228,230,219,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 8H3" stroke="rgba(228,230,219,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .sb-root {
          width: 240px; flex-shrink: 0;
          background: var(--p);
          display: flex; flex-direction: column;
          height: 100vh; position: sticky; top: 0;
          transition: width .25s cubic-bezier(.4,0,.2,1);
          overflow: hidden;
        }
        .sb-root--collapsed { width: 68px; }

        /* Logo */
        .sb-logo-area {
          padding: 20px 16px 16px;
          display: flex; align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(228,230,219,.06);
          flex-shrink: 0; min-height: 72px;
        }
        .sb-logo { display: flex; align-items: center; gap: 12px; overflow: hidden; }
        .sb-logo-mark {
          width: 60px; height: 60px; border-radius: 8px;
          background: var(--bg); color: var(--p);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .sb-logo-mark--center { margin: 0 auto; }
        .sb-logo-text { display: flex; flex-direction: column; overflow: hidden; }
        .sb-logo-name {
          font-size: 16px; font-weight: 800; color: #E4E6DB;
          white-space: nowrap; letter-spacing: -.01em;
        }
        .sb-logo-sub {
          font-size: 10px; color: rgba(228,230,219,.4);
          white-space: nowrap; letter-spacing: .04em;
        }
        .sb-collapse-btn {
          background: rgba(228,230,219,.06); border: none;
          width: 28px; height: 28px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: background .15s;
        }
        .sb-collapse-btn:hover { background: rgba(228,230,219,.12); }

        /* Nav */
        .sb-nav {
          flex: 1; padding: 16px 10px;
          display: flex; flex-direction: column; gap: 2px;
          overflow-y: auto;
        }
        .sb-nav > .sb-nav-label {
          font-size: 10px; font-weight: 700; letter-spacing: .1em;
          text-transform: uppercase; color: rgba(228,230,219,.25);
          padding: 0 6px; margin-bottom: 6px;
        }
        .sb-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 10px; border-radius: 8px;
          color: rgba(228,230,219,.55); font-size: 14px; font-weight: 600;
          text-decoration: none; transition: all .15s; position: relative;
          white-space: nowrap;
        }
        .sb-nav-item:hover {
          background: rgba(228,230,219,.07);
          color: rgba(228,230,219,.85);
        }
        .sb-nav-item--active {
          background: rgba(78,101,80,.35) !important;
          color: #E4E6DB !important;
        }
        .sb-nav-item--active::before {
          content: '';
          position: absolute; left: 0; top: 6px; bottom: 6px;
          width: 3px; background: #4E6550; border-radius: 0 2px 2px 0;
        }
        .sb-nav-icon {
          width: 20px; height: 20px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .sb-nav-label-text { flex: 1; }
        .sb-nav-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
        }
        .sb-nav-dot--collapsed {
          position: absolute; top: 6px; right: 6px;
          width: 7px; height: 7px;
        }

        /* Footer */
        .sb-footer { padding: 12px 10px 16px; flex-shrink: 0; }
        .sb-divider { height: 1px; background: rgba(228,230,219,.06); margin-bottom: 12px; }
        .sb-user {
          display: flex; align-items: center; gap: 9px;
          padding: 8px 6px; border-radius: 8px;
        }
        .sb-user--collapsed { justify-content: center; flex-direction: column; gap: 6px; }
        .sb-user-avatar {
          width: 32px; height: 32px; border-radius: 8px;
          background: rgba(78,101,80,.4); color: #E4E6DB;
          font-size: 13px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .sb-user-info { flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 1px; }
        .sb-user-email {
          font-size: 12px; font-weight: 700; color: rgba(228,230,219,.8);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sb-user-role { font-size: 10px; color: rgba(228,230,219,.35); }
        .sb-logout-btn {
          background: rgba(228,230,219,.06); border: none;
          width: 28px; height: 28px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background .15s; flex-shrink: 0;
        }
        .sb-logout-btn:hover { background: rgba(220,80,70,.2); }
        .sb-logout-btn:disabled { opacity: .5; cursor: not-allowed; }
        .sb-spinner {
          width: 12px; height: 12px;
          border: 2px solid rgba(228,230,219,.2);
          border-top-color: rgba(228,230,219,.6);
          border-radius: 50%;
          animation: sbSpin .8s linear infinite;
        }
        @keyframes sbSpin { to { transform: rotate(360deg); } }

        .sb-unread-badge {
          background: #4CAF50;
          color: white;
          font-size: 10px;
          font-weight: 800;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-left: auto;
        }
        .sb-unread-badge--collapsed {
          position: absolute;
          top: 6px;
          right: 6px;
          margin-left: 0;
          border: 1.5px solid var(--p);
          padding: 0;
          min-width: 16px;
          height: 16px;
        }
      `}</style>
    </aside>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function DashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1.5" y="1.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10.5" y="1.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1.5" y="10.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10.5" y="10.5" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function LeadsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 15.5c0-3.038 3.134-5.5 7-5.5s7 2.462 7 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M14.5 4.5h-11a2 2 0 00-2 2v6a2 2 0 002 2h9l3.5 2.5v-10.5a2 2 0 00-1.5-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}
function CampIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 6.5L14.5 2.5v13L3 11.5V6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M3 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 11.5l-1 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function WAIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
      <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
        <g transform="translate(-700.000000, -360.000000)" fill="currentColor">
          <path d="M723.993033,360 C710.762252,360 700,370.765287 700,383.999801 C700,389.248451 701.692661,394.116025 704.570026,398.066947 L701.579605,406.983798 L710.804449,404.035539 C714.598605,406.546975 719.126434,408 724.006967,408 C737.237748,408 748,397.234315 748,384.000199 C748,370.765685 737.237748,360.000398 724.006967,360.000398 L723.993033,360.000398 L723.993033,360 Z M717.29285,372.190836 C716.827488,371.07628 716.474784,371.034071 715.769774,371.005401 C715.529728,370.991464 715.262214,370.977527 714.96564,370.977527 C714.04845,370.977527 713.089462,371.245514 712.511043,371.838033 C711.806033,372.557577 710.056843,374.23638 710.056843,377.679202 C710.056843,381.122023 712.567571,384.451756 712.905944,384.917648 C713.258648,385.382743 717.800808,392.55031 724.853297,395.471492 C730.368379,397.757149 732.00491,397.545307 733.260074,397.27732 C735.093658,396.882308 737.393002,395.527239 737.971421,393.891043 C738.54984,392.25405 738.54984,390.857171 738.380255,390.560912 C738.211068,390.264652 737.745308,390.095816 737.040298,389.742615 C736.335288,389.389811 732.90737,387.696673 732.25849,387.470894 C731.623543,387.231179 731.017259,387.315995 730.537963,387.99333 C729.860819,388.938653 729.198006,389.89831 728.661785,390.476494 C728.238619,390.928051 727.547144,390.984595 726.969123,390.744481 C726.193254,390.420348 724.021298,389.657798 721.340985,387.273388 C719.267356,385.42535 717.856938,383.125756 717.448104,382.434484 C717.038871,381.729275 717.405907,381.319529 717.729948,380.938852 C718.082653,380.501232 718.421026,380.191036 718.77373,379.781688 C719.126434,379.372738 719.323884,379.160897 719.549599,378.681068 C719.789645,378.215575 719.62006,377.735746 719.450874,377.382942 C719.281687,377.030139 717.871269,373.587317 717.29285,372.190836 Z" />
        </g>
      </g>
    </svg>
  );
}
