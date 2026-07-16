// src/pages/policymaker/CSVRequests.jsx
import { useState, useEffect } from "react";
import { createDownloadRequest, listDownloads } from "../../api";
import { StatusBadge } from "../../components/ui/RiskBadge";
import Spinner from "../../components/ui/Spinner";
import { Download, Calendar, Database, ShieldCheck, AlertCircle, ArrowRight, Plus } from "lucide-react";
import toast from "react-hot-toast";

export default function CSVRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const fetchMyRequests = async () => {
    try {
      const { data } = await listDownloads();
      setRequests(data);
    } catch { toast.error("Failed to load your download requests."); }
    finally  { setLoading(false); }
  };
  useEffect(() => { fetchMyRequests(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dateFrom || !dateTo) { toast.error("Please select both dates."); return; }
    setSubmitting(true);
    try {
      await createDownloadRequest(dateFrom, dateTo);
      toast.success("Download request submitted to administrator.");
      setDateFrom(""); setDateTo("");
      fetchMyRequests();
    } catch (err) { toast.error(err.response?.data?.detail || "Request failed."); }
    finally       { setSubmitting(false); }
  };

  const handleDownload = async (id) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/downloads/${id}/file`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      if (!response.ok) throw new Error("Download failed");
      
      const { download_url } = await response.json();
      
      // We use a link with target="_blank" and download attribute for best compatibility
      const a = document.createElement("a");
      a.href = download_url;
      a.target = "_blank";
      // Note: download attribute only works for same-origin or with specific headers, 
      // but target="_blank" will at least open the file/start download in most browsers.
      a.download = `IoT_Export_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      toast.success("Download started.");
    } catch { toast.error("Failed to download file."); }
  };


  return (
    <div className="space-y-5 pb-10 fade-up">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Request form ── */}
        <div className="card h-fit">
          <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Plus size={16} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">New Export Request</h2>
              <p className="text-xs text-slate-500 mt-0.5">Select a date range for your CSV</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: "Date From", value: dateFrom, onChange: setDateFrom },
              { label: "Date To",   value: dateTo,   onChange: setDateTo   },
            ].map(({ label, value, onChange }) => (
              <div key={label}>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"><Calendar size={14} /></span>
                  <input
                    type="date" className="input pl-9 text-sm" required
                    value={value} onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              </div>
            ))}

            {/* Info note */}
            <div className="flex gap-2.5 p-3.5 bg-blue-500/5 border border-blue-500/10 rounded-xl">
              <ShieldCheck size={14} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Requests require admin approval. Once approved, files are available for 7 days.
              </p>
            </div>

            <button
              type="submit" disabled={submitting}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-2.5"
            >
              {submitting ? <Spinner size="sm" /> : <><Database size={14} /> Submit Request</>}
            </button>
          </form>
        </div>

        {/* ── History ── */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/30 flex items-center justify-center">
              <Database size={15} className="text-slate-400" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Request History</h2>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center"><Spinner size="lg" /></div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center gap-3 border border-dashed border-slate-300 dark:border-slate-700/40 rounded-xl bg-slate-50/50 dark:bg-slate-800/10">
              <AlertCircle size={28} className="text-slate-300 dark:text-slate-700" />
              <p className="text-slate-500 text-sm font-medium">No export requests yet.</p>
              <p className="text-slate-400 text-xs">Fill out the form to request your first CSV export.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4
                             bg-slate-50/50 dark:bg-slate-800/20 border border-slate-200/60 dark:border-slate-800/40
                             rounded-xl hover:border-blue-500/20 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/30 flex items-center justify-center text-slate-400 flex-shrink-0">
                      <Database size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {new Date(r.date_from).toLocaleDateString()}
                        <ArrowRight size={11} className="text-slate-400" />
                        {new Date(r.date_to).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Submitted</p>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                        {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {r.status === "ready" && (
                      <button
                        onClick={() => handleDownload(r.id)}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold
                                   bg-emerald-500/10 text-emerald-500 border border-emerald-500/20
                                   hover:bg-emerald-500/20 transition-all"
                        title="Download CSV"
                      >
                        <Download size={13} /> Download
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
