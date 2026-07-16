import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { updateProfile, getMyAuditSummary, getMyDownloadRequests } from "../api";
import api from "../api/axios";
import { User, Mail, Lock, Shield, Save, Camera, FileText, ImagePlus, CheckCircle2, Phone, Briefcase, Building, MapPin, LogIn, RefreshCw, Clock } from "lucide-react";
import toast from "react-hot-toast";

const getProfileCompletion = (user) => {
  if (!user) return { percent: 0, missing: [] };

  const profile = user.profile || {};
  const checks = [
    { key: "name", label: "Full name", done: !!profile.name },
    { key: "bio", label: "Bio", done: !!profile.bio },
    { key: "profile_picture", label: "Profile photo", done: !!profile.profile_picture },
    { key: "email", label: "Email address", done: !!user.email },
    { key: "department", label: "Department", done: !!profile.department },
    { key: "job_title", label: "Job title", done: !!profile.job_title },
    { key: "phone", label: "Phone number", done: !!profile.phone },
    { key: "location", label: "Location", done: !!profile.location },
  ];

  const done = checks.filter(c => c.done).length;
  const percent = Math.round((done / checks.length) * 100);
  const missing = checks.filter(c => !c.done).map(c => c.label);
  return { percent, missing, done, total: checks.length };
};

