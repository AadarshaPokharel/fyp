import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UploadCloud, CheckCircle2, ArrowLeft, FileText, AlertCircle } from "lucide-react";
import api from "../../api";
import toast from "react-hot-toast";

export default function FinalSubmission() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPolicy();
  }, [id]);

  const fetchPolicy = async () => {
    try {
      const { data } = await api.get(`/policies/${id}`);
      if (data.status !== "awaiting_final_submission") {
        toast.error("Policy is not awaiting final submission");
        navigate("/dashboard/policies");
        return;
      }
      setPolicy(data);
    } catch (err) {
      toast.error("Failed to load policy");
      navigate("/dashboard/policies");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (selected.size > 10 * 1024 * 1024) {
        toast.error("File size must be under 10MB");
        return;
      }
      setFile(selected);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Please select a file to upload");
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post(`/policies/${id}/final-submission`, formData);
      toast.success("Final submission completed successfully!");
      navigate("/dashboard/policies");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit documents");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <button onClick={() => navigate("/dashboard/policies")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Final Policy Submission</h1>
        <p className="text-sm text-slate-500 mt-1">Upload the finalized analysis, implementation plan, and presentation for your approved policy.</p>
      </div>

      <div className="card p-8 border-t-4 border-emerald-500 space-y-8">
        <div className="flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
          <CheckCircle2 className="text-emerald-500 shrink-0" size={24} />
          <div>
            <h3 className="font-bold text-emerald-900 dark:text-emerald-400">Policy Approved: {policy?.title}</h3>
            <p className="text-sm text-emerald-700 dark:text-emerald-500/80 mt-1 leading-relaxed">
              Congratulations! The administration has approved your initial proposal. To formally integrate this policy into the CollisionGuard system, you must provide the detailed technical documentation.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Required Documents</h3>
          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-disc list-inside px-2">
            <li>Detailed Impact Analysis Report (PDF format preferred)</li>
            <li>Implementation Strategy Presentation (PPT/PDF)</li>
            <li>Any supporting statistical data or references</li>
          </ul>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Upload Combined Archive or PDF</label>
          <label className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all group ${file ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"}`}>
            {file ? (
              <FileText className="text-emerald-500" size={40} />
            ) : (
              <UploadCloud className="text-slate-400 group-hover:text-blue-500 transition-colors" size={40} />
            )}
            <div className="text-center">
              {file ? (
                <>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{file.name}</p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-500/60 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Click to upload or drag & drop</p>
                  <p className="text-xs text-slate-500 mt-1">PDF, PPT, or ZIP (Max. 10MB)</p>
                </>
              )}
            </div>
            <input type="file" accept=".pdf,.ppt,.pptx,.zip" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
          </label>
        </div>

        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
          <AlertCircle className="text-amber-500 shrink-0" size={20} />
          <p className="text-xs text-amber-700 dark:text-amber-500/80 font-medium">
            Note: Once submitted, these documents are securely locked and permanently archived. You will not be able to edit them further.
          </p>
        </div>

        <button 
          onClick={handleSubmit} 
          disabled={submitting || !file} 
          className="btn-primary w-full py-3.5 text-sm font-black tracking-widest disabled:opacity-50"
        >
          {submitting ? "Uploading Securely..." : "Confirm Final Submission"}
        </button>
      </div>
    </div>
  );
}
