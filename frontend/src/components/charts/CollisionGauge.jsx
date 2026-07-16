// src/components/charts/CollisionGauge.jsx
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useTheme } from "../../context/ThemeContext";

// Fix 3: gauge color/label driven by risk_level string from new API
const RISK_META = {
  SAFE:   { color: "#10b981", label: "SAFE",   shadow: "drop-shadow(0 0 8px rgba(16,185,129,0.6))"  },
  MEDIUM: { color: "#f59e0b", label: "MEDIUM",  shadow: "drop-shadow(0 0 8px rgba(245,158,11,0.6))"  },
  HIGH:   { color: "#ef4444", label: "HIGH",    shadow: "drop-shadow(0 0 8px rgba(239,68,68,0.6))"   },
  // Legacy numeric fallbacks
  0:      { color: "#10b981", label: "SAFE",   shadow: "drop-shadow(0 0 8px rgba(16,185,129,0.6))"  },
  1:      { color: "#f59e0b", label: "MEDIUM",  shadow: "drop-shadow(0 0 8px rgba(245,158,11,0.6))"  },
  2:      { color: "#ef4444", label: "HIGH",    shadow: "drop-shadow(0 0 8px rgba(239,68,68,0.6))"   },
};

/**
 * CollisionGauge — displays P(collision) as a half-donut gauge.
 *
 * Props:
 *   collisionProbability  float [0,1]   — P(collision) from model (class 1)
 *   riskLevel             string|number — "SAFE" | "MEDIUM" | "HIGH"  (or 0/1/2)
 */
export default function CollisionGauge({ collisionProbability = null, riskLevel = "SAFE" }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Normalize riskLevel to a RISK_META key
  let metaKey = "SAFE";
  if (riskLevel !== undefined && riskLevel !== null) {
    const str = String(riskLevel).toUpperCase().trim();
    if (str === "2" || str === "HIGH")   metaKey = "HIGH";
    else if (str === "1" || str === "MEDIUM" || str === "MED") metaKey = "MEDIUM";
    else metaKey = "SAFE";
  }

  const meta = RISK_META[metaKey] || RISK_META["SAFE"];

  // Always use collision probability from ML if available
  let rawProb = parseFloat(collisionProbability);
  
  // Fallback: If ML hasn't scored this event yet (prob is null/undefined), 
  // estimate a representative percentage based on the sensor's raw risk level 
  // so the gauge visually matches the risk state.
  if (isNaN(rawProb) || collisionProbability === null) {
    if (metaKey === "HIGH") rawProb = 0.87;
    else if (metaKey === "MEDIUM") rawProb = 0.45;
    else rawProb = 0;
  }

  const value = rawProb > 1.0 ? Math.round(rawProb) : Math.round(rawProb * 100);
  const track = isDark ? "#1e2d42" : "#e2e8f0";

  const data = [{ value }, { value: 100 - value }];

  return (
    <div className="relative h-[160px] w-full max-w-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="100%"
            startAngle={180} endAngle={0}
            innerRadius={62} outerRadius={80}
            paddingAngle={0}
            dataKey="value"
            strokeWidth={0}
            style={{ filter: value > 0 ? meta.shadow : "none" }}
          >
            <Cell fill={meta.color} />
            <Cell fill={track} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center text — Fix 3: label is "COLLISION RISK" */}
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
        <p className="text-4xl font-black leading-none" style={{ color: meta.color }}>{value}%</p>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: meta.color }}>
          COLLISION RISK
        </p>
      </div>
    </div>
  );
}
