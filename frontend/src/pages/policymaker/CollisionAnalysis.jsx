// src/pages/policymaker/CollisionAnalysis.jsx
import { useState, useEffect } from "react";
import { getDashboardStats, getTimeseries } from "../../api";
import RiskDistributionChart from "../../components/charts/RiskDistributionChart";
import TimeseriesChart from "../../components/charts/TimeseriesChart";
import Spinner from "../../components/ui/Spinner";
import { BarChart, PieChart } from "lucide-react";
import toast from "react-hot-toast";

export default function CollisionAnalysis() {
  const [stats, setStats] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState(24);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, timeseriesRes] = await Promise.all([
          getDashboardStats(),
          getTimeseries(timeframe),
        ]);
        setStats(statsRes.data);
        setTimeseries(timeseriesRes.data.data);
      } catch (err) {
        toast.error("Failed to fetch analytical data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe]);

  if (loading && !stats) return <div className="flex h-[80vh] items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Collision Analysis</h1>
          <p className="text-slate-600 dark:text-slate-400">Deep dive into historical risk patterns and trend data.</p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl px-2 py-1.5 shadow-lg">
           {[24, 48, 168].map(h => (
             <button
               key={h}
               onClick={() => setTimeframe(h)}
               className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === h ? 'bg-primary-600/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
             >
               {h === 168 ? '7D' : `${h}H`}
             </button>
           ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`card transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-dark-700 pb-4">
             <BarChart size={20} className="text-primary-500" />
             <h2 className="text-lg font-bold text-slate-900 dark:text-white">Risk Occurrence Trend</h2>
          </div>
          <TimeseriesChart data={timeseries} />
        </div>

        <div className={`card transition-opacity duration-300 ${loading ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-dark-700 pb-4">
             <PieChart size={20} className="text-amber-500" />
             <h2 className="text-lg font-bold text-slate-900 dark:text-white">Risk Type Distribution</h2>
          </div>
          <RiskDistributionChart data={stats} />
          <div className="mt-6 border-t border-slate-200 dark:border-dark-700 pt-6">
             <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 rounded-2xl">
                   <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-bold uppercase mb-1">Safe Sessions</p>
                   <p className="text-2xl font-black text-slate-900 dark:text-white">{stats?.safe}</p>
                </div>
                <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl">
                   <p className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase mb-1">Medium Risk</p>
                   <p className="text-2xl font-black text-slate-900 dark:text-white">{stats?.medium_risk}</p>
                </div>
                <div className="text-center p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl">
                   <p className="text-[10px] text-red-600 dark:text-red-500 font-bold uppercase mb-1">Danger Hits</p>
                   <p className="text-2xl font-black text-slate-900 dark:text-white">{stats?.high_risk}</p>
                </div>
             </div>
          </div>
        </div>
      </div>

    </div>
  );
}
