import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
      setSubmitted(true);
      toast.success("Recovery link sent!");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-900 p-6 animate-in fade-in duration-500 transition-colors duration-300">
        <div className="w-full max-w-md card p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Check your email</h1>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
            If an account exists for <span className="text-slate-900 dark:text-white font-bold">{email}</span>, you will receive a password reset link shortly.
          </p>
          <div className="pt-4">
            <Link to="/login" className="btn-secondary w-full inline-flex items-center justify-center gap-2 py-3">
              <ArrowLeft size={18} /> Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-900 p-6 transition-colors duration-300">
      <div className="w-full max-w-md space-y-8 animate-in slide-in-from-bottom-8 duration-700">
        <div className="text-center">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Forgot Password?</h1>
          <p className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8 space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-500 transition-colors" size={18} />
              <input
                type="email"
                required
                className="input pl-12 py-4"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-4 text-sm font-black uppercase tracking-widest shadow-xl shadow-primary-900/20 disabled:opacity-50"
          >
            {loading ? "Sending link..." : "Send Reset Link"}
          </button>

          <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors pt-2 group">
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back to Login
          </Link>
        </form>
      </div>
    </div>
  );
}
