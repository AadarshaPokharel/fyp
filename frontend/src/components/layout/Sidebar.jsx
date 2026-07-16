// src/components/layout/Sidebar.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { logout as apiLogout } from "../../api";
import toast from "react-hot-toast";
import {
  LayoutDashboard, Users, ClipboardList, LogOut,
  Activity, BarChart2, Brain, Download, ScrollText,
  User, Shield, ChevronRight, UserCheck
} from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";

const adminLinks = [
  { to: "/admin",               icon: LayoutDashboard, label: "Admin Panel"     },
  { to: "/admin/policy-makers", icon: Users,            label: "User Management" },
  { to: "/admin/audit-logs",    icon: ClipboardList,    label: "Audit Trail"    },
  { to: "/admin/downloads",     icon: Download,         label: "Global CSV List" },
  { to: "/admin/verification",  icon: UserCheck,        label: "Verification Requests" },
  { to: "/admin/policies",      icon: ScrollText,       label: "Policy Review" },
];

const pmLinks = [
  { to: "/dashboard",          icon: Activity,  label: "Live Monitor"       },
  { to: "/dashboard/analysis", icon: BarChart2, label: "Collision Analysis" },
  { to: "/dashboard/predict",  icon: Brain,     label: "ML Dashboard"       },
  { to: "/dashboard/policies", icon: ScrollText,label: "My Policies"        },
  { to: "/dashboard/requests", icon: Download,  label: "My CSV Requests"    },
];

export default function Sidebar({ isOpen, setIsOpen }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const sections = isAdmin 
    ? [
        { label: "Administration", links: adminLinks },
        { 
          label: "Dashboard View",   
          links: pmLinks.filter(link => link.to !== "/dashboard/requests")
        }
      ]
    : [
        { label: "Navigation",     links: pmLinks    }
      ];

  const handleLogout = async () => {
    try { await apiLogout(); } catch {}
    signOut();
    navigate("/login");
    toast.success("Logged out successfully");
  };



  return (
    <>
      {/* ── Mobile Backdrop ── */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        id="main-sidebar"
        className={`fixed inset-y-4 left-4 w-64 flex flex-col z-50 overflow-hidden rounded-2xl
                   bg-brandNeutral/80 dark:bg-dark-900/80 backdrop-blur-md shadow-soft transition-transform duration-300
                   ${isOpen ? "translate-x-0" : "-translate-x-[120%]"}`}
        aria-label="Sidebar Navigation"
      >


        {/* ── User Identity Card ── */}
        <div className="mx-3 mt-4 mb-2 px-3.5 py-3 rounded-xl bg-secondary-light/10 dark:bg-dark-800/40 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brandNeutral dark:bg-dark-700/60 shadow-inner overflow-hidden flex-shrink-0 relative">
              {user?.profile?.profile_picture ? (
                <img src={user.profile.profile_picture} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <User size={16} />
                </div>
              )}
              {/* Online dot */}
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0d1321] dot-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-tertiary-dark dark:text-brandNeutral truncate leading-tight">
                {user?.profile?.name || user?.username || "User"}
              </p>
              <span className={`mt-1 inline-flex items-center text-[9px] font-mono-tech font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shadow-soft
                ${isAdmin
                  ? "bg-tertiary/15 text-tertiary-dark dark:text-tertiary-light"
                  : "bg-primary/15 text-primary-dark dark:text-primary-light"
                }`}
              >
                {user?.role?.replace("_", " ")}
              </span>
            </div>
          </div>
        </div>

        {/* ── Navigation Sections ── */}
        <div className="flex-1 px-3 space-y-6 overflow-y-auto pb-4 custom-scrollbar">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <div className="px-2 pb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500/80 dark:text-slate-400/60">
                  {section.label}
                </p>
                {isAdmin && section.label === "Administration" && (
                  <Shield size={10} className="text-tertiary-light/40" />
                )}
              </div>
              
              <div className="space-y-0.5">
                {section.links.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/admin" || to === "/dashboard"}
                    onClick={() => setIsOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm
                      ${isActive
                        ? "bg-primary/10 text-primary-dark dark:text-primary-light shadow-soft"
                        : "text-tertiary dark:text-tertiary-light hover:text-tertiary-dark dark:hover:text-brandNeutral hover:bg-secondary/10 dark:hover:bg-dark-800/60"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          size={16}
                          className={`shrink-0 transition-colors ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"}`}
                        />
                        <span className="truncate flex-1">{label}</span>
                        {isActive && (
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Profile shortcut ── */}
        <div className="px-3 py-3 shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.2)] mt-auto z-10 bg-brandNeutral/50 dark:bg-dark-900/50 backdrop-blur-sm">
          <NavLink
            to="/profile"
            onClick={() => setIsOpen(false)}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm mb-1
              ${isActive
                ? "bg-primary/10 text-primary-dark dark:text-primary-light shadow-soft"
                : "text-tertiary dark:text-tertiary-light hover:text-tertiary-dark dark:hover:text-brandNeutral hover:bg-secondary/10 dark:hover:bg-dark-800/60"
              }`
            }
          >
            <User size={16} className="shrink-0 text-tertiary-light dark:text-tertiary group-hover:text-primary dark:group-hover:text-primary-light transition-colors" />
            <span>My Profile</span>
          </NavLink>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="group flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl
                       text-tertiary dark:text-tertiary-light hover:text-primary-dark dark:hover:text-primary-light hover:bg-primary/10 dark:hover:bg-primary/10
                       transition-all duration-200 font-medium text-sm"
          >
            <LogOut size={16} className="shrink-0 group-hover:-translate-x-0.5 transition-transform" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
