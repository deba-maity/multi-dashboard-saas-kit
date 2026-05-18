import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./Button";
import { Input } from "./Input";

type Option = { label: string; value: string };

export function Dropdown({
  label,
  value,
  options,
  onChange
}: {
  label?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value) ?? options[0];
  const filtered = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  return (
    <div className="relative">
      {label ? <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</span> : null}
      <Button variant="secondary" className="w-full justify-between" onClick={() => setOpen((current) => !current)}>
        {selected?.label}
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-soft dark:border-zinc-800 dark:bg-zinc-950">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Search options" />
          </div>
          <div className="max-h-64 overflow-auto">
            {filtered.map((option) => (
              <button
                key={option.value}
                className={clsx(
                  "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900",
                  option.value === value ? "font-semibold text-zinc-950 dark:text-white" : "text-zinc-600 dark:text-zinc-300"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {option.label}
                {option.value === value ? <Check className="h-4 w-4" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
