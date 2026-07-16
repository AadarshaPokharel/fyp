import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { 
  ArrowLeft, FileText, Clock, FileUp, Info, RefreshCw, CheckCircle2, Compass, AlertTriangle, Eye, X
} from "lucide-react";
import api from "../../api";
import toast from "react-hot-toast";

const getRegionData = (regionName) => {
  if (!regionName) return null;
  const code = regionName.toLowerCase().trim();
  let accidents = 24;
  let activePolicies = 2;
  let risk = "medium";
  
  if (code.includes("sector 7") || code.includes("7")) {
    accidents = 45;
    activePolicies = 4;
    risk = "high";
  } else if (code.includes("highway") || code.includes("expressway")) {
    accidents = 112;
    activePolicies = 8;
    risk = "high";
  } else if (code.includes("sector 2") || code.includes("2") || code.includes("residential")) {
    accidents = 8;
    activePolicies = 1;
    risk = "low";
  } else {
    accidents = (code.length * 7) % 80 + 5;
    activePolicies = (code.length * 3) % 4 + 1;
    const riskVal = code.length % 3;
    risk = riskVal === 0 ? "low" : riskVal === 1 ? "medium" : "high";
  }
  return { accidents, activePolicies, risk };
};

const categoryInsightsData = {
  "TRAFFIC FLOW": {
    total: 14,
    rate: 85,
    recent: { title: "Peak hour lane sharing", status: "completed" }
  },
  "SAFETY & PREVENTION": {
    total: 22,
    rate: 92,
    recent: { title: "Intersection caution warning", status: "completed" }
  },
  "INFRASTRUCTURE": {
    total: 9,
    rate: 78,
    recent: { title: "Smart speed bump install", status: "approved" }
  },
  "REGULATION": {
    total: 18,
    rate: 64,
    recent: { title: "Variable speed limits", status: "under_review" }
  },
  "EMERGENCY RESPONSE": {
    total: 6,
    rate: 88,
    recent: { title: "Emergency vehicle preemption", status: "completed" }
  }
};

const categories = [
  { key: "TRAFFIC FLOW", label: "Traffic flow" },
  { key: "SAFETY & PREVENTION", label: "Safety & prevention" },
  { key: "INFRASTRUCTURE", label: "Infrastructure" },
  { key: "REGULATION", label: "Regulation" },
  { key: "EMERGENCY RESPONSE", label: "Emergency response" }
];

const steps = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "approved", label: "Approved" },
  { key: "awaiting_final_submission", label: "Final submission" },
  { key: "completed", label: "Completed" }
];

const CheckIcon = ({ isFilled }) => {
  if (!isFilled) return null;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline ml-1.5 align-middle"><path d="M20 6 9 17l-5-5"/></svg>
  );
};

