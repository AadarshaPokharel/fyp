import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { setPassword } from "../api";
import { Lock, ShieldCheck, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPasswordState] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error("Invalid or missing reset token.");
      navigate("/login");
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast.error("Passwords do not match.");
    }
    setLoading(true);
    try {
      await setPassword(token, password);
      setSuccess(true);
      toast.success("Password reset successfully!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-900 p-6 animate-in zoom-in-95 duration-500 transition-colors duration-300">
        <div className="w-full max-w-md card p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Success!</h1>
          <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
            Your password has been updated. You can now log in with your new credentials.
          </p>
          <div className="pt-4">
            <Link to="/login" className="btn-primary w-full inline-flex items-center justify-center py-4 text-sm font-black uppercase tracking-widest">
              Log In Now
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-900 p-6 transition-colors duration-300">
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary-500/10 text-primary-500 mb-6">
                <ShieldCheck size={28} />
            </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Secure Reset</h1>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Please enter your new strong password below.</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8 space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">New Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                className="input pl-12 pr-12 py-4"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPasswordState(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Confirm New Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                required
                className="input pl-12 py-4"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="p-4 bg-slate-100 dark:bg-dark-800/50 rounded-xl border border-slate-200 dark:border-dark-700/50 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Requirements</p>
            <ul className="text-xs text-slate-600 dark:text-slate-400 font-medium space-y-1.5">
                <li className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full ${password.length >= 8 ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                    Minimum 8 characters long
                </li>
                <li className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full ${password && password === confirmPassword ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                    Passwords must match
                </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 text-sm font-black uppercase tracking-widest shadow-xl shadow-primary-900/20 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
