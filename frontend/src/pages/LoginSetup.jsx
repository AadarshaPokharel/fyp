// src/pages/LoginSetup.jsx
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { setupPMPassword } from "../api";
import toast from "react-hot-toast";
import { ShieldCheck, Lock, ArrowRight, CheckCircle2 } from "lucide-react";

export default function LoginSetup() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-force-light", "true");
    document.documentElement.classList.remove("dark");
    return () => {
      document.documentElement.removeAttribute("data-force-light");
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await setupPMPassword(token, password);
      setCompleted(true);
      toast.success("Account activated successfully!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Setup failed. Link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-950 p-6">
        <div className="card max-w-md w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="text-sm text-slate-500">This setup link is invalid or missing a security token.</p>
          <Link to="/login" className="btn btn-primary w-full">Return to Login</Link>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brandNeutral dark:bg-dark-950 p-6">
        <div className="max-w-md w-full card p-10 text-center space-y-6 fade-up border-t-4 border-emerald-500 shadow-2xl">
          <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto text-emerald-500 scale-110">
            <CheckCircle2 size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Access Granted</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">
              Your Policy Maker account is now fully active. 
              You can access the dashboard with your email and new password.
            </p>
          </div>
          <Link to="/login" className="btn btn-primary w-full h-12 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
            Sign In Now
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brandNeutral dark:bg-dark-950 p-6">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20">
          <ShieldCheck className="text-white" size={32} />
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Final Setup</h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium mt-1 uppercase text-[10px] tracking-[0.2em]">Activate Policy Maker Account</p>
      </div>

      <div className="max-w-md w-full card p-10 space-y-8 shadow-2xl relative overflow-hidden fade-up">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 rounded-full -mr-16 -mt-16" />
        
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Security Configuration</h2>
          <p className="text-sm text-slate-500">Create a secure password to finalize your registration and access the IoT network.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Create Password</label>
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

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Confirm Password</label>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
            {loading ? "Activating Account..." : (
              <>
                Activate My Account
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-slate-400 font-medium text-center leading-relaxed">
          By activating your account, you agree to the Institutional Data Policy and security protocols of the CollisionGuard Network.
        </p>
      </div>
    </div>
  );
}
