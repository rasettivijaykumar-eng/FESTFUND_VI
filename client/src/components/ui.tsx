import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "../lib/cn";
import { useMotionPref } from "../context/AppState";

export function Button({
  children, className, variant = "primary", loading, type = "button", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; loading?: boolean }) {
  const styles = {
    primary: "fest-gradient text-white shadow-lg shadow-orange-500/20",
    ghost: "bg-white/10 text-current hover:bg-white/15",
    outline: "border border-current/20 bg-transparent hover:bg-black/5",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type={type}
      className={cn("inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60", styles[variant], className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs opacity-70">{hint}</span>}
      {error && <span className="block text-xs text-red-500">{error}</span>}
    </label>
  );
}

const control = "w-full rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-ink outline-none transition focus:border-festival focus:ring-4 focus:ring-orange-500/15";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, "dashboard:border-white/10", props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, "min-h-28", props.className)} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, props.className)} />;
}

export function FileInput({ id, accept, multiple, onChange }: { id?: string; accept?: string; multiple?: boolean; onChange?: (file: File | null, files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("No file chosen");
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-2xl border border-black/10 bg-white/80 px-2 py-2 text-ink">
      <button type="button" className="shrink-0 cursor-pointer rounded-full fest-gradient px-4 py-2 text-sm font-medium text-white" onClick={() => inputRef.current?.click()}>Choose file</button>
      <span className="min-w-0 truncate text-sm opacity-70">{label}</span>
      <input ref={inputRef} id={id} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(event) => {
        const files = event.target.files;
        const file = files?.[0] || null;
        setLabel(!files?.length ? "No file chosen" : files.length > 1 ? `${files.length} files chosen` : file?.name || "No file chosen");
        onChange?.(file, files);
      }} />
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/60" aria-label="Close dialog" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl border border-white/10 bg-[#1a100b] p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-white/10"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-[min(86vw,320px)] overflow-auto bg-[#120a06] p-4 text-white shadow-2xl">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "orange" }: { children: ReactNode; tone?: "orange" | "green" | "red" | "slate" }) {
  const tones = { orange: "bg-orange-500/15 text-orange-200", green: "bg-emerald-500/15 text-emerald-200", red: "bg-red-500/15 text-red-200", slate: "bg-white/10 text-white/80" };
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-white/10", className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass rounded-3xl px-6 py-14 text-center">
      <p className="font-display text-2xl">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <article className="glass lift rounded-3xl p-5">
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-3 font-display text-3xl">{value}</p>
      {hint && <p className="mt-2 text-xs text-[var(--muted)]">{hint}</p>}
    </article>
  );
}

export function AnimatedNumber({ value, format = (n: number) => String(n) }: { value: number; format?: (n: number) => string }) {
  const { reduced } = useMotionPref();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <span>{format(shown)}</span>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-2 overflow-auto">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)} className={cn("rounded-full px-4 py-2 text-sm", value === tab.id ? "fest-gradient text-white" : "bg-white/5")}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title, body, onConfirm, onClose, loading }: { open: boolean; title: string; body: string; onConfirm: () => void; onClose: () => void; loading?: boolean }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="text-sm text-white/75">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>Confirm</Button>
      </div>
    </Modal>
  );
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const id = useId();
  return (
    <label className="block" htmlFor={id}>
      <span className="sr-only">{placeholder}</span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm outline-none focus:border-festival" />
    </label>
  );
}

export function useDebounced(value: string, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}
