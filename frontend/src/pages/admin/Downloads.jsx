// src/pages/admin/Downloads.jsx
import { useState, useEffect, useRef } from "react";
import { listDownloads, approveDownload, rejectDownload, cleanupExpiredDownloads } from "../../api";
import { StatusBadge } from "../../components/ui/RiskBadge";
import Spinner from "../../components/ui/Spinner";
import { Download, Check, X, ArrowRight, ShieldQuestion, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminDownloads() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  // Use a ref to track the previous pending count to avoid infinite loops in useEffect
  const prevPendingCount = useRef(0);

  const fetchRequests = async (isPoll = false) => {
    try {
      const { data } = await listDownloads();

      const newPendingCount = data.filter(r => r.status === "pending").length;

      // If polling and we find more pending requests than before, notify!
      if (isPoll && newPendingCount > prevPendingCount.current) {
        toast("New CSV download request received!", {
          icon: " ",
          duration: 6000,
          style: {
            borderRadius: "12px",
            background: "#333",
            color: "#fff",
          },
        });
      }

      prevPendingCount.current = newPendingCount;
      setRequests(data);
    } catch {
      if (!isPoll) toast.error("Failed to load download requests.");
    } finally {
      if (!isPoll) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Polling for new requests every 30 seconds (increased from 15 to reduce logs)
    const interval = setInterval(() => {
      fetchRequests(true);
    }, 30000);

    return () => clearInterval(interval);
  }, []); // Empty dependency array prevents the infinite loop

  const handleApprove = async (id) => {
    try {
      await approveDownload(id);
      toast.success("Request approved. File generation started.");
      fetchRequests();
    } catch { toast.error("Approval failed."); }
  };

  const handleReject = async (id) => {
    try {
      await rejectDownload(id);
      toast.success("Request rejected.");
      fetchRequests();
    } catch { toast.error("Rejection failed."); }
  };

  const handleDownload = async (id) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/downloads/${id}/file`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      if (!response.ok) throw new Error("Download failed");

      const { download_url } = await response.json();
      window.open(download_url, "_blank");
      toast.success("Download started.");
    } catch { toast.error("Failed to download file."); }
  };

  const handleCleanup = async () => {
    if (!window.confirm("This will permanently delete all expired CSV files from cloud storage. Continue?")) return;
    setCleaning(true);
    try {
      const result = await cleanupExpiredDownloads();
      toast.success(`Cleanup complete — ${result.cleaned} file(s) removed`);
      fetchRequests();
    } catch (err) {
      toast.error("Cleanup failed. Please try again.");
    } finally {
      setCleaning(false);
    }
  };

  const pending = requests.filter((r) => r.status === "pending").length;
  const approved = requests.filter((r) => r.status === "approved" || r.status === "ready").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;

  return (
    <div className="space-y-5 pb-10 fade-up">
      <div className="flex justify-end">
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600
                     hover:bg-red-100 border border-red-200 text-sm font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 size={16} />
          {cleaning ? "Cleaning..." : "Clean Up Expired"}
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Pending Review", value: pending, color: "border-amber-500", icon: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
          { label: "Approved", value: approved, color: "border-emerald-500", icon: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
          { label: "Rejected", value: rejected, color: "border-red-500", icon: "bg-red-500/10 border-red-500/20 text-red-400" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className={`card flex items-center gap-4 border-t-2 ${color}`}>
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${icon}`}>
              <Download size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{loading ? "—" : value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="py-20 flex justify-center"><Spinner size="lg" /></div>
        ) : requests.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/30 flex items-center justify-center text-slate-400">
              <ShieldQuestion size={22} />
            </div>
            <p className="text-slate-500 text-sm">No download requests in the system.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
                  {["Requester", "Date Range", "Status", "Submitted", "Actions"].map((h, i) => (
                    <th key={h} className={`px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${i === 4 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.user_name || "Policy Maker"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60 px-2 py-1 rounded-lg">
                          {new Date(r.date_from).toLocaleDateString()}
                        </span>
                        <ArrowRight size={12} className="text-slate-400" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/60 px-2 py-1 rounded-lg">
                          {new Date(r.date_to).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={r.status} />
                        {r.status === "ready" && (
                          <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">File ready</span>
                        )}
                        {r.status === "failed" && r.error && (
                          <span className="text-[9px] text-red-500 font-medium max-w-[120px] truncate" title={r.error}>{r.error}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "pending" ? (
                          <>
                            <button
                              onClick={() => handleReject(r.id)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="Reject"
                            ><X size={14} /></button>
                            <button
                              onClick={() => handleApprove(r.id)}
                              className="p-2 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                              title="Approve"
                            ><Check size={14} /></button>
                          </>
                        ) : r.status === "ready" ? (
                          <button
                            onClick={() => handleDownload(r.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider
                                       bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                          >
                            <Download size={12} /> Download
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest pr-2">
                            {r.status === "failed" ? "Failed" : "Handled"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
