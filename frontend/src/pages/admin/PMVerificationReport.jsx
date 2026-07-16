// src/pages/admin/PMVerificationReport.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getVerificationReport, approveCredentials, rejectCredentials } from "../../api";
import Spinner from "../../components/ui/Spinner";
import { 
  ArrowLeft, CheckCircle2, XCircle, FileText, 
  ExternalLink, User, Users, MapPin, ShieldCheck, 
  Trash2, AlertCircle, Download, Phone, CreditCard, Eye
} from "lucide-react";
import toast from "react-hot-toast";

// ─── PDF Download Helper ───────────────────────────────────────────────────────
function buildPDFContent(request) {
  const { credentials, email, id, created_at, updated_at } = request;
  const p = credentials?.personal || {};
  const f = credentials?.family || {};
  const a = credentials?.address || {};

  const getDocImage = (key) => {
    const doc = credentials?.document_urls?.[key];
    if (!doc) return null;
    const isObj = typeof doc === 'object';
    const previewUrl = isObj ? doc.preview : doc;
    const imagePreviewUrl = isObj ? doc.image_preview : null;
    return imagePreviewUrl || previewUrl;
  };

  const docsList = [
    { key: 'citizenship_pdf', label: 'Citizenship Document' },
    { key: 'traffic_id', label: 'Traffic Police Identity Card' },
    { key: 'education_certificate', label: 'Education Certificate' },
    { key: 'health_certificate', label: 'Health Certificate' },
    { key: 'training_certificate', label: 'Training Certificate' },
  ];

  let docImagesHtml = '';
  docsList.forEach(doc => {
    const imgUrl = getDocImage(doc.key);
    if (imgUrl) {
      docImagesHtml += `
        <div style="page-break-before: always; margin-top: 40px; text-align: center;">
          <div class="section-title" style="margin-bottom: 20px; font-size: 14px;">${doc.label} (Attachment)</div>
          <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 10px; background: #f8fafc; display: inline-block;">
            <img src="${imgUrl}" style="max-width: 100%; max-height: 900px; object-fit: contain; border-radius: 8px;" />
          </div>
        </div>
      `;
    }
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <title>PM Verification Report</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; padding: 40px; }
        .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .badge { background: #2563eb; color: white; width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; }
        .header-title h1 { font-size: 22px; font-weight: 800; color: #1e293b; }
        .header-title p { font-size: 12px; color: #64748b; margin-top: 4px; }
        .section { margin-bottom: 28px; }
        .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .field label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 4px; }
        .field p { font-size: 13px; font-weight: 600; color: #1e293b; }
        .field p.empty { color: #cbd5e1; font-style: italic; }
        .docs-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
        .doc-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
        .doc-item:last-child { border-bottom: none; }
        .doc-name { font-size: 12px; font-weight: 600; color: #475569; }
        .doc-status { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
        .doc-status.uploaded { background: #dcfce7; color: #16a34a; }
        .doc-status.missing { background: #fee2e2; color: #dc2626; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
        .stamp { display: inline-block; padding: 6px 16px; border: 2px solid #2563eb; border-radius: 8px; color: #2563eb; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="badge">PM</div>
        <div class="header-title">
          <h1>Policy Maker Verification Report</h1>
          <p>Application Email: ${email} &nbsp;|&nbsp; Request ID: ${id}</p>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Personal Identity</div>
        <div class="grid">
          <div class="field"><label>Full Name</label><p>${p.full_name || "—"}</p></div>
          <div class="field"><label>Biological Sex</label><p>${p.sex || "—"}</p></div>
          <div class="field"><label>Citizenship Number</label><p>${p.citizenship_no || "—"}</p></div>
          <div class="field"><label>NID Number</label><p>${p.nid_number || "—"}</p></div>
          <div class="field"><label>Personal Number</label><p>${p.personal_number || "—"}</p></div>
          <div class="field"><label>Phone Number</label><p>${p.phone_number || "—"}</p></div>
          <div class="field"><label>Email Address</label><p>${email}</p></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Family Records</div>
        <div class="grid">
          <div class="field"><label>Father's Name</label><p>${f.father_name || "—"}</p></div>
          <div class="field"><label>Father's Phone</label><p>${f.father_phone || "—"}</p></div>
          <div class="field"><label>Mother's Name</label><p>${f.mother_name || "—"}</p></div>
          <div class="field"><label>Mother's Phone</label><p>${f.mother_phone || "—"}</p></div>
          <div class="field"><label>Spouse's Name</label><p>${f.spouse_name || "—"}</p></div>
          <div class="field"><label>Grandfather's Name</label><p>${f.grandfather_name || "—"}</p></div>
          <div class="field"><label>Grandmother's Name</label><p>${f.grandmother_name || "—"}</p></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Geographic Data</div>
        <div class="field" style="margin-bottom:12px"><label>Current Posting Address</label><p>${a.current_posting_address || "—"}</p></div>
        <div class="field" style="margin-bottom:12px"><label>Permanent Living Address</label><p>${a.permanent_living_address || "—"}</p></div>
        <div class="field"><label>Temporary Living Address</label><p>${a.temporary_living_address || "—"}</p></div>
      </div>

      <div class="section">
        <div class="section-title">Submitted Documents</div>
        <div class="docs-section">
          <div class="doc-item">
            <span class="doc-name">Citizenship Document</span>
            <span class="doc-status ${credentials?.document_urls?.citizenship_pdf ? 'uploaded' : 'missing'}">${credentials?.document_urls?.citizenship_pdf ? 'Uploaded' : 'Missing'}</span>
          </div>
          <div class="doc-item">
            <span class="doc-name">Traffic Police Identity Card</span>
            <span class="doc-status ${credentials?.document_urls?.traffic_id ? 'uploaded' : 'missing'}">${credentials?.document_urls?.traffic_id ? 'Uploaded' : 'Missing'}</span>
          </div>
          <div class="doc-item">
            <span class="doc-name">Education Certificate</span>
            <span class="doc-status ${credentials?.document_urls?.education_certificate ? 'uploaded' : 'missing'}">${credentials?.document_urls?.education_certificate ? 'Uploaded' : 'Missing'}</span>
          </div>
          <div class="doc-item">
            <span class="doc-name">Health Certificate</span>
            <span class="doc-status ${credentials?.document_urls?.health_certificate ? 'uploaded' : 'missing'}">${credentials?.document_urls?.health_certificate ? 'Uploaded' : 'Missing'}</span>
          </div>
          <div class="doc-item">
            <span class="doc-name">Training Certificate</span>
            <span class="doc-status ${credentials?.document_urls?.training_certificate ? 'uploaded' : 'missing'}">${credentials?.document_urls?.training_certificate ? 'Uploaded' : 'Missing'}</span>
          </div>
        </div>
      </div>

      <div class="footer">
        <span>Submission Date: ${new Date(updated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
        <span>CollisionGuard Verification System — Confidential</span>
      </div>

      ${docImagesHtml}
    </body>
    </html>
  `;
}

function downloadPDF(request) {
  const content = buildPDFContent(request);
  const blob = new Blob([content], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.onload = () => {
      win.focus();
      setTimeout(() => {
        win.print();
      }, 1000);
    };
  }
}

// ─── Document Card ─────────────────────────────────────────────────────────────
function DocCard({ label, url, icon: Icon, onPreview }) {
  const isObj = url && typeof url === 'object';
  const previewUrl = isObj ? url.preview : url;
  const downloadUrl = isObj ? url.download : url;
  const imagePreviewUrl = isObj ? url.image_preview : null;

  const isPDF = typeof previewUrl === 'string' && (
    previewUrl.toLowerCase().includes(".pdf") || 
    previewUrl.includes("resource_type=raw")
  );

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        {previewUrl && (
          <button
            onClick={() => onPreview({ label, previewUrl, downloadUrl, imagePreviewUrl })}
            className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors uppercase tracking-wider"
          >
            <Eye size={12} />
            Preview
          </button>
        )}
      </div>
      {previewUrl ? (
        <>
          {/* Clickable Preview Container */}
          <div 
            onClick={() => onPreview({ label, previewUrl, downloadUrl, imagePreviewUrl })}
            className="w-full h-36 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 relative group cursor-pointer"
          >
            {imagePreviewUrl ? (
              <img 
                src={imagePreviewUrl} 
                alt={label} 
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" 
              />
            ) : isPDF ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50/50 dark:bg-blue-950/20 text-blue-500 gap-2">
                <FileText size={32} />
                <span className="text-xs font-semibold">PDF Document</span>
              </div>
            ) : (
              <img 
                src={previewUrl} 
                alt={label} 
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" 
              />
            )}
            
            {/* Interactive Glassmorphic Overlay */}
            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <span className="text-white text-xs font-bold uppercase tracking-wider bg-slate-950/75 px-3 py-2 rounded-xl backdrop-blur-sm flex items-center gap-2 border border-white/10 shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                <Eye size={14} />
                Quick View
              </span>
            </div>
          </div>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm hover:shadow transition-all duration-200"
          >
            <Download size={13} />
            Download Original
          </a>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-28 gap-2 text-slate-400 dark:text-slate-600 bg-slate-100/50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <XCircle size={24} />
          <span className="text-xs font-medium">Not uploaded</span>
        </div>
      )}
    </div>
  );
}

// ─── Field Row ─────────────────────────────────────────────────────────────────
function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value || "—"}</p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PMVerificationReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => { fetchReport(); }, [id]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setPreviewDoc(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchReport = async () => {
    try {
      const { data } = await getVerificationReport(id);
      setRequest(data);
    } catch {
      toast.error("Failed to load verification report.");
      navigate("/admin/verification");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!window.confirm("CONFIRM ELIGIBILITY: Are you sure these credentials are valid? This will send a login setup link to the applicant.")) return;
    setActioning(true);
    try {
      await approveCredentials(id);
      toast.success("Policy Maker approved and notified!");
      navigate("/admin/verification");
    } catch {
      toast.error("Approval failed.");
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt("Enter rejection reason (this will be sent to the PM and ALL documents will be wiped):");
    if (!reason) return;
    setActioning(true);
    try {
      await rejectCredentials(id, reason);
      toast.success("Credentials rejected. Files purged.");
      navigate("/admin/verification");
    } catch {
      toast.error("Rejection failed.");
    } finally {
      setActioning(false);
    }
  };

  if (loading || !request) return <div className="py-20 flex justify-center"><Spinner size="lg" /></div>;

  const { credentials, email } = request;
  const docUrls = credentials?.document_urls || {};
  const submissionDate = request.updated_at 
    ? new Date(request.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "N/A";

  return (
    <div className="max-w-5xl mx-auto pb-20 fade-up">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8">
        <Link to="/admin/verification" className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft size={18} />
          Back to Queue
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadPDF(request)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all text-sm font-bold shadow-sm"
          >
            <Download size={16} />
            Download PDF
          </button>
          <button 
            onClick={handleReject} 
            disabled={actioning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all text-sm font-bold"
          >
            <Trash2 size={16} />
            Reject & Purge
          </button>
          <button 
            onClick={handleApprove} 
            disabled={actioning}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all text-sm font-bold"
          >
            <CheckCircle2 size={16} />
            Confirm Eligibility
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-6">

          {/* Personal Identity */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500"><User size={17} /></div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Personal Identity</h3>
            </div>
            <div className="p-6 grid grid-cols-2 gap-y-5 gap-x-10">
              <InfoField label="Full Name" value={credentials?.personal?.full_name} />
              <InfoField label="Email" value={email} />
              <InfoField label="Citizenship Number" value={credentials?.personal?.citizenship_no} />
              <InfoField label="NID Number" value={credentials?.personal?.nid_number} />
              <InfoField label="Personal Number" value={credentials?.personal?.personal_number} />
              <InfoField label="Phone Number" value={credentials?.personal?.phone_number} />
              <InfoField label="Biological Sex" value={credentials?.personal?.sex} />
            </div>
          </section>

          {/* Family Records */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-500"><Users size={17} /></div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Family Records</h3>
            </div>
            <div className="p-6 grid grid-cols-2 gap-y-5 gap-x-10">
              <InfoField label="Father's Name" value={credentials?.family?.father_name} />
              <InfoField label="Father's Phone" value={credentials?.family?.father_phone} />
              <InfoField label="Mother's Name" value={credentials?.family?.mother_name} />
              <InfoField label="Mother's Phone" value={credentials?.family?.mother_phone} />
              <InfoField label="Spouse" value={credentials?.family?.spouse_name} />
              <InfoField label="Grandfather" value={credentials?.family?.grandfather_name} />
              <InfoField label="Grandmother" value={credentials?.family?.grandmother_name} />
            </div>
          </section>

          {/* Address */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500"><MapPin size={17} /></div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Geographic Data</h3>
            </div>
            <div className="p-6 space-y-5">
              <InfoField label="Current Posting Address" value={credentials?.address?.current_posting_address} />
              <InfoField label="Permanent Living Address" value={credentials?.address?.permanent_living_address} />
              <InfoField label="Temporary Living Address" value={credentials?.address?.temporary_living_address} />
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Documents Panel */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600/10 rounded-lg flex items-center justify-center text-blue-600"><FileText size={17} /></div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Documents</h3>
            </div>
            <div className="p-5 space-y-4">
              <DocCard label="Citizenship Document" url={docUrls.citizenship_pdf} icon={CreditCard} onPreview={setPreviewDoc} />
              <DocCard label="Traffic Police Identity" url={docUrls.traffic_id} icon={ShieldCheck} onPreview={setPreviewDoc} />
              <DocCard label="Education Certificate" url={docUrls.education_certificate} icon={FileText} onPreview={setPreviewDoc} />
              <DocCard label="Health Certificate" url={docUrls.health_certificate} icon={FileText} onPreview={setPreviewDoc} />
              <DocCard label="Training Certificate" url={docUrls.training_certificate} icon={FileText} onPreview={setPreviewDoc} />
            </div>
          </section>

          {/* Verification Status */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-blue-600">
              <AlertCircle size={16} />
              <span className="text-xs font-black uppercase tracking-widest">Verification Status</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-100">
              <span className="text-xs text-slate-500 font-medium">Submission Date</span>
              <span className="text-xs font-bold text-slate-800">{submissionDate}</span>
            </div>
            <div className="pt-1">
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="w-3/4 h-full bg-blue-500 rounded-full" />
              </div>
              <p className="text-[9px] text-slate-400 mt-2 text-center uppercase tracking-widest font-bold">Verification Stage 3 of 4</p>
            </div>
          </div>
        </div>
      </div>

      {/* Premium Document Preview Modal */}
      {previewDoc && (
        <div 
          onClick={() => setPreviewDoc(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md transition-all duration-300"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-scale-up"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-500">
                  <FileText size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">{previewDoc.label}</h4>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-0.5">Interactive Document Viewer</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-colors shadow-sm"
                >
                  <Download size={14} />
                  Download
                </a>
                <a
                  href={previewDoc.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold transition-colors shadow-sm"
                >
                  <ExternalLink size={14} />
                  Open in New Tab
                </a>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-6 flex flex-col items-center justify-center overflow-hidden relative">
              {previewDoc.imagePreviewUrl ? (
                <>
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <img
                      src={previewDoc.imagePreviewUrl}
                      alt={previewDoc.label}
                      className="max-w-full max-h-full object-contain rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    />
                  </div>
                  {typeof previewDoc.previewUrl === 'string' && previewDoc.previewUrl.toLowerCase().includes('.pdf') && (
                    <div className="absolute bottom-8 bg-slate-900/80 text-white text-[11px] px-5 py-2.5 rounded-full backdrop-blur-md font-semibold shadow-2xl border border-white/10 tracking-wide">
                      Showing Page 1 Preview. Click 'Open in New Tab' to read full document.
                    </div>
                  )}
                </>
              ) : previewDoc.previewUrl.toLowerCase().includes('.pdf') ||
                  previewDoc.previewUrl.toLowerCase().includes('policy_supporting') ||
                  previewDoc.previewUrl.toLowerCase().includes('credential') ||
                  previewDoc.previewUrl.includes('resource_type=raw') ? (
                <iframe
                  src={previewDoc.previewUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 'none' }}
                  title="Document Preview"
                  className="rounded-2xl"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2">
                  <img
                    src={previewDoc.previewUrl}
                    alt={previewDoc.label}
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
