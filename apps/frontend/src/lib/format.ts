import type { TableColumn } from "@saas-kit/shared";
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const currency = (value: unknown) => dollars.format(Number(value ?? 0));
export const compact = (value: unknown) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(Number(value ?? 0));
export const titleCase = (value: string) => value.toLowerCase().replace(/^todo$/, "to do").replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
export function cellText(column: TableColumn, value: unknown) {
  if (value == null || value === "") return "—";
  if (column.type === "currency") return currency(value);
  if (column.type === "date" || column.type === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", ...(column.type === "datetime" ? { timeStyle: "short" as const } : { timeZone: "UTC" }) }).format(date);
  }
  if (column.type === "percent") return String(value) + "%";
  if (column.type === "number") return new Intl.NumberFormat("en-US").format(Number(value));
  if (column.type === "status") return titleCase(String(value));
  return String(value);
}
