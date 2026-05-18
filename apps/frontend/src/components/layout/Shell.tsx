import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, Building2, LogOut, Moon, PanelLeft, Search, Sun } from "lucide-react";
import { clsx } from "clsx";
import { dashboards } from "../../lib/dashboards";
import { useAuth } from "../../providers/AuthProvider";
import { useTheme } from "../../providers/ThemeProvider";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export function Shell() {
  const { session, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-ink-950 dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-ink-900 lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-200 px-5 dark:border-zinc-800">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
            <PanelLeft className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">Northstar Kit</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Premium SaaS starter</p>
          </div>
        </div>
        <nav className="grid gap-1 p-3">
          {dashboards.map((dashboard) => {
            const Icon = dashboard.icon;
            return (
              <NavLink
                key={dashboard.id}
                to={`/dashboards/${dashboard.id}`}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition",
                    isActive
                      ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {dashboard.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-ink-900/90 sm:px-6">
          <div className="relative hidden w-full max-w-md sm:block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input className="pl-9" placeholder="Search dashboards, metrics, reports" />
          </div>
          <select
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-950 lg:hidden"
            onChange={(event) => navigate(`/dashboards/${event.target.value}`)}
            defaultValue=""
            aria-label="Dashboard navigation"
          >
            <option value="" disabled>
              Dashboards
            </option>
            {dashboards.map((dashboard) => (
              <option key={dashboard.id} value={dashboard.id}>
                {dashboard.label}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="hidden items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800 md:flex">
              <Building2 className="h-4 w-4 text-zinc-400" />
              <div>
                <p className="text-xs font-semibold">{session?.organization?.name ?? "Northstar Labs"}</p>
                <p className="text-xs text-zinc-500">{session?.user.role}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => logout()} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
