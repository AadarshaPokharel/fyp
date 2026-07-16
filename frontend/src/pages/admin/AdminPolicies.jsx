import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Shield, Search, FileText, CheckCircle2, Clock, AlertCircle, RefreshCw, Archive, Edit3, Trash2, Send, ChevronRight } from "lucide-react";
import api from "../../api";
import toast from "react-hot-toast";

export default function AdminPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      const { data } = await api.get("/policies/");
      setPolicies(data);
    } catch (err) {
      toast.error("Failed to fetch policies");
    } finally {
      setLoading(false);
    }
  };

  const deletePolicy = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/policies/${id}`);
      toast.success("Policy deleted permanently");
      setPolicies(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete policy");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'draft': return <Edit3 size={14} className="text-slate-500" />;
      case 'submitted': return <Clock size={14} className="text-blue-500" />;
      case 'under_review': return <RefreshCw size={14} className="text-purple-500" />;
      case 'approved': return <CheckCircle2 size={14} className="text-emerald-500" />;
      case 'awaiting_final_submission': return <Send size={14} className="text-amber-500" />;
      case 'completed': return <Archive size={14} className="text-slate-700 dark:text-slate-300" />;
      case 'rejected': return <AlertCircle size={14} className="text-red-500" />;
      case 'revised': return <RefreshCw size={14} className="text-amber-500" />;
      case 'closed': return <Trash2 size={14} className="text-slate-400" />;
      default: return <FileText size={14} />;
    }
  };

  const getStatusBadge = (status) => {
    const labels = {
      draft: "Draft",
      submitted: "Submitted",
      under_review: "Under Review",
      approved: "Approved",
      awaiting_final_submission: "Awaiting Final",
      completed: "Completed",
      rejected: "Rejected",
      revised: "Revised",
      closed: "Closed"
    };
    
    const colors = {
      draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
      submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
      under_review: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      awaiting_final_submission: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      completed: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
      rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      revised: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800",
      closed: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
    };

    return (
      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${colors[status] || colors.draft} flex items-center gap-1.5 w-fit`}>
        {getStatusIcon(status)}
        {labels[status] || status}
      </span>
    );
  };

  const filtered = policies.filter(p => {
    if (filter === "action_needed" && !["submitted", "revised"].includes(p.status)) return false;
    if (filter === "active" && ["draft", "closed", "completed", "rejected"].includes(p.status)) return false;
    if (filter === "completed" && p.status !== "completed") return false;
    
    if (search && !p.title?.toLowerCase().includes(search.toLowerCase()) && !p.region?.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Policy Review Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Review, approve, and manage policies proposed by operators.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white dark:bg-dark-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          {[
            { id: "all", label: "All Policies" },
            { id: "action_needed", label: "Action Needed" },
            { id: "active", label: "In Progress" },
            { id: "completed", label: "Completed" }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                filter === f.id 
                  ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900" 
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search policies..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Policy List */}
      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="card p-10 text-center text-slate-500">Loading policies...</div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center">
            <Shield className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No policies found</h3>
            <p className="text-sm text-slate-500 mt-1">There are no policies matching your current filters.</p>
          </div>
        ) : (
          filtered.map(policy => (
            <div key={policy.id} className="card p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors group flex flex-col md:flex-row md:items-center gap-4 border border-slate-200 dark:border-slate-800">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1.5">
                  {getStatusBadge(policy.status)}
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-50 dark:bg-slate-800 rounded">
                    {policy.category || "Uncategorized"}
                  </span>
                  {policy.revision_count > 0 && (
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 rounded">
                      Revision {policy.revision_count}/2
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">{policy.title || "Untitled Policy"}</h3>
                <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate max-w-[200px]">Region: {policy.region || "Not specified"}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                  <span>Updated: {new Date(policy.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="flex-shrink-0 flex items-center gap-2 justify-end">
                <button
                  onClick={() => setConfirmDeleteId(policy.id)}
                  disabled={deletingId === policy.id}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 transition-all disabled:opacity-50"
                  title="Delete policy"
                >
                  <Trash2 size={15} />
                </button>
                <Link 
                  to={`/admin/policies/${policy.id}`} 
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    ['submitted', 'revised'].includes(policy.status)
                      ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {['submitted', 'revised'].includes(policy.status) ? "Review Now" : "View Details"}
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-lg" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500 mb-4">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Delete Policy</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                This will permanently delete the policy <strong className="text-slate-700 dark:text-slate-300">"{policies.find(p => p.id === confirmDeleteId)?.title || 'Untitled'}"</strong> and all associated cloud documents. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deletePolicy(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingId === confirmDeleteId ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <><Trash2 size={16} /> Delete Forever</>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
