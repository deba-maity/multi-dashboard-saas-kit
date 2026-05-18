import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { BarChart3, LockKeyhole } from "lucide-react";
import { Button } from "../components/ui/Button";
import { FormField } from "../components/ui/FormField";
import { useAuth } from "../providers/AuthProvider";

export function LoginPage() {
  const { session, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("avery@northstar.test");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to={(location.state as { from?: string })?.from ?? "/dashboards/analytics"} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-zinc-50 text-zinc-950 dark:bg-ink-950 dark:text-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-[url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center lg:block">
        <div className="flex h-full flex-col justify-end bg-zinc-950/55 p-12 text-white">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm backdrop-blur">
              <BarChart3 className="h-4 w-4" />
              Multi-dashboard SaaS starter
            </div>
            <h1 className="text-5xl font-bold tracking-normal">Northstar Dashboard Kit</h1>
            <p className="mt-4 text-lg text-zinc-200">A production-grade tenant dashboard system for analytics, commerce, finance, CRM, monitoring, AI insights, and more.</p>
          </div>
        </div>
      </section>
      <section className="grid place-items-center px-4 py-10">
        <form onSubmit={onSubmit} className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-6">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-bold">Sign in</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Use the seeded tenant account to explore the template.</p>
          </div>
          <div className="grid gap-4">
            <FormField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <FormField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p> : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
