// src/components/ui/ThemeToggle.jsx
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="w-8 h-8 rounded-lg flex items-center justify-center
                 text-slate-500 dark:text-slate-500
                 hover:text-slate-700 dark:hover:text-slate-300
                 hover:bg-slate-100 dark:hover:bg-slate-800/60
                 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      aria-label={`Toggle Theme (Current: ${theme})`}
      title={`Theme: ${theme}`}
    >
      {theme === "dark" && <Moon size={15} />}
      {theme === "light" && <Sun size={15} />}
      {theme === "system" && <Monitor size={15} />}
    </button>
  );
}
