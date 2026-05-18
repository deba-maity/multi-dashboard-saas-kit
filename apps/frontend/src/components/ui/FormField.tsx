import { InputHTMLAttributes } from "react";
import { Input } from "./Input";

export function FormField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{label}</span>
      <Input {...props} />
      {error ? <span className="text-sm text-rose-600">{error}</span> : null}
    </label>
  );
}
