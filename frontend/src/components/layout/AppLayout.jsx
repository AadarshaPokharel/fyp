import { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, Bell, Search, LayoutDashboard, Users, ClipboardList, Download, UserCheck, ScrollText, Activity, BarChart2, Brain, User } from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import { useAuth } from "../../context/AuthContext";
import api, { listVerificationRequests } from "../../api";

const NAV_ITEMS = [
  { to: "/admin", icon: LayoutDashboard, label: "Admin Panel", desc: "System overview & stats" },
  { to: "/admin/policy-makers", icon: Users, label: "User Management", desc: "Manage policy maker accounts" },
  { to: "/admin/audit-logs", icon: ClipboardList, label: "Audit Trail", desc: "Track administrative actions" },
  { to: "/admin/downloads", icon: Download, label: "Global CSV List", desc: "Review data export requests" },
  { to: "/admin/verification", icon: UserCheck, label: "Verification Requests", desc: "Review PM registrations" },
  { to: "/admin/policies", icon: ScrollText, label: "Policy Review", desc: "Review submitted policies" },
  { to: "/dashboard", icon: Activity, label: "Live Monitor", desc: "Real-time IoT telemetry" },
  { to: "/dashboard/analysis", icon: BarChart2, label: "Collision Analysis", desc: "Historical risk patterns" },
  { to: "/dashboard/predict", icon: Brain, label: "ML Dashboard", desc: "ML-powered risk simulation" },
  { to: "/profile", icon: User, label: "My Profile", desc: "Account & preferences" },
];

// Derive a readable page title from the current path
function usePageMeta() {
  const { pathname } = useLocation();
  const map = {
    "/admin":               { title: "Admin Dashboard",     sub: "Full-spectrum oversight of the IoT network"     },
    "/admin/policy-makers": { title: "Policy Makers",       sub: "Manage and provision policy maker accounts"     },
    "/admin/audit-logs":    { title: "Audit Logs",          sub: "Track all administrative actions"               },
    "/admin/downloads":     { title: "CSV Requests",        sub: "Review and process data export requests"        },
    "/admin/verification":  { title: "Verification Requests", sub: "Review Policy Maker registration requests"      },
    "/dashboard":           { title: "Live Monitor",        sub: "Real-time IoT telemetry from edge nodes"        },
    "/dashboard/analysis":  { title: "Collision Analysis",  sub: "Historical risk patterns and trend data"        },
    "/dashboard/predict":   { title: "ML Dashboard",        sub: "ML-powered collision risk simulation"           },
    "/dashboard/requests":  { title: "CSV Requests",        sub: "Request and download sensor data exports"       },
    "/dashboard/activity":  { title: "My Activity",         sub: "Personal audit trail and request history"      },
    "/profile":             { title: "My Profile",          sub: "Manage your account and preferences"           },
  };
  return map[pathname] || { title: "CollisionGuard", sub: "" };
}

