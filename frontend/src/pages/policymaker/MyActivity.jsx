// src/pages/policymaker/MyActivity.jsx
import { useState, useEffect } from "react";
import { getMyAuditLogs } from "../../api";
import { formatAuditDetails } from "../../utils/audit";
import Spinner from "../../components/ui/Spinner";
import { ScrollText, Clock, ShieldCheck, Database, Key, LogIn, LogOut, Download, Brain } from "lucide-react";
import toast from "react-hot-toast";

const ACTION_META = (action) => {
  if (action.includes("login"))   return { icon: LogIn,      color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",    label: "Login"    };
  if (action.includes("logout"))  return { icon: LogOut,     color: "text-slate-400",   bg: "bg-slate-500/10 border-slate-500/20",  label: "Logout"   };
  if (action.includes("predict")) return { icon: Brain,      color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", label: "Predict" };
  if (action.includes("request")) return { icon: Download,   color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",  label: "Export"   };
  return                                   { icon: ShieldCheck, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20",  label: "Action"   };
};

export default function MyActivity() {
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getMyAuditLogs();
        setLogs(data.logs);
      } catch { toast.error("Failed to fetch activity logs."); }
      finally  { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-5 pb-10 fade-up">
      {/* ── Log feed ── */}
      <div className="card">
        {loading ? (
          <div className="py-20 flex justify-center"><Spinner size="lg" /></div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/30 flex items-center justify-center text-slate-400">
              <ScrollText size={20} />
            </div>
            <p className="text-slate-500 text-sm">No activity recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log, idx) => {
              const meta = ACTION_META(log.action);
              const Icon = meta.icon;
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3.5 p-4 rounded-xl
                             bg-slate-50/50 dark:bg-slate-800/20
                             border border-slate-200/60 dark:border-slate-800/40
                             hover:border-blue-500/20 transition-colors group"
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                    <Icon size={15} className={meta.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`text-[9px] font-black uppercase tracking-widest ${meta.color}`}>
                          {log.action.replaceAll("_", " ")}
                        </span>
                        <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-snug mt-0.5">
                          {formatAuditDetails(log)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800/60 px-2 py-1 rounded-lg whitespace-nowrap flex-shrink-0">
                        <Clock size={10} />
                        {new Date(log.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(log.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Disclaimer ── */}
      <div className="flex items-start gap-3 p-4 bg-slate-50/80 dark:bg-slate-800/20 border border-slate-200/60 dark:border-slate-800/40 rounded-xl">
        <ShieldCheck size={15} className="text-emerald-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          These logs are immutably recorded by the system for security and compliance purposes. They capture the precise time and origin of every action you take on the platform.
        </p>
      </div>
    </div>
  );
}
