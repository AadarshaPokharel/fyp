// src/components/ui/StatCard.jsx
export default function StatCard({ title, value, icon: Icon, color = "blue", subtitle, loading = false }) {
  const palette = {
    blue:    { accent: "border-blue-500",    icon: "text-blue-400",    iconBg: "bg-blue-500/10 border-blue-500/20"   },
    green:   { accent: "border-emerald-500", icon: "text-emerald-400", iconBg: "bg-emerald-500/10 border-emerald-500/20" },
    emerald: { accent: "border-emerald-500", icon: "text-emerald-400", iconBg: "bg-emerald-500/10 border-emerald-500/20" },
    amber:   { accent: "border-amber-500",   icon: "text-amber-400",   iconBg: "bg-amber-500/10 border-amber-500/20"  },
    red:     { accent: "border-red-500",     icon: "text-red-400",     iconBg: "bg-red-500/10 border-red-500/20"      },
    purple:  { accent: "border-purple-500",  icon: "text-purple-400",  iconBg: "bg-purple-500/10 border-purple-500/20"},
  };

  const { accent, icon: iconColor, iconBg } = palette[color] || palette.blue;

  return (
    <div className={`relative bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/50 rounded-2xl p-5
                     shadow-sm hover:shadow-md dark:hover:shadow-none overflow-hidden
                     transition-all duration-300 border-t-2 ${accent}`}>
      {/* Subtle tinted bg glow */}
      <div className={`absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-10 ${iconBg.split(" ")[0]}`} />

      <div className="flex items-start justify-between relative">
        {/* Left: values */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider truncate">
            {title}
          </p>
          {loading ? (
            <div className="h-8 w-20 shimmer rounded-lg mt-2 opacity-30" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 tracking-tight">
              {value ?? "—"}
            </p>
          )}
          {subtitle && !loading && (
            <p className="text-xs text-slate-500 mt-1 truncate">{subtitle}</p>
          )}
        </div>

        {/* Right: icon */}
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ml-3 ${iconBg} ${loading ? "shimmer opacity-20" : ""}`}>
          {!loading && <Icon size={20} className={iconColor} />}
        </div>
      </div>
    </div>
  );
}
