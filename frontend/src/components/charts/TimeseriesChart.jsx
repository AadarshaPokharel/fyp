// src/components/charts/TimeseriesChart.jsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { useTheme } from "../../context/ThemeContext";

export default function TimeseriesChart({ data }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  if (!data?.length) return <div className="h-[450px] flex items-center justify-center text-slate-500">No data for the selected period.</div>;

  return (
    <div className="h-[450px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
          <XAxis
            dataKey="hour"
            stroke={isDark ? "#94a3b8" : "#64748b"}
            fontSize={10}
            tickFormatter={(val) => val?.split("T")[1]}
          />
          <YAxis stroke={isDark ? "#94a3b8" : "#64748b"} fontSize={10} />
          <Tooltip
            contentStyle={{ 
              backgroundColor: isDark ? "#1e293b" : "#ffffff", 
              border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`, 
              borderRadius: "8px" 
            }}
            itemStyle={{ color: isDark ? "#f1f5f9" : "#0f172a" }}
            labelStyle={{ color: isDark ? "#94a3b8" : "#64748b" }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: isDark ? "#94a3b8" : "#64748b" }} />
          <Area type="monotone" dataKey="safe"   stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={isDark ? 0.2 : 0.15} />
          <Area type="monotone" dataKey="medium" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={isDark ? 0.2 : 0.15} />
          <Area type="monotone" dataKey="high"   stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={isDark ? 0.2 : 0.15} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
