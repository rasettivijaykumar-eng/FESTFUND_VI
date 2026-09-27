import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorMessage, type Account } from "../lib/api";

type Toast = { id: number; kind: "success" | "error" | "warning" | "info"; message: string };

type ToastApi = { push: (kind: Toast["kind"], message: string) => void };
const ToastContext = createContext<ToastApi>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-xl ${tone[toast.kind]}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const tone = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  error: "border-red-200 bg-red-50 text-red-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  info: "border-orange-200 bg-orange-50 text-orange-950",
};

export function useToast() {
  return useContext(ToastContext);
}

type MotionApi = { reduced: boolean; setReduced: (value: boolean) => void };
const MotionContext = createContext<MotionApi>({ reduced: false, setReduced: () => undefined });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [reduced, setReducedState] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("festfund.motion");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedState(stored ? stored === "reduced" : media);
  }, []);
  const setReduced = (value: boolean) => {
    setReducedState(value);
    localStorage.setItem("festfund.motion", value ? "reduced" : "full");
  };
  const value = useMemo(() => ({ reduced, setReduced }), [reduced]);
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotionPref() {
  return useContext(MotionContext);
}

type AuthApi = {
  user: Account | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: Account | null) => void;
};
const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await api.get("/auth/me");
      setUser(response.data.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* cookie clear is best-effort */ }
    setUser(null);
    localStorage.removeItem("festfund.fest");
  }, []);
  const value = useMemo(() => ({ user, loading, refresh, logout, setUser }), [user, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

export { errorMessage };
