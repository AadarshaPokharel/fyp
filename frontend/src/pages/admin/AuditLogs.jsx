// src/pages/admin/AuditLogs.jsx
import { useState, useEffect, useCallback } from "react";
import { getAuditLogs } from "../../api";
import { formatAuditDetails } from "../../utils/audit";
import Spinner from "../../components/ui/Spinner";
import { Search, ChevronLeft, ChevronRight, User, Globe, Clock, ShieldCheck, Database } from "lucide-react";
import toast from "react-hot-toast";

const ACTION_META = (action) => {
  if (action.includes("delete") || action.includes("reject"))
    return { pill: "bg-red-500/10 text-red-400 border-red-500/20",     dot: "bg-red-500"     };
  if (action.includes("create") || action.includes("approve"))
    return { pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500" };
  if (action.includes("login") || action.includes("logout"))
    return { pill: "bg-blue-500/10 text-blue-400 border-blue-500/20",   dot: "bg-blue-500"    };
  return   { pill: "bg-slate-500/10 text-slate-400 border-slate-500/20", dot: "bg-slate-500"  };
};

export default function AuditLogs() {
  const [logs, setLogs]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState("");
  const limit = 20;

  const fetchLogs = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const { data } = await getAuditLogs({ limit, skip: (page - 1) * limit, search: query || undefined });
      setLogs(data.logs);
      setTotal(data.total);
    } catch { toast.error("Failed to load audit logs."); }
    finally  { setLoading(false); }
  }, [page]);

  useEffect(() => {
    const t = setTimeout(() => fetchLogs(search), 500);
    return () => clearTimeout(t);
  }, [search, fetchLogs]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-5 fade-up">

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <span className="font-bold text-slate-900 dark:text-white">{total}</span> total log entries
        </p>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by user or action…"
            className="input pl-9 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="py-20 flex justify-center"><Spinner size="lg" /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
                    {["User", "Action", "Details", "Verified · Time"].map((h, i) => (
                      <th key={h} className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                  {logs.length === 0 ? (
                    <tr><td colSpan={4} className="py-16 text-center text-slate-500 text-sm">No logs found.</td></tr>
                  ) : logs.map((log) => {
                    const meta = ACTION_META(log.action);
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group">
                        {/* User */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/30 flex items-center justify-center text-slate-400 flex-shrink-0">
                              <User size={13} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">@{log.username}</p>
                            </div>
                          </div>
                        </td>
                        {/* Action */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${meta.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                            {log.action.replaceAll("_", " ")}
                          </span>
                        </td>
                        {/* Details */}
                        <td className="px-5 py-4 max-w-xs">
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{formatAuditDetails(log)}</p>
                        </td>
                        {/* Time */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 mb-1">
                            <ShieldCheck size={11} /> Verified
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap">
                            <Clock size={10} />
                            {new Date(log.timestamp).toLocaleString(undefined, {
                              month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            <div className="px-5 py-4 border-t border-slate-200/60 dark:border-slate-800/50 flex items-center justify-between gap-4 bg-slate-50/40 dark:bg-slate-800/10">
              <p className="text-xs text-slate-500">
                Showing <strong className="text-slate-900 dark:text-white">{(page - 1) * limit + 1}</strong>
                –<strong className="text-slate-900 dark:text-white">{Math.min(page * limit, total)}</strong>
                {" "}of <strong className="text-slate-900 dark:text-white">{total}</strong>
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/40 text-slate-500
                             hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60
                             disabled:opacity-30 transition-all"
                ><ChevronLeft size={16} /></button>

                {[...Array(Math.min(5, totalPages))].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all
                      ${page === i + 1
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                        : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                      }`}
                  >{i + 1}</button>
                ))}

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/40 text-slate-500
                             hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60
                             disabled:opacity-30 transition-all"
                ><ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
