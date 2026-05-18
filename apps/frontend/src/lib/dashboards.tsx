import {
  Activity,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CreditCard,
  Megaphone,
  PackageCheck,
  ShoppingCart,
  Users
} from "lucide-react";
import type { DashboardId } from "@saas-kit/shared";

export const dashboards: Array<{
  id: DashboardId;
  label: string;
  icon: typeof BarChart3;
  accent: string;
}> = [
  { id: "analytics", label: "Analytics", icon: BarChart3, accent: "from-emerald-500 to-teal-500" },
  { id: "ecommerce", label: "E-commerce", icon: ShoppingCart, accent: "from-sky-500 to-cyan-500" },
  { id: "users", label: "Users", icon: Users, accent: "from-violet-500 to-fuchsia-500" },
  { id: "finance", label: "Finance", icon: CreditCard, accent: "from-amber-500 to-yellow-500" },
  { id: "inventory", label: "Inventory", icon: PackageCheck, accent: "from-lime-500 to-emerald-500" },
  { id: "projects", label: "Projects", icon: BriefcaseBusiness, accent: "from-indigo-500 to-blue-500" },
  { id: "marketing", label: "Marketing", icon: Megaphone, accent: "from-rose-500 to-orange-500" },
  { id: "monitoring", label: "Monitoring", icon: Activity, accent: "from-slate-500 to-zinc-500" },
  { id: "crm", label: "CRM", icon: CalendarClock, accent: "from-cyan-500 to-blue-500" },
  { id: "insights", label: "AI Insights", icon: Bot, accent: "from-purple-500 to-indigo-500" }
];
