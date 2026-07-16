// src/pages/CredentialUpload.jsx
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getVerificationRequest, submitCredentials } from "../api";
import toast from "react-hot-toast";
import Spinner from "../components/ui/Spinner";
import {
  User, Users, MapPin, FileText, CheckCircle2,
  ArrowLeft, ArrowRight, Save, Upload, ShieldCheck, Phone
} from "lucide-react";

const inputCls = "w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition";
const labelCls = "block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5";

function FieldGroup({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function FileDropZone({ label, required, file, onChange, accept, existingUrl }) {
  return (
    <div className="space-y-2">
      <label className={labelCls}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <label className="relative flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group">
        <Upload className="text-slate-400 group-hover:text-blue-500 transition-colors" size={28} />
        <p className="text-xs text-slate-500 font-medium text-center leading-relaxed">
          {file ? (
            <span className="text-blue-600 font-bold">{file.name}</span>
          ) : (
            "Click to upload or drag & drop"
          )}
        </p>
        <input type="file" accept={accept} className="absolute inset-0 opacity-0 cursor-pointer" onChange={onChange} />
      </label>
      {existingUrl && !file && (
        <a href={existingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-600 font-bold uppercase hover:underline">
          <FileText size={10} /> View Current Upload
        </a>
      )}
    </div>
  );
}

export default function CredentialUpload() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [request, setRequest] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-force-light", "true");
    document.documentElement.classList.remove("dark");
    return () => {
      document.documentElement.removeAttribute("data-force-light");
    };
  }, []);

  // Form states
  const [personal, setPersonal] = useState({
    full_name: "", personal_number: "", citizenship_no: "",
    nid_number: "", phone_number: "+977 ", sex: "male", email: ""
  });
  const [family, setFamily] = useState({
    father_name: "", father_phone: "+977 ",
    mother_name: "", mother_phone: "+977 ",
    spouse_name: "", grandfather_name: "", grandmother_name: ""
  });
  const [address, setAddress] = useState({
    current_posting_address: "", permanent_living_address: "", temporary_living_address: ""
  });
  const [files, setFiles] = useState({ citizenship_pdf: null, traffic_id: null, education_certificate: null, health_certificate: null, training_certificate: null });

  useEffect(() => {
    if (!token) {
      toast.error("Invalid verification token.");
      navigate("/login");
      return;
    }
    fetchRequest();
  }, [token]);

  const fetchRequest = async () => {
    try {
      const { data } = await getVerificationRequest(token);
      setRequest(data);
      if (data.credentials) {
        if (data.credentials.personal) setPersonal(prev => ({ ...prev, ...data.credentials.personal }));
        if (data.credentials.family) setFamily(prev => ({ ...prev, ...data.credentials.family }));
        if (data.credentials.address) setAddress(data.credentials.address);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load request.");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (isFinal = false) => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("is_final", isFinal);
      formData.append("personal", JSON.stringify({ ...personal, email: personal.email || request.email }));
      formData.append("family", JSON.stringify(family));
      formData.append("address", JSON.stringify(address));

      if (files.citizenship_pdf) formData.append("citizenship_pdf", files.citizenship_pdf);
      if (files.traffic_id) formData.append("traffic_id", files.traffic_id);
      if (files.education_certificate) formData.append("education_certificate", files.education_certificate);
      if (files.health_certificate) formData.append("health_certificate", files.health_certificate);
      if (files.training_certificate) formData.append("training_certificate", files.training_certificate);

      await submitCredentials(formData);
      toast.success(isFinal ? "Credentials submitted for review!" : "Draft saved successfully.");

      if (isFinal) {
        navigate("/login");
      } else {
        fetchRequest();
      }
    } catch (err) {
      toast.error("Failed to save. Please check your data.");
    } finally {
      setSaving(false);
    }
  };

  const isPersonalValid = () => {
    const phoneRegex = /^\+977\s\d{10}$/;
    const citizenshipRegex = /^([a-zA-Z\u0900-\u097F]\s?\d{5,7}|\d{10})$/;
    const nidRegex = /^\d{10}$/;

    return !!(
      personal.full_name?.trim() &&
      personal.sex?.trim() &&
      personal.citizenship_no?.trim() && citizenshipRegex.test(personal.citizenship_no.trim()) &&
      personal.nid_number?.trim() && nidRegex.test(personal.nid_number.trim()) &&
      personal.personal_number?.trim() &&
      personal.phone_number?.trim() && phoneRegex.test(personal.phone_number.trim())
    );
  };

  const isFamilyValid = () => {
    const phoneRegex = /^\+977\s\d{10}$/;
    return !!(
      family.father_name?.trim() &&
      family.father_phone?.trim() && phoneRegex.test(family.father_phone.trim()) &&
      family.mother_name?.trim() &&
      family.mother_phone?.trim() && phoneRegex.test(family.mother_phone.trim()) &&
      family.grandfather_name?.trim() &&
      family.grandmother_name?.trim()
    );
  };

  const isAddressValid = () => {
    return !!(
      address.current_posting_address?.trim() &&
      address.permanent_living_address?.trim() &&
      address.temporary_living_address?.trim()
    );
  };

  const isDocumentsValid = () => {
    return !!(
      (files.citizenship_pdf || docUrls.citizenship_pdf) &&
      (files.traffic_id || docUrls.traffic_id) &&
      (files.education_certificate || docUrls.education_certificate) &&
      (files.health_certificate || docUrls.health_certificate) &&
      (files.training_certificate || docUrls.training_certificate)
    );
  };

  const isStepValid = () => {
    if (step === 1) return isPersonalValid();
    if (step === 2) return isFamilyValid();
    if (step === 3) return isAddressValid();
    if (step === 4) return isDocumentsValid();
    return true;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Spinner size="lg" /></div>;

  const steps = [
    { id: 1, label: "Personal", icon: User },
    { id: 2, label: "Family", icon: Users },
    { id: 3, label: "Address", icon: MapPin },
    { id: 4, label: "Documents", icon: FileText },
  ];

  const docUrls = request?.credentials?.document_urls || {};

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-5 sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Verification Dashboard</h1>
              <p className="text-xs text-slate-500 font-medium">Policy Maker Registration as <strong className="font-bold text-slate-800">{request.email}</strong></p>
            </div>
          </div>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-sm font-semibold border border-slate-200"
          >
            <Save size={15} />
            {saving ? "Saving..." : "Save Draft"}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 mt-10">
        {/* Step Progress */}
        <div className="flex items-center justify-between mb-10 relative">
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-200 -z-10 mx-6" />
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <div key={s.id} className="flex flex-col items-center gap-2">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300
                    ${isActive ? "bg-blue-600 border-blue-600 text-white scale-110 shadow-lg shadow-blue-600/20" :
                      isCompleted ? "bg-emerald-500 border-emerald-500 text-white" :
                        "bg-white border-slate-200 text-slate-400"}`}
                >
                  {isCompleted ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? "text-blue-600" : isCompleted ? "text-emerald-600" : "text-slate-400"}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-600" />
          <div className="p-8">

            {/* STEP 1: Personal Details */}
            {step === 1 && (
              <div className="space-y-6 animate-fade-in">
                <div className="mb-2">
                  <h3 className="text-lg font-bold text-slate-900">Personal Details</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Enter your personal identification information</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FieldGroup label="Full Name (as per citizenship)" required>
                    <input className={inputCls} value={personal.full_name} onChange={e => setPersonal({ ...personal, full_name: e.target.value.replace(/[^A-Za-z\u0900-\u097F\s]/g, '') })} placeholder="Your full name" />
                  </FieldGroup>
                  <FieldGroup label="Sex" required>
                    <select className={inputCls} value={personal.sex} onChange={e => setPersonal({ ...personal, sex: e.target.value })}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Citizenship Number" required>
                    <input className={inputCls} value={personal.citizenship_no} onChange={e => setPersonal({ ...personal, citizenship_no: e.target.value })} placeholder="e.g. क 1234567 or 1234567890" />
                  </FieldGroup>
                  <FieldGroup label="NID Number" required>
                    <input className={inputCls} value={personal.nid_number} onChange={e => setPersonal({ ...personal, nid_number: e.target.value.replace(/\D/g, '') })} placeholder="10-digit National ID" maxLength={10} />
                  </FieldGroup>
                  <FieldGroup label="Badge Number" required>
                    <input className={inputCls} value={personal.personal_number} onChange={e => setPersonal({ ...personal, personal_number: e.target.value })} placeholder="Unique badge number" />
                  </FieldGroup>
                  <FieldGroup label="Phone Number" required>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input className={inputCls + " pl-9"} value={personal.phone_number} onChange={e => {
                        let val = e.target.value;
                        if (!val.startsWith('+977 ')) val = '+977 ' + val.replace(/^\+?977\s?/, '');
                        let digits = val.slice(5).replace(/\D/g, '').slice(0, 10);
                        setPersonal({ ...personal, phone_number: '+977 ' + digits });
                      }} placeholder="+977 98XXXXXXXX" />
                    </div>
                  </FieldGroup>
                  <div className="md:col-span-2">
                    <FieldGroup label="Email Address">
                      <input className={inputCls + " bg-slate-50 cursor-not-allowed text-slate-500"} value={personal.email || request.email} disabled />
                    </FieldGroup>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Family Details */}
            {step === 2 && (
              <div className="space-y-6 animate-fade-in">
                <div className="mb-2">
                  <h3 className="text-lg font-bold text-slate-900">Family Details</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Provide family lineage and contact information</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FieldGroup label="Father's Name" required>
                    <input className={inputCls} value={family.father_name} onChange={e => setFamily({ ...family, father_name: e.target.value.replace(/[^A-Za-z\u0900-\u097F\s]/g, '') })} />
                  </FieldGroup>
                  <FieldGroup label="Father's Phone Number" required>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input className={inputCls + " pl-9"} value={family.father_phone} onChange={e => {
                        let val = e.target.value;
                        if (!val.startsWith('+977 ')) val = '+977 ' + val.replace(/^\+?977\s?/, '');
                        let digits = val.slice(5).replace(/\D/g, '').slice(0, 10);
                        setFamily({ ...family, father_phone: '+977 ' + digits });
                      }} placeholder="+977 98XXXXXXXX" />
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Mother's Name" required>
                    <input className={inputCls} value={family.mother_name} onChange={e => setFamily({ ...family, mother_name: e.target.value.replace(/[^A-Za-z\u0900-\u097F\s]/g, '') })} />
                  </FieldGroup>
                  <FieldGroup label="Mother's Phone Number" required>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input className={inputCls + " pl-9"} value={family.mother_phone} onChange={e => {
                        let val = e.target.value;
                        if (!val.startsWith('+977 ')) val = '+977 ' + val.replace(/^\+?977\s?/, '');
                        let digits = val.slice(5).replace(/\D/g, '').slice(0, 10);
                        setFamily({ ...family, mother_phone: '+977 ' + digits });
                      }} placeholder="+977 98XXXXXXXX" />
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Spouse's Name (Optional)">
                    <input className={inputCls} value={family.spouse_name} onChange={e => setFamily({ ...family, spouse_name: e.target.value.replace(/[^A-Za-z\u0900-\u097F\s]/g, '') })} />
                  </FieldGroup>
                  <FieldGroup label="Grandfather's Name" required>
                    <input className={inputCls} value={family.grandfather_name} onChange={e => setFamily({ ...family, grandfather_name: e.target.value.replace(/[^A-Za-z\u0900-\u097F\s]/g, '') })} />
                  </FieldGroup>
                  <FieldGroup label="Grandmother's Name" required>
                    <input className={inputCls} value={family.grandmother_name} onChange={e => setFamily({ ...family, grandmother_name: e.target.value.replace(/[^A-Za-z\u0900-\u097F\s]/g, '') })} />
                  </FieldGroup>
                </div>
              </div>
            )}

            {/* STEP 3: Address Details */}
            {step === 3 && (
              <div className="space-y-6 animate-fade-in">
                <div className="mb-2">
                  <h3 className="text-lg font-bold text-slate-900">Address Information</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Provide your current and permanent addresses</p>
                </div>
                <div className="space-y-5">
                  <FieldGroup label="Current Posting Address" required>
                    <input className={inputCls} value={address.current_posting_address} onChange={e => setAddress({ ...address, current_posting_address: e.target.value })} placeholder="Current work/posting location" />
                  </FieldGroup>
                  <FieldGroup label="Permanent Living Address" required>
                    <input className={inputCls} value={address.permanent_living_address} onChange={e => setAddress({ ...address, permanent_living_address: e.target.value })} placeholder="Permanent residential address" />
                  </FieldGroup>
                  <FieldGroup label="Temporary Living Address" required>
                    <input className={inputCls} value={address.temporary_living_address} onChange={e => setAddress({ ...address, temporary_living_address: e.target.value })} placeholder="Current temporary address (if different)" />
                  </FieldGroup>
                </div>
              </div>
            )}

            {/* STEP 4: Documents */}
            {step === 4 && (
              <div className="space-y-6 animate-fade-in">
                <div className="mb-2">
                  <h3 className="text-lg font-bold text-slate-900">Formal Documents</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Upload your required documents for verification</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FileDropZone
                    label="Citizenship Document (PDF/Image)"
                    required
                    file={files.citizenship_pdf}
                    onChange={e => setFiles({ ...files, citizenship_pdf: e.target.files[0] })}
                    accept=".pdf,image/*"
                    existingUrl={docUrls.citizenship_pdf}
                  />
                  <FileDropZone
                    label="Traffic Police Identity Card"
                    required
                    file={files.traffic_id}
                    onChange={e => setFiles({ ...files, traffic_id: e.target.files[0] })}
                    accept="image/*,.pdf"
                    existingUrl={docUrls.traffic_id}
                  />
                  <FileDropZone
                    label="Education Certificate (PDF/Image)"
                    required
                    file={files.education_certificate}
                    onChange={e => setFiles({ ...files, education_certificate: e.target.files[0] })}
                    accept=".pdf,image/*"
                    existingUrl={docUrls.education_certificate}
                  />
                  <FileDropZone
                    label="Health Certificate (PDF/Image)"
                    required
                    file={files.health_certificate}
                    onChange={e => setFiles({ ...files, health_certificate: e.target.files[0] })}
                    accept=".pdf,image/*"
                    existingUrl={docUrls.health_certificate}
                  />
                  <div className="md:col-span-2">
                    <FileDropZone
                      label="Training Certificate (PDF/Image)"
                      required
                      file={files.training_certificate}
                      onChange={e => setFiles({ ...files, training_certificate: e.target.files[0] })}
                      accept=".pdf,image/*"
                      existingUrl={docUrls.training_certificate}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-10 pt-8 border-t border-slate-100">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep(step - 1)}
                  disabled={step === 1}
                  className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 disabled:opacity-0 transition-all"
                >
                  <ArrowLeft size={18} />
                  Previous
                </button>


              </div>

              {step < 4 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!isStepValid()}
                  className="flex items-center gap-2 px-8 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none transition-all shadow-md shadow-blue-600/20"
                >
                  Next Step
                  <ArrowRight size={18} />
                </button>
              ) : (
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || !isStepValid()}
                  className="flex items-center gap-2 px-10 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none transition-all shadow-md shadow-emerald-600/20"
                >
                  {saving ? "Submitting..." : "Submit"}
                </button>
              )}
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
