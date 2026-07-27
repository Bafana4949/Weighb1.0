"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Activity, AlertTriangle, Building2, CheckSquare, ClipboardList, Database, FileClock, FileText, Gauge, LogOut, MonitorCheck, PackageSearch, Receipt, ShieldCheck, Siren, Truck, UserPlus, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

type Role = "TRANSPORTER" | "OPERATOR" | "ADMIN" | "SECURITY";
const nav = {
  TRANSPORTER: [{ href: "/transporter", label: "Bookings", icon: ClipboardList }, { href: "/transporter/fleet", label: "Fleet", icon: Truck }, { href: "/transporter/history", label: "Waybills", icon: Receipt }],
  OPERATOR: [{ href: "/operator", label: "Live scale", icon: Gauge }, { href: "/kiosk", label: "Driver kiosk", icon: MonitorCheck }, { href: "/operator/incidents", label: "Incidents", icon: AlertTriangle }],
  SECURITY: [{ href: "/operator", label: "Gate control", icon: ShieldCheck }, { href: "/kiosk", label: "Driver kiosk", icon: MonitorCheck }, { href: "/operator/incidents", label: "Incidents", icon: AlertTriangle }],
  ADMIN: [
    { href: "/admin", label: "Overview", icon: Activity },
    { href: "/admin/companies", label: "Companies", icon: Building2, superAdminOnly: true },
    { href: "/admin/transporters", label: "Transporters", icon: UserPlus, superAdminOnly: true },
    { href: "/admin/bookings", label: "Approvals", icon: CheckSquare },
    { href: "/operator", label: "Live scale", icon: Gauge },
    { href: "/kiosk", label: "Driver kiosk", icon: MonitorCheck },
    { href: "/admin/orders", label: "Orders", icon: PackageSearch },
    { href: "/admin/incidents", label: "Incidents", icon: Siren },
    { href: "/admin/fraud", label: "Fraud", icon: ShieldCheck },
    { href: "/admin/fleet", label: "Fleet", icon: Truck },
    { href: "/admin/billing", label: "Billing", icon: Wallet },
    { href: "/admin/reports", label: "Reports", icon: FileText },
    { href: "/admin/raw-data", label: "Raw data", icon: Database },
    { href: "/admin/audit-log", label: "Audit log", icon: FileClock, superAdminOnly: true },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/sites", label: "Sites", icon: Building2 },
  ],
};

export function AppShell({ children, role, userName, orgName }: { children: React.ReactNode; role: Role; userName: string; orgName?: string | null }) {
  const pathname = usePathname();
  const isSuperAdmin = role === "ADMIN" && !orgName;
  const scopeLabel = role === "ADMIN" ? (orgName ?? "All companies") : orgName;
  const items = nav[role].filter((item) => !("superAdminOnly" in item && item.superAdminOnly) || isSuperAdmin);
  return <div className="min-h-screen bg-background"><aside className="fixed inset-y-0 left-0 z-40 hidden w-56 border-r border-border bg-surface lg:block"><div className="flex h-12 items-center gap-2 border-b border-border px-4"><Image src="/brand/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" priority /><div><p className="text-sm font-semibold leading-none text-foreground">Weighbridge</p><p className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">Control platform</p></div></div><nav className="space-y-0.5 p-2">{items.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} className={cn("flex h-8 items-center gap-3 rounded-sm px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted font-medium text-primary")}><Icon size={16} />{item.label}</Link>; })}</nav><div className="absolute bottom-0 left-0 right-0 border-t border-border p-2"><div className="mb-2 px-2"><p className="truncate text-sm font-medium text-foreground">{userName}</p><p className="text-2xs uppercase tracking-wider text-muted-foreground">{role}</p>{scopeLabel && <p className="truncate text-2xs text-muted-foreground">{scopeLabel}</p>}</div><Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={14} className="mr-2" />Sign out</Button></div></aside><div className="lg:pl-56"><header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-6"><div><p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">Central cloud enforcement</p></div><div className="flex items-center gap-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-success" />Platform online</div><ThemeToggle /></div></header><main className="p-4 lg:p-6">{children}</main></div></div>;
}
