// src/components/ui/RiskBadge.jsx
function Dot({ color }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

export default function RiskBadge({ level }) {
  if (level === 2 || level === "high")
    return <span className="badge-high"><Dot color="bg-red-500" /> HIGH</span>;
  if (level === 1 || level === "medium")
    return <span className="badge-medium"><Dot color="bg-amber-500" /> MEDIUM</span>;
  return <span className="badge-safe"><Dot color="bg-emerald-500" /> SAFE</span>;
}

export function StatusBadge({ status }) {
  const map = {
    pending:  <span className="badge-pending"><Dot color="bg-blue-400" /> Pending</span>,
    approved: <span className="badge-approved"><Dot color="bg-emerald-500" /> Approved</span>,
    rejected: <span className="badge-rejected"><Dot color="bg-red-500" /> Rejected</span>,
    expired:  <span className="badge-medium"><Dot color="bg-amber-500" /> Expired</span>,
  };
  const formatStatus = (s) => {
    if (!s) return "Unknown";
    return s.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  return map[status] || <span className="badge-pending"><Dot color="bg-slate-400" /> {formatStatus(status)}</span>;
}
