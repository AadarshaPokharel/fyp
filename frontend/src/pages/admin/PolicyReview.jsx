import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, FileText, 
  Download, BarChart3, RefreshCw, Compass, Info, FileUp, Eye, Clock, Trash2,
  MapPin, Calendar, Upload, Tag, X
} from "lucide-react";
import api from "../../api";
import toast from "react-hot-toast";

// PDF viewer is handled via iframe to avoid pdfjs version conflicts

// defaultLayoutPluginInstance will be initialized inside the component

const getRegionAccidents = (regionName) => {
  if (!regionName) return { total: 0, monthly: [0, 0, 0, 0, 0, 0], risk: "low" };
  const code = regionName.toLowerCase().trim();
  let total = 24;
  let monthly = [3, 4, 2, 5, 4, 6];
  let risk = "medium";
  
  if (code.includes("sector 7") || code.includes("7")) {
    total = 45;
    monthly = [8, 7, 9, 6, 8, 7];
    risk = "high";
  } else if (code.includes("highway") || code.includes("expressway")) {
    total = 112;
    monthly = [18, 22, 15, 20, 19, 18];
    risk = "high";
  } else if (code.includes("sector 2") || code.includes("2") || code.includes("residential")) {
    total = 8;
    monthly = [1, 2, 0, 1, 2, 2];
    risk = "low";
  } else {
    total = (code.length * 7) % 80 + 5;
    const avg = Math.max(Math.round(total / 6), 1);
    monthly = [avg - 1 >= 0 ? avg - 1 : 0, avg + 1, avg, avg - 2 >= 0 ? avg - 2 : 0, avg + 2, avg];
    risk = total > 40 ? "high" : total > 15 ? "medium" : "low";
  }
  return { total, monthly, risk };
};

const steps = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "approved", label: "Approved" },
  { key: "awaiting_final_submission", label: "Final submission" },
  { key: "completed", label: "Completed" }
];

