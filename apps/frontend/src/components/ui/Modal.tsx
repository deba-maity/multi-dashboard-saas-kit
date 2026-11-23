import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";

export function Modal({ open, title, children, onClose }: {
  open: boolean; title: string; children: React.ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal();
    return () => element.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="w-[calc(100%-2rem)] max-w-lg rounded-xl border border-zinc-200 bg-white p-0 text-zinc-950 shadow-xl backdrop:bg-zinc-950/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 id={titleId} className="font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog"><X className="h-4 w-4" /></Button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
