// src/pages/admin/PMVerificationRequests.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { listVerificationRequests, approveInitialRequest, rejectInitialRequest } from "../../api";
import { StatusBadge } from "../../components/ui/RiskBadge";
import Spinner from "../../components/ui/Spinner";
import { 
  Users, Check, X, Eye, Clock, Mail, 
  ExternalLink, ShieldAlert, FileCheck 
} from "lucide-react";
import toast from "react-hot-toast";

export default function PMVerificationRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data } = await listVerificationRequests();
      setRequests(data);
    } catch {
      toast.error("Failed to load verification requests.");
    } finally {
      setLoading(false);
    }
  };

  const handleInitialApproval = async (id) => {
    if (!window.confirm("Approve initial request and send upload link?")) return;
    try {
      await approveInitialRequest(id);
      toast.success("Initial request approved!");
      fetchRequests();
    } catch {
      toast.error("Approval failed.");
    }
  };

  const handleInitialRejection = async (id) => {
    const reason = window.prompt("Enter rejection reason:");
    if (!reason) return;
    try {
      await rejectInitialRequest(id, reason);
      toast.success("Request rejected.");
      fetchRequests();
    } catch {
      toast.error("Rejection failed.");
    }
  };

  if (loading) return <div className="py-20 flex justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 fade-up pb-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6 flex items-center gap-4 border-t-2 border-blue-500">
          <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
            <Mail size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Initial Requests</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {requests.filter(r => r.status === "pending_initial_approval").length}
            </p>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-4 border-t-2 border-amber-500">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Awaiting Docs</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {requests.filter(r => r.status === "approved_initial").length}
            </p>
          </div>
        </div>
        <div className="card p-6 flex items-center gap-4 border-t-2 border-emerald-500">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
            <FileCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ready for Review</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {requests.filter(r => r.status === "credentials_submitted").length}
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Policy Maker</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Submission Date</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-dark-800 flex items-center justify-center text-slate-500">
                        <Users size={14} />
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{r.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {r.status === "pending_initial_approval" && (
                        <>
                          <button 
                            onClick={() => handleInitialRejection(r.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Reject Request"
                          >
                            <X size={16} />
                          </button>
                          <button 
                            onClick={() => handleInitialApproval(r.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 transition-all"
                            title="Approve & Send Link"
                          >
                            <Check size={16} />
                          </button>
                        </>
                      )}
                      
                      {r.status === "credentials_submitted" && (
                        <Link 
                          to={`/admin/verification/${r.id}`}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
                        >
                          <Eye size={12} />
                          Review Docs
                        </Link>
                      )}

                      {r.status === "approved_initial" && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-500/5 px-2 py-1 rounded-md border border-amber-500/10">
                          <Clock size={10} />
                          {r.resend_count > 0 ? `Resent ${r.resend_count}x` : "Awaiting Upload"}
                        </div>
                      )}

                      {["completed", "auto_rejected", "rejected_initial", "rejected_credentials"].includes(r.status) && (
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pr-2">Archived</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-40">
                      <ShieldAlert size={40} />
                      <p className="text-sm font-medium">No verification requests found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
