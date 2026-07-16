// src/components/charts/RiskDistributionChart.jsx
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { useTheme } from "../../context/ThemeContext";

const COLORS = ["#10b981", "#f59e0b", "#ef4444"]; // Emerald-500, Amber-500, Red-500

export default function RiskDistributionChart({ data }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const chartData = [
    { name: "Safe", value: data?.safe || 0 },
    { name: "Medium", value: data?.medium_risk || 0 },
    { name: "High", value: data?.high_risk || 0 },
  ];

  const total = chartData.reduce((acc, entry) => acc + entry.value, 0);

  return (
    <div className="h-[300px] w-full relative flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#ffffff", border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`, borderRadius: "8px" }}
            itemStyle={{ color: isDark ? "#f1f5f9" : "#0f172a" }}
          />
          <Legend 
            iconType="circle" 
            wrapperStyle={{ color: isDark ? "#94a3b8" : "#64748b", fontSize: "12px" }} 
            formatter={(value) => {
              const item = chartData.find(d => d.name === value);
              return `${value} (${item ? item.value : 0})`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center total data label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
        <span className="text-3xl font-black text-slate-900 dark:text-white leading-none">
          {total}
        </span>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">
          Total Data
        </span>
      </div>
    </div>
  );
}
