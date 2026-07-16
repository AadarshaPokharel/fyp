// src/pages/policymaker/InteractivePredict.jsx
import { useState } from "react";
import { runPrediction } from "../../api";
import CollisionGauge from "../../components/charts/CollisionGauge";
import RiskBadge from "../../components/ui/RiskBadge";
import Spinner from "../../components/ui/Spinner";
import { Brain, SlidersHorizontal, Zap, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

// ── Fix 1: All 3 presets define all 19 model features ───────────────────────
const HIGH_RISK = {
  dista: 5, distb: 5, distancediff: 0, dist_ratio: 1.0,
  speeda: 80, speedb: 80, avgspeed: 80, speed_sum: 160,
  closing_velocity: 160, accelerationa: 5, accelerationb: 5,
  accel_sum: 10, approachinga: 1, approachingb: 1,
  vehiclea: 2, vehicleb: 2, hour_of_day: 8,
  day_of_week: 1, is_rush_hour: 1,
};

const MEDIUM_RISK = {
  dista: 25, distb: 25, distancediff: 5, dist_ratio: 0.8,
  speeda: 40, speedb: 40, avgspeed: 40, speed_sum: 80,
  closing_velocity: 60, accelerationa: 2, accelerationb: 2,
  accel_sum: 4, approachinga: 1, approachingb: 0,
  vehiclea: 1, vehicleb: 2, hour_of_day: 8,
  day_of_week: 1, is_rush_hour: 1,
};

const SAFE_PRESET = {
  dista: 200, distb: 200, distancediff: 0, dist_ratio: 1.0,
  speeda: 10, speedb: 10, avgspeed: 10, speed_sum: 20,
  closing_velocity: 0, accelerationa: 0, accelerationb: 0,
  accel_sum: 0, approachinga: 0, approachingb: 0,
  vehiclea: 1, vehicleb: 1, hour_of_day: 14,
  day_of_week: 3, is_rush_hour: 0,
};

const presets = {
  safe:   SAFE_PRESET,
  medium: MEDIUM_RISK,
  high:   HIGH_RISK,
};

// ── Fix 2: Canonical feature order matching the trained model ─────────────────
const FEATURE_ORDER = [
  "dista", "distb", "distancediff", "dist_ratio",
  "speeda", "speedb", "avgspeed", "speed_sum", "closing_velocity",
  "accelerationa", "accelerationb", "accel_sum",
  "approachinga", "approachingb",
  "vehiclea", "vehicleb",
  "hour_of_day", "day_of_week", "is_rush_hour",
];

// Slider-visible fields (subset of 19 — the rest are sent as hidden inputs)
const FIELDS = [
  { key: "dista",        label: "Sensor A Distance",  unit: "cm",    min: 0,   max: 300, step: 0.1, group: "distance" },
  { key: "distb",        label: "Sensor B Distance",  unit: "cm",    min: 0,   max: 300, step: 0.1, group: "distance" },
  { key: "avgspeed",     label: "Avg Speed",          unit: "cm/s",  min: 0,   max: 100, step: 0.1, group: "dynamics" },
  { key: "accelerationa", label: "Max Acceleration",  unit: "cm/s²", min: -20, max: 20,  step: 0.1, group: "dynamics" },
];

function SliderInput({ field, value, onChange }) {
  const pct = ((value - field.min) / (field.max - field.min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{field.label}</label>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/50">
          <span className="text-xs font-bold text-slate-900 dark:text-white">{Number(value).toFixed(1)}</span>
          <span className="text-[10px] text-slate-400">{field.unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={field.min} max={field.max} step={field.step}
        name={field.key} value={value}
        onChange={onChange}
        className="w-full h-1.5 appearance-none rounded-full cursor-pointer
                   bg-slate-200 dark:bg-slate-700
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
                   [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                   [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-blue-500/30
                   [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform
                   [&::-webkit-slider-thumb]:hover:scale-110"
        style={{
          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${pct}%, #1e293b ${pct}%, #1e293b 100%)`
        }}
      />
    </div>
  );
}

export default function InteractivePredict() {
  const [inputs, setInputs] = useState(SAFE_PRESET);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading]       = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handlePredict = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Fix 2: Build payload with all 19 features in correct order, defaulting missing to 0
      const payload = {};
      for (const feat of FEATURE_ORDER) {
        payload[feat] = parseFloat(inputs[feat] ?? 0);
      }
      const { data } = await runPrediction(payload);
      setPrediction(data);
      if (data?.model_loaded) {
        toast.success("Model loaded successfully");
      } else {
        toast.success("Prediction (fallback mode)");
      }
    } catch {
      toast.error("ML model inference failed.");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (key) => {
    setInputs({ ...presets[key] });
    setPrediction(null);
  };

  // Fix 3: Risk level from new API response shape
  const riskLabel = prediction?.risk_level ?? "SAFE";
  const riskToLevel = { SAFE: 0, MEDIUM: 1, HIGH: 2 };
  const predictedLevel = riskToLevel[riskLabel] ?? 0;

  const resultColors = {
    0: { ring: "ring-emerald-500/30", glow: "shadow-emerald-500/20", text: "text-emerald-400" },
    1: { ring: "ring-amber-500/30",   glow: "shadow-amber-500/20",   text: "text-amber-400"   },
    2: { ring: "ring-red-500/30",     glow: "shadow-red-500/20",     text: "text-red-400"     },
  };
  const rc = resultColors[predictedLevel];

  return (
    <div className="space-y-5 pb-10 fade-up">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ── Input Panel ── */}
        <div className="card h-fit">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <SlidersHorizontal size={18} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Simulator Input</h2>
              <p className="text-xs text-slate-500 mt-0.5">Configure sensor telemetry parameters</p>
            </div>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap gap-2 mb-6">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest w-full mb-0.5">Quick Presets</p>
            {[
              { key: "safe",   label: "Safe Scenario", scheme: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20" },
              { key: "medium", label: "Medium Risk",   scheme: "bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20"         },
              { key: "high",   label: "High Risk",     scheme: "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"                 },
            ].map(({ key, label, scheme }) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${scheme}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handlePredict} className="space-y-6">
            {/* Hidden inputs for all 19 features not shown as sliders */}
            {FEATURE_ORDER.filter(f => !FIELDS.some(sf => sf.key === f)).map(feat => (
              <input key={feat} type="hidden" name={feat} value={inputs[feat] ?? 0} readOnly />
            ))}

            {/* Distance group */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="inline-block w-4 h-px bg-slate-400/50" /> Distance Sensors
              </p>
              <div className="space-y-4 pl-1">
                {FIELDS.filter((f) => f.group === "distance").map((field) => (
                  <SliderInput key={field.key} field={field} value={inputs[field.key] ?? 0} onChange={handleInputChange} />
                ))}
              </div>
            </div>

            {/* Dynamics group */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="inline-block w-4 h-px bg-slate-400/50" /> Dynamics
              </p>
              <div className="space-y-4 pl-1">
                {FIELDS.filter((f) => f.group === "dynamics").map((field) => (
                  <SliderInput key={field.key} field={field} value={inputs[field.key] ?? 0} onChange={handleInputChange} />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm
                         bg-blue-600 hover:bg-blue-500 text-white
                         shadow-lg shadow-blue-600/25 hover:shadow-blue-500/35
                         transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {loading ? <Spinner size="sm" /> : (
                <>
                  <Brain size={16} className="group-hover:scale-110 transition-transform" />
                  Calculate Risk Prediction
                </>
              )}
            </button>
          </form>
        </div>

        {/* ── Result Panel ── */}
        <div className="flex flex-col gap-5">
          {!prediction ? (
            <div className="card flex-1 flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 mb-5">
                <Brain size={28} />
              </div>
              <p className="text-base font-bold text-slate-900 dark:text-white mb-1.5">Awaiting Input</p>
              <p className="text-sm text-slate-500">Configure parameters and click<br />&quot;Calculate Risk Prediction&quot;</p>
            </div>
          ) : (
            <>
              {/* Gauge result card — Fix 3: pass collision_probability, not safe */}
              <div className={`card flex flex-col items-center py-8 animate-in zoom-in duration-300 ring-1 ${rc.ring} shadow-lg ${rc.glow}`}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Prediction Result</p>
                <CollisionGauge
                  collisionProbability={prediction.collision_probability}
                  riskLevel={riskLabel}
                />
                <div className="mt-4 text-center">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Risk Classification</p>
                  <RiskBadge level={predictedLevel} />
                </div>
              </div>

              {/* Probability breakdown */}
              <div className="card animate-in fade-in duration-500">
                <div className="space-y-3.5">
                  {[
                    { key: "safe",   label: "Safe",      pct: (prediction.safe_probability ?? 0) * 100,      idx: 0 },
                    { key: "high",   label: "Collision",  pct: (prediction.collision_probability ?? 0) * 100, idx: 2 },
                  ].map(({ key, label, pct, idx }) => {
                    const isActive = (idx === 0 && predictedLevel === 0) || (idx === 2 && predictedLevel === 2);
                    const barColors = { 0: "bg-emerald-500", 2: "bg-red-500" };
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-bold ${isActive ? rc.text : "text-slate-500"} uppercase tracking-wide`}>
                            {isActive && <span className="mr-1">▶</span>}{label}
                          </span>
                          <span className={`text-xs font-bold ${isActive ? "text-slate-900 dark:text-white" : "text-slate-500"}`}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColors[idx]} rounded-full transition-all duration-1000 ${isActive ? "shadow-sm" : "opacity-40"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Model status */}
              <div className="card bg-slate-50/50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/30 animate-in fade-in duration-700">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-widest">Model Status</h3>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">Source: <strong className="text-slate-900 dark:text-white font-semibold">{prediction.source?.toUpperCase()}</strong></span>
                  <span className="text-slate-500">Model: <strong className={`font-semibold ${prediction.model_loaded ? "text-emerald-500" : "text-red-400"}`}>{prediction.model_loaded ? "LOADED" : "NOT LOADED"}</strong></span>
                  {prediction.threshold && (
                    <span className="text-slate-500">Threshold: <strong className="text-slate-900 dark:text-white font-semibold">{prediction.threshold.toFixed(2)}</strong></span>
                  )}
                </div>
              </div>


            </>
          )}
        </div>
      </div>
    </div>
  );
}