export default function AppLayout() {
  const { title, sub } = usePageMeta();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const searchRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const isAdmin = user?.role === "admin";

  // Dismissals are no longer tracked persistently so notifications remain visible while action is required.
  const dismissNotif = (notif) => {
    // Optionally close the dropdown or do nothing, since we want them to persist.
    setIsNotifOpen(false);
  };

  const filteredNavItems = NAV_ITEMS.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return false;
    const saved = localStorage.getItem("sidebarOpen");
    if (saved !== null) return saved === "true";
    return true;
  });

  useEffect(() => {
    localStorage.setItem("sidebarOpen", isSidebarOpen);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (isAdmin) {
      const fetchNotifications = async () => {
        try {
          const [verifRes, downloadRes, policyRes] = await Promise.all([
            listVerificationRequests(),
            api.get("/downloads/"),
            api.get("/policies/")
          ]);

          const items = [];

          // 1. Pending Verification Reviews
          const pendingVerifs = verifRes.data.filter(r => 
            r.status === "pending_initial_approval" || r.status === "credentials_submitted"
          );
          if (pendingVerifs.length > 0) {
            items.push({
              id: "verification",
              title: "Verification Reviews",
              desc: `You have ${pendingVerifs.length} policy maker${pendingVerifs.length > 1 ? "s" : ""} waiting for credential review.`,
              to: "/admin/verification",
              count: pendingVerifs.length
            });
          }

          // 2. Pending CSV Data Export Requests
          const pendingDownloads = downloadRes.data.filter(r => r.status === "pending");
          if (pendingDownloads.length > 0) {
            items.push({
              id: "downloads",
              title: "Pending CSV Requests",
              desc: `You have ${pendingDownloads.length} data export request${pendingDownloads.length > 1 ? "s" : ""} waiting for approval.`,
              to: "/admin/downloads",
              count: pendingDownloads.length
            });
          }

          // 3. Pending Policy Reviews
          const pendingPolicies = policyRes.data.filter(p => ['submitted', 'under_review', 'revised'].includes(p.status));
          if (pendingPolicies.length > 0) {
            items.push({
              id: "policies",
              title: "Policies Pending Review",
              desc: `You have ${pendingPolicies.length} policy document${pendingPolicies.length > 1 ? "s" : ""} waiting for your review.`,
              to: "/admin/policies",
              count: pendingPolicies.length
            });
          }

          // Do not filter by dismissedKeys, always show pending actions
          setNotifications(items);
        } catch (err) {
          console.error("Failed to load admin notifications:", err);
        }
      };

      fetchNotifications();
      // Poll notifications every 10 seconds for real-time updates
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    } else if (user?.role === "policy_maker") {
      // Policy maker: notify about admin responses to their policies and CSV requests
      const fetchPMNotifications = async () => {
        try {
          const [policyRes, downloadRes] = await Promise.all([
            api.get("/policies/"),
            api.get("/downloads/")
          ]);
          const items = [];

          // ── Policy response notifications ──
          const approvedPolicies = policyRes.data.filter(p => p.status === "awaiting_final_submission");
          if (approvedPolicies.length > 0) {
            items.push({
              id: "approved",
              title: "Policy Approved",
              desc: `${approvedPolicies.length} of your polic${approvedPolicies.length > 1 ? "ies have" : "y has"} been approved by the admin. Please upload the final document.`,
              to: "/dashboard/policies",
              count: approvedPolicies.length,
              color: "bg-emerald-500"
            });
          }

          const revisionPolicies = policyRes.data.filter(p => p.status === "rejected");
          if (revisionPolicies.length > 0) {
            items.push({
              id: "revision",
              title: "Revision Required",
              desc: `${revisionPolicies.length} polic${revisionPolicies.length > 1 ? "ies require" : "y requires"} revision based on admin feedback.`,
              to: "/dashboard/policies",
              count: revisionPolicies.length,
              color: "bg-amber-500"
            });
          }

          const closedPolicies = policyRes.data.filter(p => p.status === "closed");
          if (closedPolicies.length > 0) {
            items.push({
              id: "closed",
              title: "Policy Closed",
              desc: `${closedPolicies.length} of your polic${closedPolicies.length > 1 ? "ies have" : "y has"} been closed by the admin.`,
              to: "/dashboard/policies",
              count: closedPolicies.length,
              color: "bg-slate-500"
            });
          }

          // ── CSV download request notifications ──
          const approvedDownloads = downloadRes.data.filter(r => r.status === "approved");
          if (approvedDownloads.length > 0) {
            items.push({
              id: "csv-approved",
              title: "CSV Request Approved",
              desc: `${approvedDownloads.length} of your CSV export request${approvedDownloads.length > 1 ? "s have" : " has"} been approved.`,
              to: "/dashboard/requests",
              count: approvedDownloads.length,
              color: "bg-emerald-500"
            });
          }

          const readyDownloads = downloadRes.data.filter(r => r.status === "ready");
          if (readyDownloads.length > 0) {
            items.push({
              id: "csv-ready",
              title: "CSV Ready to Download",
              desc: `${readyDownloads.length} CSV file${readyDownloads.length > 1 ? "s are" : " is"} ready. Go to CSV Requests to download.`,
              to: "/dashboard/requests",
              count: readyDownloads.length,
              color: "bg-primary-500"
            });
          }

          const rejectedDownloads = downloadRes.data.filter(r => r.status === "rejected");
          if (rejectedDownloads.length > 0) {
            items.push({
              id: "csv-rejected",
              title: "CSV Request Rejected",
              desc: `${rejectedDownloads.length} of your CSV export request${rejectedDownloads.length > 1 ? "s have" : " has"} been rejected by the admin.`,
              to: "/dashboard/requests",
              count: rejectedDownloads.length,
              color: "bg-red-500"
            });
          }

          // Do not filter by dismissedKeys, always show pending actions
          setNotifications(items);
        } catch (err) {
          console.error("Failed to load PM notifications:", err);
        }
      };

      fetchPMNotifications();
      const interval = setInterval(fetchPMNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, [user, isAdmin]);

  const totalPendingCount = notifications.reduce((acc, item) => acc + item.count, 0);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#080d14]">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className={`flex-1 w-full flex flex-col min-h-screen transition-all duration-300 min-w-0 ${isSidebarOpen ? 'lg:pl-[18rem]' : 'pl-0'}`}>
        {/* ── Top header bar ── */}
        <header className="sticky top-0 z-40 px-4 sm:px-8 py-4 flex items-center justify-between
                           bg-brandNeutral/80 dark:bg-dark-950/80 backdrop-blur-md shadow-soft">
          <div className="flex items-center gap-3">
            <button 
              className="p-2 -ml-2 text-tertiary-light hover:text-tertiary-dark dark:hover:text-brandNeutral transition-colors focus:ring-2 focus:ring-primary rounded-lg outline-none"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
              aria-expanded={isSidebarOpen}
              aria-controls="main-sidebar"
            >
              <Menu size={22} />
            </button>
            <div>
              <h1 className="text-2xl font-heading text-tertiary-dark dark:text-brandNeutral leading-tight">{title}</h1>
              {sub && <p className="text-xs text-secondary-dark dark:text-secondary-light mt-0.5 hidden sm:block">{sub}</p>}
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-3">
            {/* Search bar */}
            {isAdmin && (
              <div className="relative hidden sm:block" ref={searchRef}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 hover:border-slate-300 dark:hover:border-dark-600 transition-colors w-56">
                  <Search size={15} className="text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none"
                  />
                </div>

                {isSearchFocused && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="max-h-80 overflow-y-auto">
                      {filteredNavItems.length > 0 ? (
                        filteredNavItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.to}
                              onMouseDown={() => {
                                navigate(item.to);
                                setSearchQuery("");
                                setIsSearchFocused(false);
                              }}
                              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-700/50 cursor-pointer transition-colors border-b border-slate-50 dark:border-dark-700 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-dark-700 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                <Icon size={16} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 dark:text-white">{item.label}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.desc}</p>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                          No matching dashboards found.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <ThemeToggle />
            
            <div className="relative" ref={notifRef}>
              <button 
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative p-2 text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors focus:outline-none rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800"
              >
                <Bell size={20} />
                {totalPendingCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {totalPendingCount}
                  </span>
                )}
              </button>
              
              {isNotifOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-slate-100 dark:border-dark-700">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-widest">Notifications</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-dark-700">
                    {notifications.length > 0 ? (
                      notifications.map(notif => (
                        <div 
                          key={notif.id}
                          onClick={() => {
                            dismissNotif(notif);
                            setIsNotifOpen(false);
                            navigate(notif.to);
                          }}
                          className="p-4 hover:bg-slate-50 dark:hover:bg-dark-700/50 cursor-pointer transition-colors"
                        >
                          <p className="text-sm font-bold text-slate-800 dark:text-white mb-1 flex items-center justify-between">
                            {notif.title}
                            <span className={`${notif.color || "bg-red-500"} text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold`}>
                              {notif.count}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">{notif.desc}</p>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        No new notifications.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Page content ── */}
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto fade-up flex justify-center">
          <main className="w-full max-w-[1440px]">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
