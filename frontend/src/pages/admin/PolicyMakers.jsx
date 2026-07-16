// src/pages/admin/PolicyMakers.jsx
import { useState, useEffect } from "react";
import { listUsers, createPolicyMaker, deleteUser, resendInvite, updateUser, resendAllInvites } from "../../api";
import Modal from "../../components/ui/Modal";
import Spinner from "../../components/ui/Spinner";
import { UserPlus, Trash2, Mail, RefreshCw, CheckCircle2, Edit2, Users } from "lucide-react";
import toast from "react-hot-toast";

export default function PolicyMakers() {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [isEditModalOpen,   setEditModalOpen]   = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [inviteName,  setInviteName]    = useState("");
  const [inviteEmail, setInviteEmail]   = useState("");
  const [inviting, setInviting]         = useState(false);
  const [resendingAll, setResendingAll] = useState(false);

  const fetchUsers = async () => {
    try {
      const { data } = await listUsers("policy_maker");
      setUsers(data);
    } catch { toast.error("Failed to load policy makers."); }
    finally  { setLoading(false); }
  };
  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      await createPolicyMaker(inviteName, inviteEmail);
      toast.success("Policy Maker invited successfully!");
      setInviteModalOpen(false);
      setInviteName(""); setInviteEmail("");
      fetchUsers();
    } catch (err) { toast.error(err.response?.data?.detail || "Invite failed."); }
    finally       { setInviting(false); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await updateUser(selectedUser.id, { name: selectedUser.name, email: selectedUser.email });
      toast.success("User updated.");
      setEditModalOpen(false);
      fetchUsers();
    } catch { toast.error("Update failed."); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(
      "CRITICAL ACTION: Are you sure you want to delete this Policy Maker account?\n\n" +
      "This action will permanently delete:\n" +
      "1. Their MongoDB User Account and Profile.\n" +
      "2. Their PM Verification Request and all uploaded image/PDF credentials from Cloudinary.\n" +
      "3. All Policies and final submission files they authored from Cloudinary.\n" +
      "4. All historical Download Requests and generated reports.\n\n" +
      "The user will be notified of this deletion via email and will be free to re-apply from scratch.\n" +
      "Are you sure you want to proceed?"
    )) return;
    try {
      await deleteUser(id);
      toast.success("User deleted and data purged successfully.");
      setUsers(users.filter((u) => u.id !== id));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete user.");
    }
  };

  const handleResend = async (id) => {
    try { await resendInvite(id); toast.success("Setup link resent."); }
    catch { toast.error("Resend failed."); }
  };

  const handleResendAll = async () => {
    const pending = users.filter((u) => !u.is_active).length;
    if (pending === 0) { toast.error("No pending invites to resend."); return; }
    if (!window.confirm(`Resend setup links to all ${pending} pending policy makers?`)) return;
    setResendingAll(true);
    try {
      const { data } = await resendAllInvites();
      toast.success(data.message || "Bulk invites queued.");
      fetchUsers();
    } catch { toast.error("Bulk resend failed."); }
    finally { setResendingAll(false); }
  };

  const active  = users.filter((u) => u.is_active).length;
  const pending = users.filter((u) => !u.is_active).length;

  return (
    <div className="space-y-5 fade-up">

      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Accounts", value: users.length, color: "border-blue-500",    icon: "bg-blue-500/10 border-blue-500/20 text-blue-400"    },
          { label: "Active",         value: active,        color: "border-emerald-500", icon: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
          { label: "Pending Invite", value: pending,       color: "border-amber-500",   icon: "bg-amber-500/10 border-amber-500/20 text-amber-400"  },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className={`card flex items-center gap-4 border-t-2 ${color}`}>
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${icon}`}>
              <Users size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{loading ? "—" : value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Actions bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{users.length} policy maker{users.length !== 1 ? "s" : ""} registered</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResendAll}
            disabled={resendingAll}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {resendingAll ? <Spinner size="sm" /> : <RefreshCw size={15} />}
            Resend All Pending
          </button>
          <button
            onClick={() => setInviteModalOpen(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <UserPlus size={15} />
            Invite Contributor
          </button>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="py-20 flex justify-center"><Spinner size="lg" /></div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center text-slate-500 text-sm">No policy makers found. Invite one to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
                  {["Name / Email", "Username", "Status", "Created", "Actions"].map((h, i) => (
                    <th key={h} className={`px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${i === 4 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/40">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group">
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{u.name || "—"}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-2 py-1 rounded-lg">@{u.username}</span>
                    </td>
                    <td className="px-5 py-4">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                          <CheckCircle2 size={11} /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                          <RefreshCw size={11} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setSelectedUser(u); setEditModalOpen(true); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                          title="Edit"
                        ><Edit2 size={14} /></button>
                        {!u.is_active && (
                          <button
                            onClick={() => handleResend(u.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                            title="Resend setup link"
                          ><RefreshCw size={14} /></button>
                        )}
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Delete"
                        ><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Invite Modal ── */}
      <Modal isOpen={isInviteModalOpen} onClose={() => setInviteModalOpen(false)} title="Invite Policy Maker">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
            <input type="text" required placeholder="Dr. Jane Smith" className="input"
              value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"><Mail size={15} /></span>
              <input type="email" required placeholder="jane.smith@example.com" className="input pl-10"
                value={inviteEmail} onChange={(e) => inviteEmail.length < 100 && setInviteEmail(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/30 rounded-xl p-3 leading-relaxed">
            An automated email with a secure password setup link will be sent to the address above.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setInviteModalOpen(false)} className="btn-secondary text-sm">Cancel</button>
            <button type="submit" disabled={inviting} className="btn-primary flex items-center gap-2 text-sm">
              {inviting ? <Spinner size="sm" /> : <><UserPlus size={14} /> Invite Policy Maker</>}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} title="Edit Policy Maker">
        {selectedUser && (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input type="text" required className="input"
                value={selectedUser.name || ""}
                onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
              <input type="email" required className="input"
                value={selectedUser.email || ""}
                onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditModalOpen(false)} className="btn-secondary text-sm">Cancel</button>
              <button type="submit" className="btn-primary text-sm">Save Changes</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
