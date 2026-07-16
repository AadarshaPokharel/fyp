import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, Plus, FileText, CheckCircle2, Clock, AlertCircle, RefreshCw, Archive, Edit3, Trash2, Send, Zap, Activity } from "lucide-react";
import api from "../../api";
import toast from "react-hot-toast";

export default function PMPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("proposals"); // proposals, implemented
  const navigate = useNavigate();

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

  const submitPolicy = async (id) => {
    try {
      await api.post(`/policies/${id}/submit`);
      toast.success("Policy submitted for review");
      fetchPolicies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit policy");
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'draft': return <Edit3 size={16} className="text-slate-500" />;
      case 'submitted': return <Clock size={16} className="text-blue-500" />;
      case 'under_review': return <RefreshCw size={16} className="text-purple-500 animate-spin-slow" />;
      case 'approved': return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'awaiting_final_submission': return <Send size={16} className="text-amber-500" />;
      case 'completed': return <Archive size={16} className="text-slate-700 dark:text-slate-300" />;
      case 'rejected': return <AlertCircle size={16} className="text-red-500" />;
      case 'revised': return <RefreshCw size={16} className="text-amber-500" />;
      case 'closed': return <Trash2 size={16} className="text-slate-400" />;
      default: return <FileText size={16} />;
    }
  };

  const getStatusBadge = (status) => {
    const labels = {
      draft: "Draft",
      submitted: "Submitted",
      under_review: "Under Review",
      approved: "Approved",
      awaiting_final_submission: "Awaiting Final Submission",
      completed: "Active & Implemented",
      rejected: "Revision Requested",
      revised: "Revised",
      closed: "Closed"
    };
    
    const colors = {
      draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
      submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      under_review: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      awaiting_final_submission: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      completed: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20",
      rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      revised: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      closed: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
    };

    return (
      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${colors[status] || colors.draft} flex items-center gap-1.5 w-fit`}>
        {getStatusIcon(status)}
        {labels[status] || status}
      </span>
    );
  };

  const proposals = policies.filter(p => !['completed', 'approved'].includes(p.status));
  const implemented = policies.filter(p => ['completed', 'approved'].includes(p.status));

  return (
    <div className="space-y-8 animate-in fade-in duration-500 p-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Policy Governance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Coordinate, draft, and track legislative IoT protocols</p>
        </div>
        <Link to="/dashboard/policies/new" className="btn-primary flex items-center gap-2 px-6 py-3 shadow-lg shadow-primary/20">
          <Plus size={20} />
          <span className="font-black uppercase tracking-widest text-xs">New Policy Proposal</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button 
          onClick={() => setActiveTab("proposals")}
          className={`px-8 py-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === "proposals" ? "text-primary" : "text-slate-400 hover:text-slate-600"}`}
        >
          My Proposals
          {activeTab === "proposals" && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab("implemented")}
          className={`px-8 py-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === "implemented" ? "text-primary" : "text-slate-400 hover:text-slate-600"}`}
        >
          Implemented Policies
          {activeTab === "implemented" && <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full" />}
        </button>
      </div>

      <div className="card p-0 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-dark-900 border-b border-slate-200 dark:border-slate-800">
                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Policy Architecture</th>
                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Deployment Domain</th>
                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Governance Status</th>
                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Last Sync</th>
                <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-20 text-center">
                    <RefreshCw className="mx-auto h-8 w-8 text-primary animate-spin mb-4" />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Synchronizing Database...</p>
                  </td>
                </tr>
              ) : (activeTab === "proposals" ? proposals : implemented).length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-20 text-center">
                    <div className="w-20 h-20 rounded-3xl bg-slate-50 dark:bg-dark-800 flex items-center justify-center mx-auto mb-6 text-slate-300">
                       <Zap size={32} />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Zero Protocols Found</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 mb-6">No records match the current governance filter.</p>
                    {activeTab === "proposals" && (
                      <Link to="/dashboard/policies/new" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5">
                        <Plus size={18} /> Initiate Proposal
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                (activeTab === "proposals" ? proposals : implemented).map((policy) => (
                  <tr key={policy.id} className="hover:bg-slate-50 dark:hover:bg-dark-800/20 transition-all group">
                    <td className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-dark-800 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                           <Activity size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white truncate max-w-[300px]">{policy.title || "Untitled Manifesto"}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{policy.region || "Global Protocol"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-5">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">
                        {policy.category || "General"}
                      </span>
                    </td>
                    <td className="p-5">
                      {getStatusBadge(policy.status)}
                    </td>
                    <td className="p-5">
                       <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{new Date(policy.updated_at).toLocaleDateString()}</p>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter italic">Last Interaction</p>
                       </div>
                    </td>
                    <td className="p-5 text-right space-x-2">
                      {['draft', 'rejected', 'revised'].includes(policy.status) && (
                        <Link to={`/dashboard/policies/${policy.id}/edit`} className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 px-4 py-2 rounded-xl transition-all border border-primary/20">
                          Edit
                        </Link>
                      )}
                      {['draft', 'revised'].includes(policy.status) && (
                        <button onClick={() => submitPolicy(policy.id)} className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-500 hover:text-white px-4 py-2 rounded-xl transition-all border border-emerald-500/20">
                          Submit
                        </button>
                      )}
                      {policy.status === 'awaiting_final_submission' && (
                        <Link to={`/dashboard/policies/${policy.id}/final`} className="text-[10px] font-black uppercase tracking-widest text-amber-600 hover:bg-amber-500 hover:text-white px-4 py-2 rounded-xl transition-all border border-amber-500/20">
                          Finalize
                        </Link>
                      )}
                      {['submitted', 'under_review', 'completed', 'approved', 'closed'].includes(policy.status) && (
                        <Link to={`/dashboard/policies/${policy.id}/view`} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-900 hover:text-white px-4 py-2 rounded-xl transition-all border border-slate-200 dark:border-slate-700 dark:hover:bg-white dark:hover:text-slate-900">
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
