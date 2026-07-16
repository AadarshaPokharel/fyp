// src/pages/Login.jsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { login as apiLogin } from "../api";
import toast from "react-hot-toast";
import { Mail, Lock, LogIn, Eye, EyeOff, Activity, BarChart2, Cpu } from "lucide-react";
import Spinner from "../components/ui/Spinner";

function friendlyLoginError(err) {
  const status = err.response?.status;
  const raw = err.response?.data?.detail;
  const detail =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? raw.map((e) => e?.msg || String(e)).join(" ")
        : "";

  if (err.code === "ERR_NETWORK" || !err.response) {
    return {
      title: "Can't connect right now",
      body: "We couldn't reach the sign-in service. Check your internet connection, or try again in a few minutes.",
    };
  }
  if (status === 403) {
    return {
      title: "Account not ready yet",
      body:
        detail.includes("not active") || detail.includes("password")
          ? "Your account isn't active yet. Use the link in your invite email to set your password, then try signing in again."
          : detail || "You don't have access yet. Contact your administrator.",
    };
  }
  if (status === 401 || /invalid|credentials|unauthorized/i.test(detail)) {
    return {
      title: "Sign-in didn't work",
      body: "That email or password doesn't match our records. Double-check and try again.",
    };
  }
  if (status === 422 || status === 400) {
    return { title: "Check your details", body: detail || "Please fix the highlighted fields and try again." };
  }
  return { title: "Something went wrong", body: detail || "Please try again. If the problem continues, contact support." };
}

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate(user.role === "admin" ? "/admin" : "/dashboard", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const email = username.trim();
      const { data } = await apiLogin(email, password);
      signIn(data, data);
      const displayName = data.profile?.name || data.name || data.username || "there";
      toast.success(
        () => (
          <div className="flex flex-col gap-0.5 pr-6">
            <span className="font-semibold text-slate-900">You&apos;re in</span>
            <span className="text-sm text-slate-600">Welcome back, {displayName}.</span>
          </div>
        ),
        { duration: 4000, icon: "✓" }
      );
      navigate(data.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      const { title, body } = friendlyLoginError(err);
      toast.error(
        () => (
          <div className="flex flex-col gap-1 pr-6">
            <span className="font-semibold">{title}</span>
            <span className="text-sm leading-snug opacity-80">{body}</span>
          </div>
        ),
        { duration: 5500 }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080d14] bg-grid p-6 transition-colors duration-300 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />

      <div className="w-full max-w-sm relative z-10 fade-up">
        {/* Branding/Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-lg shadow-primary/30 glow-blue">
            <Activity size={32} className="text-white" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight font-heading">Welcome</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">Sign in to your dashboard</p>
        </div>

        {/* Form card */}
        <div className="card-glass border border-white/20 dark:border-white/5 p-8 shadow-2xl shadow-slate-200/50 dark:shadow-black/40">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-2.5 px-1">Email Address</label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-primary transition-colors">
                  <Mail size={18} />
                </span>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="input w-full pl-12 pr-4"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2.5 px-1">
                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Password</label>
                <Link to="/forgot-password" name="forgot-password" id="forgot-password-link" className="text-[10px] text-primary hover:text-primary-light font-black uppercase tracking-wider transition-colors">
                  Forgot?
                </Link>
              </div>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-primary transition-colors">
                  <Lock size={18} />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  className="input w-full pl-12 pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-3 py-4 mt-2 active:scale-[0.98]"
            >
              {loading ? <Spinner size="sm" /> : (
                <>
                  <LogIn size={18} />
                  <span className="font-black text-[11px] uppercase tracking-[0.2em]">Sign In</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 dark:text-slate-600 text-xs mt-10 font-medium">
          Apply as <Link to="/register" className="text-primary font-bold hover:underline">Policy Maker</Link>
        </p>
      </div>
    </div>
  );
}