function buildPolicyPDFContent(policy, urls) {
  let attachmentsHtml = '';
  const getImgUrl = (doc) => doc?.image_preview || doc?.preview;
  
  if (urls?.supporting?.preview) {
    attachmentsHtml += `
      <div style="page-break-before: always; margin-top: 40px; text-align: center;">
        <div class="section-title" style="margin-bottom: 20px; font-size: 14px;">Supporting Document (Attachment)</div>
        <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 10px; background: #f8fafc; height: 1000px;">
          <img src="${getImgUrl(urls.supporting)}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;" />
        </div>
      </div>
    `;
  }

  if (urls?.final?.preview) {
    attachmentsHtml += `
      <div style="page-break-before: always; margin-top: 40px; text-align: center;">
        <div class="section-title" style="margin-bottom: 20px; font-size: 14px;">Final Implementation Document (Attachment)</div>
        <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 10px; background: #f8fafc; height: 1000px;">
          <img src="${getImgUrl(urls.final)}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;" />
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>Policy Document - ${policy.title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; padding: 40px; }
        .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .title { font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 8px; }
        .subtitle { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .field { margin-bottom: 16px; }
        .field label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 4px; }
        .field p { font-size: 14px; font-weight: 500; color: #1e293b; line-height: 1.6; }
        .impact { background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #334155; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${policy.title || 'Untitled Policy'}</div>
        <div class="subtitle">Policy ID: ${policy.id} &nbsp;|&nbsp; Status: ${policy.status.toUpperCase()}</div>
      </div>

      <div class="section">
        <div class="section-title">Policy Metadata</div>
        <div class="grid">
          <div class="field"><label>Category</label><p>${policy.category || "—"}</p></div>
          <div class="field"><label>Target Region</label><p>${policy.region || "—"}</p></div>
          <div class="field"><label>Effective Date</label><p>${policy.effective_date || "—"}</p></div>
          <div class="field"><label>Duration</label><p>${policy.duration ? policy.duration + ' ' + policy.duration_unit : "—"}</p></div>
          <div class="field"><label>Revision Count</label><p>${policy.revision_count}</p></div>
          <div class="field"><label>Created At</label><p>${new Date(policy.created_at).toLocaleDateString()}</p></div>
        </div>
      </div>

      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">Impact Statement & Outcomes</div>
        <div class="impact">${policy.impact || "—"}</div>
      </div>

      <div class="footer">
        <span>Generated by CollisionGuard System</span>
        <span>${new Date().toLocaleDateString()}</span>
      </div>

      ${attachmentsHtml}
    </body>
    </html>
  `;
}

export default function PolicyReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // PDF preview uses iframe — no plugin needed

  
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(""); 
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [urls, setUrls] = useState({
    final: null,
    supporting: null
  });
  const [previewDoc, setPreviewDoc] = useState(null);

  // New Data States
  const [maker, setMaker] = useState(null);
  const [allPolicies, setAllPolicies] = useState([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);

  useEffect(() => {
    fetchPolicy();
    fetchAllPolicies();
  }, [id]);

  const fetchAllPolicies = async () => {
    try {
      const { data } = await api.get("/policies/");
      setAllPolicies(data);
    } catch (err) {
      console.error("Failed to fetch all policies", err);
    }
  };

  const fetchMaker = async (ownerId) => {
    try {
      const { data } = await api.get(`/users/${ownerId}`);
      setMaker(data);
    } catch (err) {
      console.error("Failed to fetch policy maker details", err);
    }
  };

  const downloadPolicyPDF = () => {
    if (!policy) return;
    const content = buildPolicyPDFContent(policy, urls);
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => {
        win.focus();
        setTimeout(() => {
          win.print();
        }, 1500);
      };
    }
  };

  const fetchPolicy = async () => {
    try {
      const { data } = await api.get(`/policies/${id}`);
      setPolicy(data);
      
      if (data.owner_id) {
        fetchMaker(data.owner_id);
      }
      
      if (data.final_submission_file_id) fetchUrl("final_submission_file_id", "final");
      if (data.supporting_documents_file_id) fetchUrl("supporting_documents_file_id", "supporting");
      
    } catch (err) {
      toast.error("Failed to load policy");
      navigate("/admin/policies");
    } finally {
      setLoading(false);
    }
  };

  const fetchUrl = async (field, key) => {
    try {
      const { data } = await api.get(`/policies/${id}/signed-url/${field}`);
      setUrls(prev => ({ 
        ...prev, 
        [key]: { 
          preview: data.url, 
          download: data.download_url || data.url,
          image_preview: data.image_preview 
        } 
      }));
    } catch (err) {
      console.error(`Failed to fetch URL for ${field}`);
    }
  };

  const submitReview = async () => {
    setSubmitting(true);
    try {
      await api.post(`/policies/${id}/review`, { action, feedback });
      toast.success("Policy review submitted successfully");
      navigate("/admin/policies");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitClick = () => {
    if (!action) {
      toast.error("Please select a decision action");
      return;
    }
    
    if (action === "reject" && !feedback.trim()) {
      setFeedbackError(true);
      toast.error("Feedback is required when requesting a revision");
      return;
    }

    setFeedbackError(false);
    setShowConfirmation(true);
  };

  const handleFeedbackChange = (e) => {
    setFeedback(e.target.value);
    if (e.target.value.trim()) {
      setFeedbackError(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/policies/${id}`);
      toast.success("Policy deleted permanently");
      navigate("/admin/policies");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to delete policy");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) return (
    <div className="p-20 text-center flex flex-col items-center justify-center gap-4 min-h-screen">
      <RefreshCw className="animate-spin text-[#4A7FC1]" size={36} />
      <span className="text-sm font-light text-slate-500">Loading policy review canvas...</span>
    </div>
  );
  
  if (!policy) return null;

  const isReviewable = ['submitted', 'under_review', 'revised'].includes(policy.status);
  const maxRevisionsReached = policy.revision_count >= 2;

  const activeStepKey = policy.status === 'revised' ? 'under_review' : policy.status;
  const currentStepIndex = steps.findIndex(s => s.key === activeStepKey);
  const activeIndex = currentStepIndex >= 0 ? currentStepIndex : 2; 

  const wordCount = policy.impact ? policy.impact.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

  // Region and category analysis calculations
  const regionAccidents = getRegionAccidents(policy.region);
  
  const activePoliciesInRegion = allPolicies.filter(p => 
    p.region && 
    policy.region && 
    p.region.toLowerCase().trim() === policy.region.toLowerCase().trim() && 
    p.id !== policy.id && 
    ['approved', 'completed'].includes(p.status)
  );

  const categoryPolicies = allPolicies.filter(p => p.category === policy.category);
  const approvedCount = categoryPolicies.filter(p => p.status === 'approved' || p.status === 'completed').length;
  const rejectedCount = categoryPolicies.filter(p => p.status === 'rejected').length;
  const totalCategorySubmitted = categoryPolicies.length;
  const approvalRate = totalCategorySubmitted > 0 ? Math.round((approvedCount / totalCategorySubmitted) * 100) : 80;

  const similarPolicies = allPolicies.filter(p => 
    p.category === policy.category && 
    p.id !== policy.id
  ).slice(0, 3);

  const createdTime = new Date(policy.created_at || Date.now());
  const diffTime = Math.abs(Date.now() - createdTime);
  const reviewDurationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isPDF = urls.supporting?.preview && (() => {
    try {
      const url = new URL(urls.supporting.preview);
      const pathname = url.pathname.toLowerCase();
      return (
        pathname.endsWith('.pdf') ||
        pathname.includes('.pdf?') ||
        pathname.includes('/pdf/') ||
        url.searchParams.get('format') === 'pdf' ||
        pathname.includes('fl_attachment') ||
        urls.supporting.preview.toLowerCase().includes('policy_supporting')
      );
    } catch {
      return urls.supporting.preview.toLowerCase().includes('.pdf');
    }
  })();

  return (
    <div className="animate-in fade-in duration-500 pb-20 relative min-h-screen text-slate-800 font-normal">
      
      {/* HEADER TOOLBAR CARD */}
      <div className="bg-white border-b border-[#EDE8E3] px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/admin/policies")} className="p-2 -ml-2 rounded-lg hover:bg-slate-50 text-slate-500 transition-colors">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-lg font-normal text-slate-900 leading-tight">
                  Policy Review
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-semibold uppercase text-slate-600">Admin Access</span>
                  <span className="text-[10px] text-slate-500">• {policy.id}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="bg-white hover:bg-red-50 border border-[#EDE8E3] text-red-600 flex items-center gap-2 px-3 py-1.5 text-xs font-normal rounded-[10px] transition-colors"
                title="Delete this policy"
              >
                <Trash2 size={14} /> Delete
              </button>
              <button onClick={downloadPolicyPDF} className="bg-white hover:bg-slate-50 border border-[#EDE8E3] text-slate-700 flex items-center gap-2 px-3 py-1.5 text-xs font-normal rounded-[10px] transition-colors">
                <Download size={14} /> Download PDF
              </button>
              
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                <CheckCircle2 size={12} />
                <span className="text-[10px] font-normal tracking-wider uppercase">
                  {policy.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between w-full mt-1 pt-3 border-t border-[#EDE8E3] overflow-x-auto text-[11px] font-medium text-slate-600">
            {steps.map((step, idx) => {
              const isCompleted = idx < activeIndex;
              const isActive = idx === activeIndex;
              return (
                <div key={step.key} className="flex items-center gap-1.5 shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors ${
                    isActive ? "bg-[#4A7FC1] text-white" :
                    isCompleted ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-100 text-slate-400"
                  }`}>
                    {isCompleted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className={`${isActive ? "text-[#4A7FC1] font-semibold" : isCompleted ? "text-emerald-600 font-semibold" : "text-slate-600 font-medium"}`}>
                    {step.label}
                  </span>
                  {idx < steps.length - 1 && (
                    <div className="h-[1px] w-4 sm:w-8 bg-[#EDE8E3] mx-1.5" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TWO-COLUMN GRID */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* LEFT: MAIN CONTENT */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* POLICY DETAILS CARD */}
            <div className="bg-white rounded-2xl border border-[#EDE8E3] p-8 shadow-sm space-y-8">
              
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-normal uppercase tracking-wider mb-4 border border-blue-100">
                  <Compass size={12} /> {policy.category || "Uncategorized"}
                </div>
                
                <h2 className="text-xl font-normal text-slate-900 leading-snug mb-6">
                  {policy.title || "Untitled Policy Document"}
                </h2>
                
                {/* Metadata Chips Bar */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border border-[#EDE8E3] rounded-2xl bg-[#FAF8F6] p-4">
                  <div className="flex items-center gap-2.5 p-1">
                    <MapPin size={16} className="text-slate-500 shrink-0" />
                    <div>
                      <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Region</p>
                      <p className="text-[12px] font-semibold text-slate-800">{policy.region || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-1">
                    <Calendar size={16} className="text-slate-500 shrink-0" />
                    <div>
                      <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Effective</p>
                      <p className="text-[12px] font-semibold text-slate-800">{policy.effective_date ? new Date(policy.effective_date).toLocaleDateString() : "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-1">
                    <Clock size={16} className="text-slate-500 shrink-0" />
                    <div>
                      <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Duration</p>
                      <p className="text-[12px] font-semibold text-slate-800">{policy.duration ? `${policy.duration} ${policy.duration_unit}` : "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-1">
                    <Upload size={16} className="text-slate-500 shrink-0" />
                    <div>
                      <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Submitted</p>
                      <p className="text-[12px] font-semibold text-slate-800">{policy.created_at ? new Date(policy.created_at).toLocaleDateString() : "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-1">
                    <Tag size={16} className="text-slate-500 shrink-0" />
                    <div>
                      <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">Category</p>
                      <p className="text-[12px] font-semibold text-slate-800">{policy.category || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Executive Summary */}
              <section className="space-y-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-[10px] uppercase font-bold text-slate-600 tracking-widest flex items-center gap-2">
                    <FileText size={14} className="text-[#4A7FC1]" /> Executive Summary & Impact
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-slate-200 text-slate-600 border border-slate-300">
                    {wordCount} words
                  </span>
                </div>
                <div className="bg-[#FAF8F6] p-6 rounded-2xl border border-[#EDE8E3] border-l-4 border-l-[#4A7FC1]">
                  <p className="text-slate-700 text-[13px] leading-relaxed whitespace-pre-wrap">
                    {policy.impact || "No impact statement provided."}
                  </p>
                </div>
                {wordCount < 30 && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 text-amber-700 text-xs rounded-[10px]">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>This impact statement may be too brief for a thorough review. Consider requesting more detail.</span>
                  </div>
                )}
              </section>

              {/* Supporting Documentation with preview */}
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase font-bold text-slate-600 tracking-widest flex items-center gap-2">
                  <FileUp size={14} className="text-[#4A7FC1]" /> Supporting Documentation
                </h3>
                {urls.supporting ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-[#EDE8E3] rounded-2xl bg-white">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-slate-900">Reference Material Attached</p>
                          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mt-0.5">Verified Document</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setPreviewDoc({ label: "Supporting Document", url: urls.supporting.preview, imagePreviewUrl: urls.supporting.image_preview })}
                          className="bg-white hover:bg-slate-50 border border-[#EDE8E3] py-1.5 px-3 text-xs font-normal rounded-[10px] flex items-center gap-2 transition-colors text-slate-700"
                        >
                          <Eye size={14} /> View
                        </button>
                        <a 
                          href={urls.supporting.download} target="_blank" rel="noopener noreferrer" 
                          className="bg-white hover:bg-slate-50 border border-[#EDE8E3] py-1.5 px-3 text-xs font-normal rounded-[10px] flex items-center gap-2 transition-colors text-slate-700"
                        >
                          <Download size={14} /> Save
                        </a>
                      </div>
                    </div>

                    {/* PDF/Image inline preview via iframe */}
                    <div className="border border-[#EDE8E3] rounded-2xl h-[500px] overflow-hidden bg-[#FAF8F6]">
                      {isPDF ? (
                        <iframe
                          src={urls.supporting.preview}
                          className="w-full h-full border-0"
                          title="Supporting Document Preview"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white p-4">
                          <img src={urls.supporting.preview} className="max-w-full max-h-full object-contain rounded-xl" alt="Attached Preview" />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-8 border border-dashed border-[#EDE8E3] rounded-2xl bg-[#FAF8F6] text-slate-500">
                    <p className="text-xs font-medium">No supporting document uploaded</p>
                  </div>
                )}
              </section>

              {/* Data Analysis Section */}
              <section className="space-y-4 pt-4 border-t border-[#EDE8E3]">
                <h3 className="text-[10px] uppercase font-bold text-slate-600 tracking-widest flex items-center gap-2">
                  <BarChart3 size={14} className="text-[#4A7FC1]" /> Data Analysis
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Accidents in region card */}
                  <div className="bg-white border border-[#EDE8E3] rounded-2xl p-5 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Accidents in region: {policy.region || "—"}</h4>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900">{regionAccidents.total}</span>
                      <span className="text-[10px] text-slate-600 font-medium">Total in 6 months</span>
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-normal ${
                        regionAccidents.risk === 'high' ? 'bg-red-50 text-red-600 border border-red-100' :
                        regionAccidents.risk === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                        'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}>
                        {regionAccidents.risk} Risk
                      </span>
                    </div>
                    
                    {/* SVG/CSS Bar Chart */}
                    <div className="flex items-end justify-between h-14 pt-2 gap-1.5">
                      {regionAccidents.monthly.map((val, idx) => (
                        <div key={idx} className="flex flex-col items-center flex-1">
                          <div 
                            className="w-full bg-[#4A7FC1]/80 rounded-t-sm transition-all duration-300 hover:bg-[#4A7FC1]"
                            style={{ height: `${Math.max((val / Math.max(...regionAccidents.monthly, 1)) * 100, 10)}%` }}
                            title={`${val} accidents`}
                          />
                          <span className="text-[8px] text-slate-400 mt-1">M{idx + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active policies in region card */}
                  <div className="bg-white border border-[#EDE8E3] rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active policies: {policy.region || "—"}</h4>
                      <div className="text-2xl font-bold text-slate-900 mt-1">{activePoliciesInRegion.length} Active</div>
                    </div>
                    {activePoliciesInRegion.length > 0 ? (
                      <div className="space-y-1.5 mt-2">
                        {activePoliciesInRegion.slice(0, 3).map(p => (
                          <div key={p.id} className="flex justify-between items-center text-[10px] p-1.5 bg-[#FAF8F6] rounded-md border border-[#EDE8E3]">
                            <span className="truncate max-w-[130px] font-normal text-slate-700">{p.title}</span>
                            <span className="px-1.5 py-0.2 bg-emerald-55/70 text-emerald-600 rounded-[4px] uppercase tracking-wider text-[8px]">{p.status}</span>
                          </div>
                        ))}
                        {activePoliciesInRegion.some(p => p.category === policy.category) && (
                          <p className="text-[9px] text-amber-600 font-normal italic mt-1 leading-normal">
                            Note: There is an active policy in this region within the same category which may overlap.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-600 font-medium italic mt-2">No other active policies in this region.</p>
                    )}
                  </div>

                  {/* Category approval trends card */}
                  <div className="bg-white border border-[#EDE8E3] rounded-2xl p-5 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Approval trends: {policy.category || "—"}</h4>
                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-bold text-[#4A7FC1]">{approvalRate}%</div>
                      <div className="flex-1 space-y-1.5 text-[10px] text-slate-600 font-medium">
                        <div className="flex justify-between">
                          <span>Total Submitted:</span>
                          <span className="font-normal text-slate-700">{totalCategorySubmitted}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Approved:</span>
                          <span className="font-normal text-emerald-600">{approvedCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rejected:</span>
                          <span className="font-normal text-red-500">{rejectedCount}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-[#F0EBE6] rounded-full h-1">
                      <div className="h-full bg-[#4A7FC1]" style={{ width: `${approvalRate}%` }} />
                    </div>
                  </div>

                  {/* Similar policies card */}
                  <div className="bg-white border border-[#EDE8E3] rounded-2xl p-5 space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Similar policies</h4>
                    {similarPolicies.length > 0 ? (
                      <div className="space-y-2 mt-1">
                        {similarPolicies.map(p => (
                          <div 
                            key={p.id} 
                            onClick={() => navigate(`/admin/policies/${p.id}`)}
                            className="p-2 bg-[#FAF8F6] rounded-md border border-[#EDE8E3] hover:border-[#4A7FC1] transition-all cursor-pointer space-y-1"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-normal text-slate-800 truncate max-w-[140px]">{p.title}</span>
                              <span className="px-1.5 py-0.2 bg-blue-50 text-blue-600 rounded text-[8px] uppercase tracking-wider">{p.status}</span>
                            </div>
                            <div className="flex justify-between text-[8px] text-slate-600 font-medium">
                              <span>Region: {p.region}</span>
                              <span>{new Date(p.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-600 font-medium italic">No similar policies found.</p>
                    )}
                  </div>

                </div>
              </section>

            </div>

            {/* FINAL SUBMISSION FILES PANEL */}
            {policy.status === "completed" && urls.final && (
              <div className="bg-emerald-50/50 border border-emerald-200 p-8 rounded-2xl">
                <h3 className="text-[16px] font-normal text-emerald-800 mb-5 flex items-center gap-2">
                  <CheckCircle2 size={20} /> Final Implementation Files
                </h3>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => setPreviewDoc({ label: "Final Implementation", url: urls.final.preview, imagePreviewUrl: urls.final.image_preview })} 
                    className="bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 flex items-center gap-2 px-5 py-2.5 font-normal uppercase tracking-wider text-[11px] rounded-[10px] transition-colors"
                  >
                    <Eye size={16} /> Preview Document
                  </button>
                  <a 
                    href={urls.final.download} target="_blank" rel="noopener noreferrer" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 px-5 py-2.5 font-normal uppercase tracking-wider text-[11px] rounded-[10px] transition-colors"
                  >
                    <Download size={16} /> Download Final Submission
                  </a>
                </div>
              </div>
            )}
            
          </div>

          {/* RIGHT: POLICY INFO & RESOLUTION */}
          <div className="space-y-6">
            
            {/* Metadata Panel */}
            <div className="bg-white rounded-2xl border border-[#EDE8E3] overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-[#EDE8E3] bg-[#FAF8F6]">
                <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                  <Info size={14} /> Policy Details
                </h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-center text-xs font-medium">
                  <span className="text-slate-600">Status</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                    {policy.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs font-medium">
                  <span className="text-slate-600">Category</span>
                  <span className="font-semibold text-slate-800">{policy.category || '—'}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-medium">
                  <span className="text-slate-600">Region</span>
                  <span className="font-semibold text-slate-800">{policy.region || '—'}</span>
                </div>
                
                {/* Revisions progress bar */}
                <div className="space-y-1 pt-1.5 border-t border-slate-100">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-600">Revisions</span>
                    <span className="font-semibold text-slate-800">{policy.revision_count || 0} / 2 Used</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#4A7FC1] h-full transition-all duration-300" style={{ width: `${(policy.revision_count || 0) * 50}%` }} />
                  </div>
                </div>

                {/* Submitting Maker Info */}
                {maker && (
                  <div className="pt-3 border-t border-[#EDE8E3] space-y-1">
                    <p className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Policy Maker</p>
                    <p className="text-xs font-semibold text-slate-800 truncate">{maker.name}</p>
                    <p className="text-[10px] text-slate-600 font-medium truncate">{maker.email}</p>
                  </div>
                )}

                {/* Review Duration */}
                <div className="pt-3 border-t border-[#EDE8E3] space-y-1">
                  <p className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Review Duration</p>
                  <p className="text-xs font-semibold text-slate-800">In review for {reviewDurationDays} days</p>
                  {reviewDurationDays > 5 && (
                    <div className="flex items-center gap-1.5 p-2 bg-amber-50 border border-amber-100 text-amber-700 text-[9px] rounded-lg mt-1 font-normal leading-normal">
                      <AlertTriangle size={12} className="shrink-0" />
                      <span>This policy has been under review for {reviewDurationDays} days</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Panel */}
            {isReviewable && (
              <div className="bg-white rounded-2xl border border-[#EDE8E3] overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-[#EDE8E3] bg-[#FAF8F6]">
                  <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Admin Resolution</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Decision</label>
                    <div className="grid grid-cols-1 gap-2">
                      <button 
                        onClick={() => setAction("approve")}
                        className={`py-2 px-3 text-xs font-normal rounded-[10px] border text-left flex items-center gap-2 transition-all ${
                          action === 'approve' 
                            ? 'bg-[#2E7D32] border-[#2E7D32] text-white' 
                            : 'bg-[#E8F5E9] border-[#81C784] text-[#2E7D32] hover:bg-[#E8F5E9]/80'
                        }`}
                      >
                        <CheckCircle2 size={14} /> Approve Policy
                      </button>
                      
                      {!maxRevisionsReached ? (
                        <button 
                          onClick={() => setAction("reject")}
                          className={`py-2 px-3 text-xs font-normal rounded-[10px] border text-left flex items-center gap-2 transition-all ${
                            action === 'reject' 
                              ? 'bg-[#E65100] border-[#E65100] text-white' 
                              : 'bg-[#FFF8E1] border-[#FFD54F] text-[#E65100] hover:bg-[#FFF8E1]/80'
                          }`}
                        >
                          <RefreshCw size={14} /> Request Revision
                        </button>
                      ) : (
                        <button 
                          onClick={() => setAction("extend")}
                          className={`py-2 px-3 text-xs font-normal rounded-[10px] border text-left flex items-center gap-2 transition-all ${
                            action === 'extend' 
                              ? 'bg-[#4A7FC1] border-[#4A7FC1] text-white' 
                              : 'bg-[#E8F0FA] border-[#B2CDEB] text-[#4A7FC1] hover:bg-[#E8F0FA]/80'
                          }`}
                        >
                          <RefreshCw size={14} /> Grant Extension
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Feedback Textarea */}
                  <div className="space-y-2 relative">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-normal text-slate-400 uppercase tracking-wider">Feedback</label>
                      {action === "reject" && <span className="text-[9px] font-normal text-red-500 uppercase tracking-wider">Required</span>}
                    </div>
                    <textarea 
                      value={feedback} 
                      onChange={handleFeedbackChange} 
                      maxLength={500}
                      className={`w-full min-h-[100px] resize-none border bg-white text-xs p-3 rounded-[10px] focus:outline-none focus:border-[#4A7FC1] text-slate-700 transition-colors ${
                        feedbackError ? 'border-[#E8A89A]' : 'border-[#EDE8E3]'
                      }`} 
                      placeholder={
                        action === 'approve' 
                          ? "Optional — add any notes for the policy maker"
                          : action === 'reject'
                            ? "Required — describe exactly what needs to be revised"
                            : "Enter review feedback or requirements..."
                      }
                    />
                    <div className="text-[9px] text-slate-400 text-right mt-1 font-light">
                      {feedback.length} / 500
                    </div>
                    {feedbackError && (
                      <p className="text-[9px] text-red-500 font-normal">Feedback is required when requesting a revision</p>
                    )}
                  </div>

                  {/* Submit decision Button */}
                  <button 
                    onClick={handleSubmitClick} 
                    disabled={submitting || !action} 
                    className={`w-full py-2.5 rounded-[10px] text-xs font-normal transition-all ${
                      !action 
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                        : "bg-[#4A7FC1] hover:bg-[#3D6EA7] text-white"
                    }`}
                  >
                    {action ? "Confirm & submit decision" : "Select a decision above"}
                  </button>
                </div>
              </div>
            )}

            {/* Review History */}
            {policy.admin_feedback && (
              <div className="bg-white rounded-2xl border border-[#EDE8E3] overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-[#EDE8E3] bg-[#FAF8F6]">
                  <h3 className="text-[10px] font-normal text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Info size={14} /> Review History
                  </h3>
                </div>
                <div className="p-5">
                  <div className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-[10px] font-normal shrink-0">
                      AD
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <span className="text-[11px] font-normal text-slate-800">Admin Team</span>
                        <span className="text-[9px] text-slate-400 font-light">{new Date(policy.updated_at || Date.now()).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[12px] text-slate-600 leading-relaxed bg-[#FAF8F6] p-3 rounded-[10px] border border-[#EDE8E3]">
                        {policy.admin_feedback}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewDoc && (
        <div 
          onClick={() => setPreviewDoc(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md transition-all duration-300"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl h-[85vh] bg-white rounded-3xl border border-[#EDE8E3] shadow-2xl flex flex-col overflow-hidden text-slate-800 font-light"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDE8E3] bg-[#FAF8F6]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-normal text-slate-900">Document Preview</h3>
                  <p className="text-[10px] text-slate-400 font-normal uppercase tracking-wider">{previewDoc.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EDE8E3] bg-white text-slate-700 hover:bg-slate-50 text-xs font-normal transition-colors"
                >
                  <Eye size={14} />
                  Open in New Tab
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 bg-[#F5F0EB] p-6 flex flex-col items-center justify-center overflow-hidden">
              <iframe 
                src={previewDoc.url}
                className="w-full h-full rounded-2xl border border-[#EDE8E3] bg-white" 
                title={previewDoc.label}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-lg" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl border border-[#EDE8E3] shadow-2xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 text-slate-800 font-light" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-red-500 mb-4">
                <Trash2 size={28} />
              </div>
              <h3 className="text-lg font-normal text-slate-900 uppercase tracking-tight">Delete Policy</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                This will permanently delete <strong className="text-slate-700 font-normal">"{policy?.title || 'Untitled'}"</strong> and all associated cloud documents. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl text-sm font-normal bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 rounded-xl text-sm font-normal bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
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

      {/* Decision Submission Confirmation Modal */}
      {showConfirmation && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-lg" onClick={() => setShowConfirmation(false)}>
          <div className="bg-white rounded-2xl border border-[#EDE8E3] shadow-2xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 text-slate-800 font-light" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-[#EDE8E3] pb-4">
              <span className="text-[10px] tracking-wider font-normal text-slate-400 uppercase">Confirm Review Action</span>
              <h3 className="text-lg font-normal text-slate-900 mt-1">Submit decision report?</h3>
            </div>

            <div className="space-y-3 text-xs font-light text-slate-600">
              <div className="flex justify-between items-center">
                <span>Selected Decision</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-normal ${
                  action === 'approve' 
                    ? 'bg-[#E8F5E9] text-[#2E7D32] border border-[#81C784]'
                    : action === 'reject'
                      ? 'bg-[#FFF8E1] text-[#E65100] border border-[#FFD54F]'
                      : 'bg-blue-50 text-blue-600 border border-blue-100'
                }`}>
                  {action === 'approve' ? 'Approve Policy' : action === 'reject' ? 'Request Revision' : 'Grant Extension'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400">Policy Title</span>
                <p className="font-normal text-slate-800 truncate">{policy.title}</p>
              </div>
              
              {feedback.trim() && (
                <div className="space-y-1">
                  <span className="text-slate-400">Feedback Preview</span>
                  <p className="p-2.5 bg-[#FAF8F6] border border-[#EDE8E3] rounded-md text-[11px] text-slate-700 italic">
                    "{feedback.length > 100 ? `${feedback.substring(0, 100)}...` : feedback}"
                  </p>
                </div>
              )}

              {action === 'reject' && (
                <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-50">
                  <span>Revisions Remaining</span>
                  <span className="font-normal text-[#E65100]">{2 - (policy.revision_count || 0)} left</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#EDE8E3]">
              <button
                onClick={() => setShowConfirmation(false)}
                className="flex-1 py-2 px-4 rounded-[10px] text-xs font-normal bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmation(false);
                  submitReview();
                }}
                disabled={submitting}
                className="flex-1 py-2 px-4 rounded-[10px] text-xs font-normal bg-[#4A7FC1] hover:bg-[#3D6EA7] text-white transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? "Submitting..." : "Confirm Decision"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
