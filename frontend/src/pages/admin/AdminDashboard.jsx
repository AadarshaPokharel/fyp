// src/pages/admin/AdminDashboard.jsx
import { useState, useEffect } from "react";
import api, { getDashboardStats, getRecentEvents, getTimeseries, getAuditLogs, listUsers, listVerificationRequests, getSystemResilience } from "../../api";
import StatCard from "../../components/ui/StatCard";
import TimeseriesChart from "../../components/charts/TimeseriesChart";
import Spinner from "../../components/ui/Spinner";
import { Users, Activity, ShieldAlert, CheckCircle, Database, ClipboardList, BarChart2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [pmCount, setPmCount] = useState(0);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [pendingDownloads, setPendingDownloads] = useState(0);
  const [pendingPolicies, setPendingPolicies] = useState(0);
  const [resilience, setResilience] = useState({ network_health: 100, database_latency: 4, auto_correction: 'Active' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, timeseriesRes, logsRes, usersRes, verifRes, resRes, downloadRes, policyRes] = await Promise.all([
          getDashboardStats(),
          getTimeseries(24),
          getAuditLogs({ limit: 6 }),
          listUsers("policy_maker"),
          listVerificationRequests(),
          getSystemResilience(),
          api.get("/downloads/"),
          api.get("/policies/")
        ]);
        setStats(statsRes.data);
        setTimeseries(timeseriesRes.data.data);
        setRecentLogs(logsRes.data.logs);
        setPmCount(usersRes.data.length);
        
        // verifications: initial apply AND credentials submitted
        setPendingVerifications(verifRes.data.filter(r => r.status === "pending_initial_approval" || r.status === "credentials_submitted").length);
        
        // downloads
        setPendingDownloads(downloadRes.data.filter(r => r.status === "pending").length);
        
        // policies
        setPendingPolicies(policyRes.data.filter(p => ['submitted', 'under_review', 'revised'].includes(p.status)).length);

        setResilience(resRes.data);
      } catch (err) {
        toast.error("Cloud sync failed. Displaying cached data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalEvents = stats ? (stats.safe || 0) + (stats.medium_risk || 0) + (stats.high_risk || 0) : 0;
  const getPct = (val) => totalEvents > 0 ? Math.round(((val || 0) / totalEvents) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {!loading && pendingVerifications > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-amber-500/5 animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="text-sm font-bold text-black dark:text-white">Action Required: Verification Reviews</h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">There {pendingVerifications === 1 ? "is" : "are"} {pendingVerifications} Policy Maker{pendingVerifications === 1 ? "" : "s"} waiting for initial or credential verification.</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/admin/verification")}
            className="px-4 py-2 bg-amber-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-amber-600 transition-colors shadow-md shadow-amber-500/20"
          >
            Review Now
          </button>
        </div>
      )}

      {!loading && pendingDownloads > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-blue-500/5 animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="text-sm font-bold text-black dark:text-white">Action Required: Pending CSV Requests</h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">There {pendingDownloads === 1 ? "is" : "are"} {pendingDownloads} data export request{pendingDownloads === 1 ? "" : "s"} waiting for approval.</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/admin/downloads")}
            className="px-4 py-2 bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-blue-600 transition-colors shadow-md shadow-blue-500/20"
          >
            View Requests
          </button>
        </div>
      )}

      {!loading && pendingPolicies > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between shadow-lg shadow-emerald-500/5 animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-4">
            <div>
              <h3 className="text-sm font-bold text-black dark:text-white">Action Required: Policies Pending Review</h3>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">You have {pendingPolicies} policy document{pendingPolicies === 1 ? "" : "s"} waiting for your review.</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/admin/policies")}
            className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-emerald-600 transition-colors shadow-md shadow-emerald-500/20"
          >
            Review Policies
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard title="IoT Telemetries" value={stats?.total_events} icon={Database} color="blue" loading={loading} />
        <StatCard title="Critical Risks" value={stats?.high_risk} icon={ShieldAlert} color="red" loading={loading} />
        <StatCard title="Policy Makers" value={pmCount} icon={Users} color="purple" loading={loading} />
        <StatCard title="Avg Speed" value={`${stats?.avg_speed?.toFixed(1) || 0} cm/s`} icon={Activity} color="amber" loading={loading} />
        <StatCard title="Safe Records" value={stats?.safe} icon={CheckCircle} color="emerald" loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2 group hover:shadow-2xl hover:shadow-primary-900/10 transition-all border-primary-500/5 min-h-[500px]">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Activity className="text-primary-400" size={20} /> Collision Risk Trend (24h)
          </h2>
          {loading ? (
            <div className="w-full h-64 shimmer rounded-xl opacity-10" />
          ) : (
            <div className="animate-in fade-in duration-1000">
              <TimeseriesChart data={timeseries} />
            </div>
          )}
        </div>
        <div className="card group hover:shadow-2xl hover:shadow-amber-900/10 transition-all border-amber-500/5 flex flex-col justify-between min-h-[400px]">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <BarChart2 className="text-amber-400" size={20} /> Risk Distribution
          </h2>
          {loading ? (
            <div className="space-y-4">
              <div className="h-4 w-full shimmer rounded opacity-10" />
              <div className="h-4 w-full shimmer rounded opacity-10" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center space-y-6 animate-in fade-in duration-700">
              <div className="flex items-end justify-between mb-2 border-b border-slate-100 dark:border-dark-700 pb-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Total Events</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white leading-none mt-1">
                    {totalEvents.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Safe</span>
                  <span className="font-mono text-slate-500">{stats?.safe || 0} ({getPct(stats?.safe)}%)</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${getPct(stats?.safe)}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-amber-600 dark:text-amber-400">Medium Risk</span>
                  <span className="font-mono text-slate-500">{stats?.medium_risk || 0} ({getPct(stats?.medium_risk)}%)</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${getPct(stats?.medium_risk)}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-red-600 dark:text-red-400">High Risk</span>
                  <span className="font-mono text-slate-500">{stats?.high_risk || 0} ({getPct(stats?.high_risk)}%)</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-dark-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]" style={{ width: `${getPct(stats?.high_risk)}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Recent Admin Activity (Audit Logs) */}
        <div className="card overflow-hidden border-slate-200 dark:border-dark-700/50">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="text-primary-400" size={20} /> Administrative Activity
            </h2>
            <button
              onClick={() => navigate("/admin/audit-logs")}
              className="text-xs text-primary-400 hover:text-primary-300 font-bold uppercase tracking-widest transition-colors"
            >
              Audit Ledger →
            </button>
          </div>
          <div className="space-y-4">
            {loading ? (
              [1, 2, 3].map(i => <div key={i} className="h-16 w-full shimmer rounded-xl opacity-10" />)
            ) : recentLogs.length > 0 ? (
              recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-700/30 border border-slate-200 dark:border-dark-600/30 hover:border-primary-500/50 dark:hover:border-primary-500/20 transition-all group animate-in slide-in-from-right duration-500">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white dark:bg-dark-600 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:text-primary-500 dark:group-hover:text-primary-400 border border-slate-200 dark:border-dark-500 transition-colors">
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">@{log.username}</p>
                      <p className="text-[11px] text-slate-500">
                        {log.action.replace("_", " ")} <span className="opacity-50">/</span> {new Date(log.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-600 bg-white dark:bg-dark-800 border border-slate-200 dark:border-none px-2 py-1 rounded-md mb-1">{log.ip}</p>
                    <p className="text-[10px] text-primary-600 dark:text-primary-500/80 font-bold uppercase tracking-tighter">Verified</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-slate-500 italic text-sm">No administrative actions recorded yet.</div>
            )}
          </div>
        </div>

        {/* Quick Insights / System Metrics */}
        <div className="card border-emerald-500/5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <ShieldAlert className="text-emerald-400" size={20} /> System Resilience
          </h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400 italic">Network Health</span>
              <span className={`font-bold text-sm ${resilience.network_health > 80 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {resilience.network_health}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div className={`h-full w-full ${resilience.network_health > 80 ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`} style={{ width: `${resilience.network_health}%` }}></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400 italic">Database Latency</span>
              <span className={`font-bold text-sm ${resilience.database_latency < 50 ? 'text-blue-500 dark:text-blue-400' : 'text-amber-500 dark:text-amber-400'}`}>
                {resilience.database_latency}ms
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div className={`h-full w-[4%] ${resilience.database_latency < 50 ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-amber-500 shadow-[0_0_10px_#f59e0b]'}`} style={{ width: `${Math.min(resilience.database_latency, 100)}%` }}></div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400 italic">Auto-Correction</span>
              <span className={`font-bold text-sm ${resilience.auto_correction === 'Active' ? 'text-primary-500 dark:text-primary-400' : 'text-red-500 dark:text-red-400'}`}>
                {resilience.auto_correction}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
