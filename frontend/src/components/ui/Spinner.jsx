// src/components/ui/Spinner.jsx
export default function Spinner({ size = "md" }) {
  const s = { sm: "w-4 h-4", md: "w-7 h-7", lg: "w-12 h-12" }[size];
  return (
    <div className={`${s} border-2 border-slate-200 dark:border-dark-600 border-t-primary-500 dark:border-t-primary-500 rounded-full animate-spin`} />
  );
}
