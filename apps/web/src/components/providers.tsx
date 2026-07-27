"use client";
import { SessionProvider, useSession } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { X } from "lucide-react";

type Toast = { id: string; title: string; body?: string; severity?: string };
const ToastContext = createContext<(toast: Omit<Toast, "id">) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

function NotificationSocket() {
  const { data } = useSession();
  const push = useToast();
  useEffect(() => {
    if (!data?.user.id) return;
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? window.location.origin, { auth: { userId: data.user.id } });
    socket.on("notification", (message) => push({ title: message.payload?.subject ?? "Notification", body: message.payload?.body, severity: message.payload?.severity }));
    return () => { socket.disconnect(); };
  }, [data?.user.id, push]);
  return null;
}

function ToastLayer({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-4), { ...toast, id }]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 6500);
  }, []);
  const value = useMemo(() => push, [push]);
  return <ToastContext.Provider value={value}>{children}<NotificationSocket /><div className="fixed right-4 top-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">{toasts.map((toast) => <div key={toast.id} className={`rounded-sm border bg-surface p-3 shadow-xl ${toast.severity === "CRITICAL" || toast.severity === "HIGH" ? "border-danger/60" : "border-border"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">{toast.title}</p>{toast.body && <p className="mt-1 text-xs text-muted-foreground">{toast.body}</p>}</div><button className="text-muted-foreground hover:text-foreground" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={14} /></button></div></div>)}</div></ToastContext.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) { return <SessionProvider><ToastLayer>{children}</ToastLayer></SessionProvider>; }
