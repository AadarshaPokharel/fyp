// src/pages/PMRegistration.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { pmSelfRegister } from "../api";
import toast from "react-hot-toast";
import { Mail, Lock, ArrowRight, CheckCircle2 } from "lucide-react";

export default function PMRegistration() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await pmSelfRegister(email, password);
      setSubmitted(true);
      toast.success("Request submitted successfully!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brandNeutral dark:bg-dark-950 p-6">
        <div className="max-w-md w-full card p-8 text-center space-y-6 fade-up">
          <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto text-emerald-500">
            <CheckCircle2 size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Request Received</h1>
            <p className="text-slate-500 dark:text-slate-400">
              Your application as a Policy Maker has been submitted for review. 
              Our administrators will verify your initial request shortly.
            </p>
          </div>
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 text-xs text-blue-600 dark:text-blue-400 leading-relaxed text-center">
            <p className="font-bold">You will receive the credentials upload link shortly within 24 hours.</p>
          </div>
          <Link to="/login" className="btn btn-primary w-full flex items-center justify-center gap-2">
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brandNeutral dark:bg-dark-950 p-6">
      <div className="mb-8 text-center">
        {/* <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20 rotate-3 hover:rotate-0 transition-transform">
          <ShieldCheck className="text-white" size={32} />
        </div> */}
        {/* <p className="text-slate-500 dark:text-slate-400 font-medium mt-1 uppercase text-[10px] tracking-[0.2em]">Policy Maker Registration</p> */}
      </div>

      <div className="max-w-md w-full card p-8 space-y-8 shadow-2xl relative overflow-hidden fade-up">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full -mr-16 -mt-16" />
        
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Apply for Access</h2>
          <p className="text-sm text-slate-500">Join the network as a policy maker to monitor and manage IoT safety protocols.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Institutional Email</label>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@organization.gov"
                className="input pl-11 h-12 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Temporary Password</label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input pl-11 h-12 text-sm"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="btn btn-primary w-full h-12 flex items-center justify-center gap-2 group shadow-lg shadow-blue-600/20"
          >
            {loading ? "Processing..." : (
              <>
                Submit Initial Request
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500 font-medium">Already have an account?</p>
          <Link to="/login" className="text-xs font-bold text-blue-600 hover:text-blue-500">
            Sign In
          </Link>
        </div>
      </div>
      
      <p className="mt-8 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
        CollisionGuard Enterprise Safety &copy; 2026
      </p>
    </div>
  );
}