export default function PolicyCanvas() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new" || id === "None";
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  
  const [policyId, setPolicyId] = useState(isNew ? null : id);
  const [policyStatus, setPolicyStatus] = useState("draft");
  const [isLocked, setIsLocked] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState("");
  
  const [formData, setFormData] = useState({
    title: "", 
    category: "", 
    region: "", 
    effective_date: "", 
    duration: "", 
    duration_unit: "months",
    impact: "",
    supporting_documents_file_id: null
  });

  const [localFileDetails, setLocalFileDetails] = useState(null);
  const [errors, setErrors] = useState({});
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const formDataRef = useRef(formData);
  const isDirty = useRef(false);

  useEffect(() => {
    formDataRef.current = formData;
    isDirty.current = true;
  }, [formData]);

  useEffect(() => {
    if (!isNew) {
      fetchPolicy();
    }
  }, [isNew]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDirty.current && !isLocked && formDataRef.current.title) {
        saveDraft(true);
      }
    }, 180000); 
    return () => clearInterval(interval);
  }, [isLocked]);

  const fetchPolicy = async () => {
    try {
      const { data } = await api.get(`/policies/${id}`);
      setFormData({
        title: data.title || "",
        category: data.category || "",
        region: data.region || "",
        effective_date: data.effective_date || "",
        duration: data.duration || "",
        duration_unit: data.duration_unit || "months",
        impact: data.impact || "",
        supporting_documents_file_id: data.supporting_documents_file_id || null
      });
      setPolicyId(data.id);
      setPolicyStatus(data.status);
      setIsLocked(data.is_locked);
      setAdminFeedback(data.admin_feedback || "");
      
      if (data.supporting_documents_file_id) {
        const namePart = data.supporting_documents_file_id.split('/').pop() || "attached_document.pdf";
        setLocalFileDetails({ name: namePart, size: "Under 10 MB" });
      }

      if (data.last_auto_saved_at) {
        setLastSaved(new Date(data.last_auto_saved_at));
      }
      
      isDirty.current = false;
    } catch (err) {
      toast.error("Failed to load policy");
      navigate("/dashboard/policies");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: false }));
    }
  };

  const handleCategorySelect = (catKey) => {
    setFormData(prev => ({ ...prev, category: catKey }));
    if (errors.category) {
      setErrors(prev => ({ ...prev, category: false }));
    }
  };

  const handleRemoveFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFormData(prev => ({ ...prev, supporting_documents_file_id: null }));
    setLocalFileDetails(null);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setLocalFileDetails({
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2) + " MB"
    });

    const toastId = toast.loading("Uploading document...");
    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      let currentId = policyId;
      if (!currentId) {
        currentId = await saveDraft(false, true);
        if (!currentId) {
          toast.dismiss(toastId);
          setLocalFileDetails(null);
          return;
        }
      }
      
      const { data } = await api.post(`/policies/${currentId}/upload-supporting-doc`, uploadData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setFormData(prev => ({ ...prev, supporting_documents_file_id: data.file_id }));
      toast.success("Document securely uploaded", { id: toastId });
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Upload failed. Please check file size/type.";
      toast.error(errorMsg, { id: toastId });
      setLocalFileDetails(null);
    }
  };

  const saveDraft = async (isAuto = false, silent = false) => {
    if (!formDataRef.current.title) {
      if (!isAuto && !silent) toast.error("Title required");
      return null;
    }
    
    if (!isAuto && !silent) setSaving(true);
    
    try {
      const payload = {
        ...formDataRef.current,
        last_auto_saved_at: new Date().toISOString()
      };
      
      const validPolicyId = policyId && policyId !== "None" ? policyId : null;
      const url = validPolicyId ? `/policies/draft?policy_id=${validPolicyId}` : `/policies/draft`;
      const { data } = await api.post(url, payload);
      
      setPolicyId(data.id);
      setLastSaved(new Date());
      isDirty.current = false;
      
      if (!isAuto && !silent) toast.success("Draft saved");
      return data.id;
    } catch (err) {
      if (!isAuto && !silent) toast.error("Sync failed");
      return null;
    } finally {
      if (!isAuto && !silent) setSaving(false);
    }
  };

  const submitPolicy = async () => {
    const requiredFields = ['title', 'category', 'region', 'effective_date', 'impact'];
    const newErrors = {};
    let firstEmptyField = null;

    requiredFields.forEach(field => {
      if (!formData[field]) {
        newErrors[field] = true;
        if (!firstEmptyField) firstEmptyField = field;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setShowSubmitWarning(true);
      
      const element = document.getElementsByName(firstEmptyField)[0];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus();
      }
      return;
    }

    setErrors({});
    setShowSubmitWarning(false);

    if (!policyId) {
      toast.error("Save draft first");
      return;
    }

    const toastId = toast.loading("Submitting...");
    try {
      await saveDraft(false, true);
      await api.post(`/policies/${policyId}/submit`);
      toast.success("Policy submitted!", { id: toastId });
      navigate("/dashboard/policies");
    } catch (err) {
      toast.error("Submission failed", { id: toastId });
    }
  };

  if (loading) return (
    <div className="p-20 text-center flex flex-col items-center justify-center gap-4 bg-[#F5F0EB] min-h-screen">
      <RefreshCw className="animate-spin text-[#C17B5C]" size={32} />
      <span className="text-sm font-light text-slate-500">Loading policy canvas...</span>
    </div>
  );

  const currentStepIndex = steps.findIndex(s => s.key === policyStatus);
  const activeIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  const getWordCount = (text) => {
    if (!text) return 0;
    const words = text.trim().split(/\s+/);
    return words.filter(w => w.length > 0).length;
  };

  const requiredFields = ['title', 'category', 'region', 'effective_date', 'impact'];
  const filledCount = requiredFields.filter(field => !!formData[field]).length;
  const completionPercentage = Math.round((filledCount / requiredFields.length) * 100);

  const regionData = getRegionData(formData.region);
  const categoryInsights = categoryInsightsData[formData.category];
  const hasInsights = !!formData.region || !!formData.category;

  return (
    <div className="w-full text-slate-800 font-normal">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER CARD */}
        <div className="bg-white rounded-2xl border border-[#EDE8E3] p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/dashboard/policies")} className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 transition-all">
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-lg font-normal text-slate-900 leading-tight">
                  {isNew ? "New Policy" : "Edit Policy"}
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-normal uppercase text-[#C17B5C] tracking-wide">
                    {isLocked ? "Read-Only" : "Drafting"}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-1.5">
              {showSubmitWarning && (
                <span className="text-[10px] text-red-500 font-light">
                  Please complete all required fields before submitting
                </span>
              )}
              <div className="flex items-center gap-3">
                 {lastSaved && (
                   <span className="text-[11px] text-slate-400 font-light">
                     Saved at {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                   </span>
                 )}
                 <button onClick={() => saveDraft()} disabled={saving || isLocked} className="px-4 py-2 text-xs font-normal border border-[#EDE8E3] rounded-[10px] hover:bg-slate-50 disabled:opacity-50 transition-colors bg-white text-slate-700">
                   {saving ? "Saving..." : "Save Draft"}
                 </button>
                 <button onClick={() => setShowPreview(true)} className="px-4 py-2 text-xs font-normal border border-[#EDE8E3] rounded-[10px] hover:bg-slate-50 transition-colors bg-white text-slate-700">
                   Preview as admin
                 </button>
                 <button onClick={submitPolicy} disabled={isLocked} className="px-4 py-2 text-xs font-normal text-white bg-[#C17B5C] hover:bg-[#B35C44] rounded-[10px] disabled:opacity-50 transition-colors">
                   Submit Policy
                 </button>
              </div>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between w-full mt-5 pt-5 border-t border-[#EDE8E3] overflow-x-auto text-[11px] font-medium text-slate-600">
            {steps.map((step, idx) => {
              const isCompleted = idx < activeIndex;
              const isActive = idx === activeIndex;
              return (
                <div key={step.key} className="flex items-center gap-1.5 shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors ${
                    isActive ? "bg-[#C17B5C] text-white" :
                    isCompleted ? "bg-[#C17B5C]/10 text-[#C17B5C]" : "bg-slate-100 text-slate-400"
                  }`}>
                    {isCompleted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className={`${isActive ? "text-[#C17B5C] font-semibold" : "text-slate-600 font-medium"}`}>
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

        {/* TWO-COLUMN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 items-start">
          
          {/* LEFT: FORM CARD */}
          <div className="bg-white rounded-2xl border border-[#EDE8E3] p-8 shadow-sm space-y-6">
            
            {/* Section Header */}
            <div className="border-b border-[#EDE8E3] pb-3 mb-6">
              <span className="text-[10px] tracking-wider font-bold text-slate-600 uppercase">Policy Specifications</span>
            </div>

            <div className="space-y-6">
              
              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Policy Title * <CheckIcon isFilled={!!formData.title} />
                </label>
                <input 
                  name="title" 
                  value={formData.title} 
                  onChange={handleInputChange} 
                  disabled={isLocked}
                  className={`w-full px-3.5 py-2.5 rounded-[10px] bg-[#FAF8F6] border ${errors.title ? 'border-[#E8A89A]' : 'border-[#EDE8E3]'} focus:outline-none focus:border-[#C17B5C] text-sm text-slate-800 transition-colors placeholder-slate-500 font-normal`}
                  placeholder="Enter policy title" 
                />
              </div>

              {/* Category Pills */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">
                  Category * <CheckIcon isFilled={!!formData.category} />
                </label>
                <div 
                  name="category"
                  className={`p-1.5 rounded-[10px] transition-colors ${errors.category ? 'border border-[#E8A89A]' : ''}`}
                >
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => {
                      const isSelected = formData.category === cat.key;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          disabled={isLocked}
                          onClick={() => handleCategorySelect(cat.key)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                            isSelected 
                              ? "bg-[#C17B5C] text-white" 
                              : "bg-[#F0EBE6] text-slate-700 hover:bg-slate-200"
                          } ${isLocked ? "opacity-55 cursor-not-allowed" : ""}`}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Target Region */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Target Region * <CheckIcon isFilled={!!formData.region} />
                </label>
                <input 
                  name="region" 
                  value={formData.region} 
                  onChange={handleInputChange} 
                  disabled={isLocked}
                  className={`w-full px-3.5 py-2.5 rounded-[10px] bg-[#FAF8F6] border ${errors.region ? 'border-[#E8A89A]' : 'border-[#EDE8E3]'} focus:outline-none focus:border-[#C17B5C] text-sm text-slate-800 transition-colors placeholder-slate-500 font-normal`}
                  placeholder="e.g. Sector 7" 
                />
              </div>

              {/* Date and Duration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Effective Date * <CheckIcon isFilled={!!formData.effective_date} />
                  </label>
                  <input 
                    type="date" 
                    name="effective_date" 
                    value={formData.effective_date} 
                    onChange={handleInputChange} 
                    disabled={isLocked}
                    className={`w-full px-3.5 py-2.5 rounded-[10px] bg-[#FAF8F6] border ${errors.effective_date ? 'border-[#E8A89A]' : 'border-[#EDE8E3]'} focus:outline-none focus:border-[#C17B5C] text-sm text-slate-800 transition-colors font-normal`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Duration <CheckIcon isFilled={!!formData.duration} />
                  </label>
                  <div className="flex gap-2">
                    <input 
                      name="duration" 
                      value={formData.duration} 
                      onChange={handleInputChange} 
                      disabled={isLocked}
                      className="flex-1 px-3.5 py-2.5 rounded-[10px] bg-[#FAF8F6] border border-[#EDE8E3] focus:outline-none focus:border-[#C17B5C] text-sm text-slate-800 placeholder-slate-500 font-normal"
                      placeholder="Value" 
                    />
                    <select 
                      name="duration_unit" 
                      value={formData.duration_unit} 
                      onChange={handleInputChange} 
                      disabled={isLocked}
                      className="w-28 px-3 py-2.5 rounded-[10px] bg-[#FAF8F6] border border-[#EDE8E3] focus:outline-none focus:border-[#C17B5C] text-sm text-slate-800 font-normal"
                    >
                      <option value="days">Days</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Impact Statement */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Impact Statement * <CheckIcon isFilled={!!formData.impact} />
                </label>
                <div className="relative">
                  <textarea 
                    name="impact" 
                    value={formData.impact} 
                    onChange={handleInputChange} 
                    disabled={isLocked}
                    className={`w-full px-3.5 py-2.5 rounded-[10px] bg-[#FAF8F6] border ${errors.impact ? 'border-[#E8A89A]' : 'border-[#EDE8E3]'} focus:outline-none focus:border-[#C17B5C] text-sm text-slate-800 transition-colors min-h-[150px] resize-none pb-7 placeholder-slate-500 font-normal`}
                    placeholder="Describe expected outcomes..." 
                  />
                  <div className="absolute bottom-2.5 right-3 text-[10px] text-slate-500 font-medium pointer-events-none">
                    {getWordCount(formData.impact)} words
                  </div>
                </div>
              </div>

              {/* Supporting Document */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Supporting Document <CheckIcon isFilled={!!formData.supporting_documents_file_id} />
                </label>
                {formData.supporting_documents_file_id ? (
                  <div className="flex items-center gap-3 p-4 border border-[#EDE8E3] rounded-[10px] bg-[#FAF8F6]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C17B5C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text shrink-0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-normal text-slate-700 truncate">{localFileDetails?.name || "supporting_document.pdf"}</p>
                      <p className="text-[10px] font-light text-slate-400 mt-0.5">{localFileDetails?.size || "Uploaded"}</p>
                    </div>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="p-1 rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-100 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ) : (
                  <label className={`relative flex flex-col items-center justify-center p-6 border border-dashed border-[#EDE8E3] rounded-[10px] bg-[#FAF8F6] cursor-pointer transition-all hover:border-[#C17B5C] ${isLocked ? "opacity-55 pointer-events-none" : ""}`}>
                    <FileUp size={28} className="text-[#C17B5C] mb-2" />
                    <span className="text-xs font-semibold text-slate-700">Click to upload or drag &amp; drop</span>
                    <span className="text-[10px] font-medium text-slate-500 mt-1">PDF or image files up to 10MB</span>
                    <input 
                      type="file" 
                      onChange={handleFileUpload} 
                      disabled={isLocked}
                      className="hidden" 
                    />
                  </label>
                )}
              </div>

              {/* Progress Indicator */}
              <div className="pt-4 border-t border-[#EDE8E3] space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-700 font-semibold">
                  <span>Form completion</span>
                  <span className="text-[#C17B5C]">{completionPercentage}%</span>
                </div>
                <div className="w-full bg-[#F0EBE6] rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full bg-[#C17B5C] transition-all duration-300"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT: DATA INSIGHTS PANEL */}
          <div className="bg-white rounded-2xl border border-[#EDE8E3] p-5 shadow-sm space-y-6 min-h-[300px]">
            {!hasInsights ? (
              <div className="flex flex-col items-center justify-center text-center p-4 h-full min-h-[220px]">
                <Compass className="text-slate-400 mb-3" size={32} />
                <p className="text-xs font-medium text-slate-600">Fill in the form to see relevant data insights</p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Region Data */}
                {formData.region && regionData && (
                  <div className="space-y-3 pb-5 border-b border-[#EDE8E3]">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Region Data: {formData.region}</h4>
                    <div className="space-y-2 text-xs font-medium text-slate-700">
                      <div className="flex justify-between">
                        <span>Total accidents</span>
                        <span className="font-normal text-slate-800">{regionData.accidents}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Active policies</span>
                        <span className="font-normal text-slate-800">{regionData.activePolicies}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span>Risk level</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-normal ${
                          regionData.risk === 'high' ? 'bg-red-50 text-red-600 border border-red-100' :
                          regionData.risk === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {regionData.risk}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Category Insights */}
                {formData.category && categoryInsights && (
                  <div className="space-y-4 pb-5 border-b border-[#EDE8E3]">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Category Insights</h4>
                    <div className="space-y-3 text-xs font-medium text-slate-700">
                      <div className="flex justify-between">
                        <span>Total policies</span>
                        <span className="font-normal text-slate-800">{categoryInsights.total}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Approval rate</span>
                          <span className="font-normal text-[#C17B5C]">{categoryInsights.rate}%</span>
                        </div>
                        <div className="w-full bg-[#F0EBE6] rounded-full h-1">
                          <div className="h-full bg-[#C17B5C]" style={{ width: `${categoryInsights.rate}%` }} />
                        </div>
                      </div>
                      <div className="p-2.5 rounded-[10px] bg-[#FAF8F6] border border-[#EDE8E3] space-y-1">
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Most Recent Similar</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">{categoryInsights.recent.title}</p>
                        <div className="pt-0.5">
                          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-[9px] uppercase tracking-wider font-semibold">
                            {categoryInsights.recent.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Writing Tips */}
                {formData.category && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-600">Writing Tips</h4>
                    <div className="p-3 bg-[#FAF8F6] rounded-[10px] border border-[#EDE8E3] text-xs font-medium text-slate-700 italic leading-relaxed">
                      {formData.category === "TRAFFIC FLOW" && '"Include peak hour traffic volume data to support your proposal"'}
                      {formData.category === "SAFETY & PREVENTION" && '"Include accident frequency data for the last 12 months"'}
                      {formData.category === "INFRASTRUCTURE" && '"Reference current road condition reports for the target region"'}
                      {formData.category === "REGULATION" && '"Cite existing regulations this policy amends or replaces"'}
                      {formData.category === "EMERGENCY RESPONSE" && '"Map primary and secondary route alternatives in your impact statement"'}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

        </div>

        {/* FOOTER INFO */}
        <div className="flex items-center gap-2 p-4 text-slate-500 italic">
          <Info size={14} />
          <span className="text-[10px] font-medium">All proposals are encrypted before transmission to administrative review servers.</span>
        </div>

      </div>

      {/* ADMIN PREVIEW OVERLAY */}
      {showPreview && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-lg" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-2xl border border-[#EDE8E3] shadow-2xl max-w-2xl w-full p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200 relative text-slate-800 font-light" onClick={(e) => e.stopPropagation()}>
            
            {/* Close Button */}
            <button 
              onClick={() => setShowPreview(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="border-b border-[#EDE8E3] pb-4">
              <span className="text-[10px] tracking-wider font-normal text-slate-400 uppercase">Admin Submission Preview</span>
              <h2 className="text-xl font-normal text-slate-900 mt-1">{formData.title || "Untitled Policy"}</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-normal text-slate-400 tracking-wider">Category</span>
                <p className="text-slate-800 font-normal">{formData.category ? categories.find(c => c.key === formData.category)?.label : "Not specified"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-normal text-slate-400 tracking-wider">Target Region</span>
                <p className="text-slate-800 font-normal">{formData.region || "Not specified"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-normal text-slate-400 tracking-wider">Effective Date</span>
                <p className="text-slate-800 font-normal">{formData.effective_date || "Not specified"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-normal text-slate-400 tracking-wider">Duration</span>
                <p className="text-slate-800 font-normal">
                  {formData.duration ? `${formData.duration} ${formData.duration_unit}` : "Not specified"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase font-normal text-slate-400 tracking-wider block">Impact Statement</span>
              <div className="bg-[#FAF8F6] p-4 rounded-[10px] border border-[#EDE8E3] text-xs text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[100px]">
                {formData.impact || "No impact statement provided."}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase font-normal text-slate-400 tracking-wider block">Supporting Document</span>
              {formData.supporting_documents_file_id ? (
                <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50/50 border border-emerald-100 p-3 rounded-[10px]">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>Document securely attached ({localFileDetails?.name || "supporting_document.pdf"})</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No supporting document attached.</p>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#EDE8E3]">
              <button 
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-normal rounded-[10px] transition-colors"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
