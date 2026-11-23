import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Building2, Compass, LogOut, Moon, Sun } from "lucide-react";
import { clsx } from "clsx";
import { dashboards } from "../../lib/dashboards";
import { isDemo } from "../../lib/demo";
import { useAuth } from "../../providers/AuthProvider";
import { useTheme } from "../../providers/ThemeProvider";
import { Button } from "../ui/Button";
import { DashboardFinder } from "./DashboardFinder";

export function Shell() {
  const { session, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = dashboards.find(({ id }) => pathname === "/dashboards/" + id);
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-ink-950 dark:text-white">
      <a href="#dashboard-content" onClick={(e) => { e.preventDefault(); document.getElementById("dashboard-content")?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-3">Skip to report</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-ink-900 lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 px-5 dark:border-zinc-800">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-800 text-white"><Compass size={21} /></div>
          <span className="text-lg font-bold tracking-tight">Northstar</span>
        </div>
        <nav aria-label="Dashboards" className="grid gap-1 p-3">
          {dashboards.map(({ id, icon: Icon, label }) => (
            <NavLink key={id} to={"/dashboards/" + id} className={({ isActive }) => clsx(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
              isActive ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}><Icon size={17} />{label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-zinc-200 p-5 text-sm dark:border-zinc-800">
          <Building2 size={17} /><div><p className="font-semibold">{isDemo ? "Northstar Labs" : session?.organization?.name ?? "Organization"}</p>
          <p className="text-xs text-zinc-500">{isDemo ? "Sample workspace" : session?.user.role}</p></div>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 dark:border-zinc-800 dark:bg-ink-900/95 sm:px-6">
          <p className="hidden text-sm text-zinc-500 lg:block">Workspace <span className="mx-2">/</span><strong className="text-zinc-800 dark:text-zinc-200">{current?.label}</strong></p>
          <select className="max-w-[48%] rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950 lg:hidden"
            aria-label="Dashboard navigation" value={current?.id ?? "analytics"} onChange={(e) => navigate("/dashboards/" + e.target.value)}>
            {dashboards.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-1"><DashboardFinder />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</Button>
            {!isDemo && <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out"><LogOut size={17} /></Button>}
          </div>
        </header>
        <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[100rem] px-4 py-6 outline-none sm:px-6 xl:px-9"><Outlet /></main>
      </div>
    </div>
  );
}
