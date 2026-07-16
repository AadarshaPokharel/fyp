// src/pages/policymaker/PMDashboard.jsx
import { useState, useEffect, useCallback } from "react";
import { getRecentEvents, getDashboardStats } from "../../api";
import StatCard from "../../components/ui/StatCard";
import CollisionGauge from "../../components/charts/CollisionGauge";
import RiskBadge from "../../components/ui/RiskBadge";
import Spinner from "../../components/ui/Spinner";
import { Activity, ShieldAlert, Cpu, Radio, Eye } from "lucide-react";
import toast from "react-hot-toast";

export default function PMDashboard() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const [statsRes, eventsRes] = await Promise.all([
        getDashboardStats(),
        getRecentEvents(12),
      ]);
      setStats(statsRes.data);
      setEvents(eventsRes.data.events);
      setLastUpdated(new Date());
    } catch (err) {
      if (isInitial) toast.error("Failed to connect to live stream.");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Poll every 3 seconds for a snappier live monitor experience
  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(), 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const latest = events[0] || {};

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-700">

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Observations" value={stats?.total_events} icon={Radio} color="purple" loading={loading} />
          <StatCard title="Active High Risk" value={stats?.high_risk} icon={ShieldAlert} color="red" loading={loading} />
          <StatCard title="System Accuracy" value="98.2%" icon={Cpu} color="blue" subtitle="Current ML Model v1.3" loading={loading} />
        </div>
        <div className="card flex flex-col justify-center items-center py-8 group hover:shadow-2xl hover:shadow-primary-900/10 transition-all">
           {loading ? (
             <div className="w-32 h-32 shimmer rounded-full opacity-10" />
           ) : (
                <CollisionGauge collisionProbability={latest.collision_prob} riskLevel={latest.predicted_risk ?? latest.riskLevel} />
           )}
           <div className="mt-4 text-center">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Current State</p>
              {loading ? <div className="h-6 w-20 shimmer rounded-full mx-auto opacity-10" /> : <RiskBadge level={latest.predicted_risk ?? latest.riskLevel} />}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity size={20} className="text-primary-500" />
              Real-time Ingestion Stream
            </h2>
            <div className="flex items-center gap-4 text-xs font-bold">
               <span className="flex items-center gap-1.5 text-slate-500"><div className="w-2 h-2 rounded-full bg-slate-500" /> Sensor Data</span>
               <span className="flex items-center gap-1.5 text-primary-400"><div className="w-2 h-2 rounded-full bg-primary-400" /> ML Predicted</span>
            </div>
          </div>
          <div className="space-y-3">
             {events.map((evt, idx) => (
               <div key={evt.id || idx} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center p-4 pr-4 md:pr-14 bg-white dark:bg-dark-700/30 border border-slate-200 dark:border-dark-700 rounded-2xl hover:bg-slate-50 dark:hover:bg-dark-700/60 transition-all relative group">
                 <div className="flex items-center gap-4 md:col-span-1">
                   <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${evt.riskLevel === 2 ? 'bg-red-50 dark:bg-red-500/20 text-red-500 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      <Radio size={18} />
                   </div>
                   <div>
                     <p className="text-sm font-bold text-slate-900 dark:text-white">Observation</p>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{new Date(evt.inserted_at).toLocaleTimeString()}</p>
                   </div>
                 </div>
                 <div className="grid grid-cols-3 gap-4 md:col-span-3 items-center px-4 md:px-0">
                    <div className="text-left md:text-center">
                       <p className="text-[10px] text-slate-500 font-bold mb-0.5 uppercase tracking-wide">Distance A</p>
                       <p className="text-sm font-black text-slate-900 dark:text-slate-100">{evt.distA?.toFixed(1)} cm</p>
                    </div>
                    <div className="text-left md:text-center">
                       <p className="text-[10px] text-slate-500 font-bold mb-0.5 uppercase tracking-wide">Avg Speed</p>
                       <p className="text-sm font-black text-slate-900 dark:text-slate-100">{evt.avgSpeed?.toFixed(1)} cm/s</p>
                    </div>
                    <div className="text-right md:text-center flex flex-col md:items-center items-end">
                       <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-wide">Risk Assessment</p>
                       <RiskBadge level={evt.predicted_risk ?? evt.riskLevel} />
                    </div>
                 </div>
                 <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 hidden md:block">
                    <button className="p-2 bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white shadow-sm hover:scale-105 transition-transform"><Eye size={18} /></button>
                 </div>
               </div>
             ))}
          </div>
        </div>

        <div className="space-y-6">
           <div className="card">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-widest border-b border-slate-200 dark:border-dark-700 pb-3">Node Info</h3>
              <div className="space-y-4">
                 <div className="flex justify-between items-center bg-slate-50 dark:bg-dark-900/40 p-3 rounded-xl">
                    <span className="text-xs text-slate-500 font-semibold uppercase">Status</span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded">ONLINE</span>
                 </div>
                 <div className="flex justify-between items-center bg-slate-50 dark:bg-dark-900/40 p-3 rounded-xl text-teal-600 dark:text-teal-300">
                    <span className="text-xs text-slate-500 font-semibold uppercase">Node Type</span>
                    <span className="text-xs font-bold">Edge Gateway 01</span>
                 </div>
                 <div className="flex justify-between items-center bg-slate-50 dark:bg-dark-900/40 p-3 rounded-xl">
                    <span className="text-xs text-slate-500 font-semibold uppercase">Location</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Intersection A-02</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