export default function Profile() {
  const { user, updateUserInfo } = useAuth();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: user?.profile?.name || user?.name || "",
    email: user?.email || "",
    bio: user?.profile?.bio || user?.bio || "",
    phone: user?.profile?.phone || "",
    department: user?.profile?.department || "",
    job_title: user?.profile?.job_title || "",
    location: user?.profile?.location || "",
  });

  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [activity, setActivity] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const completion = getProfileCompletion(user);

  const getDocUrl = (doc_id) => {
    if (!doc_id) return null;
    if (doc_id.startsWith("http")) return doc_id;
    return `${api.defaults.baseURL}/verification/files/${doc_id}`;
  };

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.profile?.name || user.name || "",
        email: user.email || "",
        bio: user.profile?.bio || user.bio || "",
        phone: user.profile?.phone || "",
        department: user.profile?.department || "",
        job_title: user.profile?.job_title || "",
        location: user.profile?.location || "",
      });
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === "policy_maker") return;

    const fetchActivity = async () => {
      try {
        const [logs, downloads] = await Promise.all([
          getMyAuditSummary(),
          getMyDownloadRequests()
        ]);

        const logList = logs?.logs || logs || [];
        const loginCount = logList.filter(l => l.action === "login").length;
        const profileUpdates = logList.filter(l => l.action === "profile_updated").length;
        const lastLogin = user?.last_login_at
          ? new Date(user.last_login_at).toLocaleDateString("en-US", {
            day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit"
          })
          : "Never";

        setActivity({
          loginCount,
          profileUpdates,
          csvRequests: Array.isArray(downloads) ? downloads.length : 0,
          lastLogin,
        });
      } catch {
        // silently fail
      }
    };
    fetchActivity();
  }, [user]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP images allowed");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
    setAvatarFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const updateData = new FormData();
    if (avatarFile) updateData.append("avatar", avatarFile);
    if (formData.name) updateData.append("name", formData.name);
    if (formData.bio) updateData.append("bio", formData.bio);
    if (formData.phone) updateData.append("phone", formData.phone);
    if (formData.department) updateData.append("department", formData.department);
    if (formData.job_title) updateData.append("job_title", formData.job_title);
    if (formData.location) updateData.append("location", formData.location);

    try {
      const { data } = await updateProfile(updateData);
      updateUserInfo(data);
      setAvatarPreview(null);
      setAvatarFile(null);
      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left column: Avatar & Bio Quick View (Only for non-Policy Makers) */}
        {user?.role !== "policy_maker" && (
          <div className="lg:col-span-4 space-y-6">
            <div className="card overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-dark-800 dark:to-dark-900 border-primary-500/10 group">
              <div className="relative h-32 bg-primary-500/10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>

              <div className="px-8 pb-8 -mt-16 text-center relative z-10 flex flex-col items-center">

                <div className="flex flex-col items-center gap-3">
                  <div
                    onClick={() => {
                      if (user?.role === "policy_maker") {
                        toast.error("Verified Policy Makers cannot change their profile picture.");
                        return;
                      }
                      fileInputRef.current?.click();
                    }}
                    className={`relative w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-dark-900 shadow-2xl transition-colors group/avatar ${
                      user?.role === "policy_maker" ? "cursor-not-allowed" : "cursor-pointer hover:border-primary-500/50"
                    }`}
                  >
                    {avatarPreview || user?.profile?.profile_picture ? (
                      <img
                        src={avatarPreview || user.profile.profile_picture}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary-500/10 text-primary-500 text-4xl font-bold">
                        {user?.username?.[0]?.toUpperCase() || "?"}
                      </div>
                    )}
                    {/* Hover overlay */}
                    {user?.role !== "policy_maker" && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100
                                      transition-opacity flex items-center justify-center">
                        <Camera size={24} className="text-white" />
                      </div>
                    )}
                  </div>
                  {avatarPreview && (
                    <p className="text-xs text-amber-600 font-medium">
                      Preview — save to upload
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>

                <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-4 tracking-tight uppercase">{user?.profile?.name || user?.username}</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">@{user?.username}</p>
                <p className="text-primary-600 dark:text-primary-400 text-sm font-bold mt-1 uppercase tracking-widest">{user?.profile?.job_title || "Operator"}</p>

                {user?.profile?.bio && (
                  <div className="mt-4 px-2 py-3 bg-white/50 dark:bg-dark-950/30 rounded-xl border border-slate-200/50 dark:border-white/5 italic text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                    "{user.profile.bio}"
                  </div>
                )}

                <div className="mt-6 w-full space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { icon: Building, value: user?.profile?.department, label: "Dept" },
                      { icon: MapPin, value: user?.profile?.location, label: "Location" },
                      { icon: Phone, value: user?.profile?.phone, label: "Contact" },
                    ].map((item, idx) => item.value && (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <item.icon size={12} className="text-primary-500" />
                        <span className="truncate">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Profile Completion
                      </span>
                      <span className="text-[10px] font-bold text-primary-500">
                        {completion.percent}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-dark-950 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${completion.percent}%`,
                          backgroundColor: completion.percent === 100
                            ? "#22c55e"
                            : completion.percent >= 60
                              ? "#f59e0b"
                              : "#B35C44"
                        }}
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {activity && (
              <div className="card p-6 bg-slate-50/50 dark:bg-dark-900/50">
                <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 mb-4 uppercase tracking-widest">
                  My Activity
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 p-3 rounded-xl bg-white dark:bg-dark-950 border border-slate-200 dark:border-white/5">
                    <LogIn size={14} className="text-blue-500 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Logins</p>
                    <p className="text-lg font-black text-slate-800 dark:text-white">{activity.loginCount}</p>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-xl bg-white dark:bg-dark-950 border border-slate-200 dark:border-white/5">
                    <RefreshCw size={14} className="text-amber-500 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Updates</p>
                    <p className="text-lg font-black text-slate-800 dark:text-white">{activity.profileUpdates}</p>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-xl bg-white dark:bg-dark-950 border border-slate-200 dark:border-white/5">
                    <FileText size={14} className="text-emerald-500 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Downloads</p>
                    <p className="text-lg font-black text-slate-800 dark:text-white">{activity.csvRequests}</p>
                  </div>
                  <div className="flex flex-col gap-1 p-3 rounded-xl bg-white dark:bg-dark-950 border border-slate-200 dark:border-white/5">
                    <Clock size={14} className="text-purple-500 mb-1" />
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Last Active</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight mt-0.5">{activity.lastLogin.split(', ')[0]}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right column */}
        <div className={user?.role === "policy_maker" ? "lg:col-span-12" : "lg:col-span-8"}>
          {user?.role === "policy_maker" ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-700">


              {/* Personal Details */}
              <div className="card p-6 border-slate-200 dark:border-white/5 bg-white/60 dark:bg-dark-900/60 backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 blur-[80px] pointer-events-none"></div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                    <User size={18} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Personal Records</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    { label: "Full Name", value: user?.profile?.personal?.full_name || user?.profile?.name || "N/A" },
                    { label: "Personal Identifier", value: user?.profile?.personal?.personal_number || "N/A" },
                    { label: "Citizenship Document No", value: user?.profile?.personal?.citizenship_no || "N/A" },
                    { label: "National ID No (NID)", value: user?.profile?.personal?.nid_number || "N/A" },
                    { label: "Contact Phone", value: user?.profile?.personal?.phone_number || user?.profile?.phone || "N/A" },
                    { label: "Primary Email Address", value: user?.profile?.personal?.email || user?.email || "N/A" },
                    { label: "Gender / Sex", value: user?.profile?.personal?.sex ? (user.profile.personal.sex.charAt(0).toUpperCase() + user.profile.personal.sex.slice(1)) : "N/A" },
                  ].map((field, idx) => (
                    <div key={idx} className="space-y-1 p-3 rounded-xl bg-slate-50/50 dark:bg-dark-950/20 border border-slate-200/50 dark:border-white/5">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">{field.label}</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{field.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Family Lineage */}
              <div className="card p-6 border-slate-200 dark:border-white/5 bg-white/60 dark:bg-dark-900/60 backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 blur-[80px] pointer-events-none"></div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20">
                    <Shield size={18} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Lineage & Family Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    { label: "Father's Full Name", value: user?.profile?.family?.father_name || "N/A" },
                    { label: "Father's Phone Number", value: user?.profile?.family?.father_phone || "N/A" },
                    { label: "Mother's Full Name", value: user?.profile?.family?.mother_name || "N/A" },
                    { label: "Mother's Phone Number", value: user?.profile?.family?.mother_phone || "N/A" },
                    { label: "Grandfather's Name", value: user?.profile?.family?.grandfather_name || "N/A" },
                    { label: "Grandmother's Name", value: user?.profile?.family?.grandmother_name || "N/A" },
                    { label: "Spouse Name", value: user?.profile?.family?.spouse_name || "N/A" },
                  ].map((field, idx) => (
                    <div key={idx} className="space-y-1 p-3 rounded-xl bg-slate-50/50 dark:bg-dark-950/20 border border-slate-200/50 dark:border-white/5">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">{field.label}</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{field.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Address Records */}
              <div className="card p-6 border-slate-200 dark:border-white/5 bg-white/60 dark:bg-dark-900/60 backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 blur-[80px] pointer-events-none"></div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                    <MapPin size={18} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Address Records</h3>
                </div>
                <div className="space-y-4">
                  {[
                    { label: "Current Posting Address", value: user?.profile?.address?.current_posting_address || "N/A" },
                    { label: "Permanent Living Address", value: user?.profile?.address?.permanent_living_address || "N/A" },
                    { label: "Temporary Living Address", value: user?.profile?.address?.temporary_living_address || "N/A" },
                  ].map((field, idx) => (
                    <div key={idx} className="space-y-1 p-3 rounded-xl bg-slate-50/50 dark:bg-dark-950/20 border border-slate-200/50 dark:border-white/5">
                      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">{field.label}</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{field.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Uploaded Documents */}
              {user?.profile?.documents && Object.keys(user.profile.documents).length > 0 && (
                <div className="card p-6 border-slate-200 dark:border-white/5 bg-white/60 dark:bg-dark-900/60 backdrop-blur-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 blur-[80px] pointer-events-none"></div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                      <FileText size={18} />
                    </div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Verification Documents</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { label: "Citizenship ID", key: "citizenship_pdf" },
                      { label: "Traffic / Employee ID", key: "traffic_id" },
                      { label: "Education Cert", key: "education_certificate" },
                      { label: "Health / Medical Cert", key: "health_certificate" },
                      { label: "Training Cert", key: "training_certificate" },
                    ].map((doc, idx) => {
                      const docId = user.profile.documents[doc.key];
                      if (!docId) return null;
                      
                      const url = getDocUrl(docId);
                      const isImage = /\.(jpeg|jpg|gif|png|webp)$/i.test(docId) || docId.startsWith("http");

                      return (
                        <div key={idx} className="space-y-2 p-3 rounded-xl bg-slate-50/50 dark:bg-dark-950/20 border border-slate-200/50 dark:border-white/5 flex flex-col justify-between">
                          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">{doc.label}</span>
                          <div className="mt-2 h-24 bg-slate-200 dark:bg-dark-800 rounded-lg overflow-hidden flex items-center justify-center group cursor-pointer" onClick={() => setSelectedDoc({ url, type: isImage ? 'image' : 'pdf', name: doc.label })}>
                            {isImage ? (
                              <img src={url} alt={doc.label} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-slate-400 group-hover:text-primary-500 transition-colors">
                                <FileText size={32} />
                                <span className="text-xs font-bold mt-2 uppercase tracking-widest">PDF</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card p-8 space-y-10 border-slate-200 dark:border-white/5 bg-white/60 dark:bg-dark-900/60 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>

              <div className="space-y-8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center text-primary-500 border border-primary-500/20">
                    <User size={18} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider">Identity Details</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Full Name</label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
                      <input
                        name="name" type="text" required
                        className="input pl-12 py-3.5 bg-slate-50 dark:bg-dark-950/50"
                        value={formData.name} onChange={handleChange}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Job Title</label>
                    <div className="relative group">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
                      <input
                        name="job_title" type="text"
                        className="input pl-12 py-3.5 bg-slate-50 dark:bg-dark-950/50"
                        value={formData.job_title} onChange={handleChange} placeholder=" "
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Department</label>
                    <div className="relative group">
                      <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
                      <input
                        name="department" type="text"
                        className="input pl-12 py-3.5 bg-slate-50 dark:bg-dark-950/50"
                        value={formData.department} onChange={handleChange} placeholder=" "
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Phone Number</label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
                      <input
                        name="phone" type="text"
                        className="input pl-12 py-3.5 bg-slate-50 dark:bg-dark-950/50"
                        value={formData.phone} onChange={handleChange} placeholder=" "
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Location / Office</label>
                    <div className="relative group">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
                      <input
                        name="location" type="text"
                        className="input pl-12 py-3.5 bg-slate-50 dark:bg-dark-950/50"
                        value={formData.location} onChange={handleChange} placeholder=" "
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Biography / About Me</label>
                  <div className="relative group">
                    <FileText className="absolute left-4 top-4 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
                    <textarea
                      name="bio" rows={4}
                      className="input pl-12 py-3.5 min-h-[120px] resize-none bg-slate-50 dark:bg-dark-950/50"
                      placeholder=" "
                      value={formData.bio} onChange={handleChange}
                    />
                    <div className="absolute bottom-3 right-4 text-[10px] font-bold text-slate-600">
                      {formData.bio.length} / 500
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex items-center gap-3 px-10 py-4 text-sm font-black uppercase tracking-widest shadow-2xl shadow-primary-900/40 hover:shadow-primary-500/20 hover:-translate-y-1 transition-all disabled:opacity-50 disabled:translate-y-0"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-slate-300 dark:border-white/30 border-t-slate-800 dark:border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save size={20} />
                      Save Profile
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Document Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedDoc(null)}>
          <div className="bg-white dark:bg-[#080d14] w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-dark-900/50">
              <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider">{selectedDoc.name}</h3>
              <div className="flex gap-2">
                {/* Download / Open in New Tab has been restricted for Policy Makers */}
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-dark-800 text-slate-500 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-[#05080c] relative overflow-hidden flex items-center justify-center">
              {selectedDoc.type === 'pdf' ? (
                <iframe src={selectedDoc.url} className="w-full h-full absolute inset-0 border-none" title={selectedDoc.name} />
              ) : (
                <img src={selectedDoc.url} alt={selectedDoc.name} className="max-w-full max-h-full object-contain p-4" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
