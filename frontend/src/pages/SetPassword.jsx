// src/pages/SetPassword.jsx
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { setPassword as apiSetPassword } from "../api";
import toast from "react-hot-toast";
import { Cpu, ShieldAlert, Lock, Save, Loader2 } from "lucide-react";

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Strength calculation
  const getStrength = (pwd) => {
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;
    return strength;
  };
  const strength = getStrength(password);
  const passwordsMatch = password && password === confirmPassword;

  useEffect(() => {
    if (!token) {
      toast.error("No setup token found. Check your email.");
      navigate("/login");
    }
  }, [token, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return toast.error("Passwords do not match");
    }
    if (strength < 2) {
      return toast.error("Password is too weak. Please use a mix of characters.");
    }
    setLoading(true);
    try {
      await apiSetPassword(token, password);
      toast.success("Account activated! Please log in.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to set password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brandNeutral dark:bg-[#080d14] p-6 bg-grid relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />

      <div className="w-full max-w-md relative z-10 fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-lg shadow-primary/30 glow-blue">
            <Cpu size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold font-heading text-tertiary-dark dark:text-brandNeutral text-center tracking-tight">
            Account Activation
          </h1>
          <p className="text-tertiary dark:text-tertiary-light mt-2 font-medium text-center">
            Set your secure password to begin.
          </p>
        </div>

        <div className="card-glass border border-white/20 dark:border-white/5 p-8 relative overflow-hidden">
          <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-amber-600 dark:text-amber-400 text-xs mb-8">
            <ShieldAlert size={18} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Use at least 8 characters with a mix of uppercase letters, numbers, and symbols for maximum security.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-bold text-tertiary dark:text-tertiary-light uppercase tracking-[0.2em] mb-2.5 ml-1">
                New Password
              </label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary-light dark:text-tertiary group-focus-within:text-primary transition-colors">
                  <Lock size={18} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="input pl-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                />
              </div>

              {/* Strength Meter */}
              {password && (
                <div className="mt-3 px-1">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Strength</span>
                    <span className={`text-[10px] font-bold uppercase ${strength <= 1 ? 'text-red-500' : strength <= 2 ? 'text-amber-500' : 'text-emerald-500'
                      }`}>
                      {strength <= 1 ? 'Weak' : strength <= 2 ? 'Fair' : strength <= 3 ? 'Good' : 'Strong'}
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-200 dark:bg-dark-800 rounded-full flex gap-1 overflow-hidden p-[1px]">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`h-full flex-1 rounded-full transition-all duration-500 ${strength >= step
                            ? (strength <= 1 ? 'bg-red-500' : strength <= 2 ? 'bg-amber-500' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]')
                            : 'bg-transparent'
                          }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-tertiary dark:text-tertiary-light uppercase tracking-[0.2em] mb-2.5 ml-1">
                Confirm Password
              </label>
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary-light dark:text-tertiary group-focus-within:text-primary transition-colors">
                  <Lock size={18} />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="input pl-12"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                />
                {confirmPassword && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {passwordsMatch ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 animate-in zoom-in duration-300">
                        <Save size={12} />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 animate-in zoom-in duration-300">
                        <ShieldAlert size={12} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || strength < 2}
              className="btn-primary w-full h-12 flex items-center justify-center gap-2 group mt-4 relative overflow-hidden active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <>
                  <Save size={20} className="group-hover:translate-y-[-2px] transition-transform duration-300" />
                  <span className="font-bold tracking-wide">Activate Account</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-tertiary mt-8">
          By activating, you agree to the CollisionGuard <span className="text-primary font-bold cursor-pointer hover:underline">Safety Protocols</span>.
        </p>
      </div>
    </div>
  );
}

