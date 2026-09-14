"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Activity, AlertTriangle, BarChart3, Building2, CheckSquare, ClipboardList, Database, FileClock, FileText, Gauge, LogOut, MonitorCheck, PackageSearch, Receipt, ShieldCheck, Siren, Truck, UserPlus, Users, Wallet, Wrench, ChevronDown, Server, Radio, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

type Role = "TRANSPORTER" | "OPERATOR" | "ADMIN" | "SECURITY";
const nav = {
  TRANSPORTER: [{ href: "/transporter/fleet", label: "Fleet", icon: Truck }, { href: "/transporter/history", label: "Waybills", icon: Receipt }, { href: "/transporter/reports", label: "Reports", icon: FileText }],
  OPERATOR: [{ href: "/operator", label: "Weighbridge Station", icon: Gauge }, { href: "/operator/incidents", label: "Incidents", icon: AlertTriangle }],
  SECURITY: [{ href: "/operator", label: "Weighbridge Station", icon: ShieldCheck }, { href: "/operator/incidents", label: "Incidents", icon: AlertTriangle }],
  ADMIN: [
    { group: "Dashboard" },
    { href: "/admin", label: "Overview", icon: Activity },
    { group: "Operations" },
    { href: "/admin/orders", label: "Orders", icon: PackageSearch },
    { href: "/admin/bookings", label: "Bookings", icon: ClipboardList },
    { href: "/operator", label: "Weighbridge Station", icon: Gauge },
    { href: "/admin/fleet", label: "Fleet", icon: Truck },
    { href: "/admin/service-orders", label: "Service Orders", icon: Wrench },
    { href: "/admin/incidents", label: "Incidents", icon: Siren },
    { href: "/admin/fraud", label: "Fraud", icon: ShieldCheck },
    { group: "Platform Admin", superAdminOnly: true },
    { href: "/admin/companies", label: "Companies", icon: Building2, superAdminOnly: true },
    { href: "/admin/transporters", label: "Transporters", icon: UserPlus, superAdminOnly: false },
    { group: "Master Data" },
    { href: "/admin/sites", label: "Sites", icon: Building2 },
    { href: "/admin/sources", label: "Sources", icon: Building2 },
    { href: "/admin/destinations", label: "Destinations", icon: Building2 },
    { href: "/admin/products", label: "Products", icon: PackageSearch },
    { group: "Access Control" },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/roles", label: "Roles", icon: ShieldCheck },
    { group: "Analytics & Data" },
    { href: "/admin/reports", label: "Reports", icon: FileText },
    { href: "/admin/reports/consolidated", label: "Platform report", icon: BarChart3, superAdminOnly: true },
    { href: "/admin/billing", label: "Billing", icon: Wallet },
    { href: "/admin/raw-data", label: "Raw data", icon: Database },
    { href: "/admin/audit-log", label: "Audit log", icon: FileClock, superAdminOnly: true },
  ] as Array<{ group?: string; href?: string; label?: string; icon?: React.ElementType; superAdminOnly?: boolean }>,
};

function NavGroup({ group, items, pathname }: { group: string; items: any[]; pathname: string }) {
  const isActiveGroup = items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'));
  const [isOpen, setIsOpen] = useState(isActiveGroup || group === "Dashboard" || group === "Operations");

  useEffect(() => {
    if (isActiveGroup) setIsOpen(true);
  }, [isActiveGroup]);

  return (
    <div className="mb-2">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex w-full cursor-pointer items-center justify-between px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 select-none hover:text-muted-foreground"
      >
        {group}
        <ChevronDown size={14} className={cn("transition-transform duration-200", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && (
        <div className="space-y-0.5 pt-1">
          {items.map(item => {
            const Icon = item.icon!;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href!} className={cn("flex h-8 items-center gap-3 rounded-sm px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted font-medium text-primary")}>
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children, role, userName, orgName, isSuperAdmin }: { children: React.ReactNode; role: Role; userName: string; orgName?: string | null; isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const scopeLabel = role === "ADMIN" ? (orgName ?? "All companies") : orgName;
  const items = nav[role].filter((item) => !('superAdminOnly' in item) || !(item as any).superAdminOnly || isSuperAdmin);

  const groupedItems: { group: string | null; items: typeof items }[] = [];
  let currentGroup = { group: null as string | null, items: [] as typeof items };
  
  for (const item of items) {
    if ('group' in item && item.group) {
      if (currentGroup.group !== null || currentGroup.items.length > 0) {
        groupedItems.push(currentGroup);
      }
      currentGroup = { group: (item as any).group, items: [] };
    } else {
      currentGroup.items.push(item);
    }
  }
  if (currentGroup.group !== null || currentGroup.items.length > 0) {
    groupedItems.push(currentGroup);
  }

  return <div className="min-h-screen bg-background"><aside className="fixed inset-y-0 left-0 z-40 hidden w-56 border-r border-border bg-surface lg:block flex-col overflow-y-auto"><div className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-surface px-4"><Image src="/brand/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" priority /><div><p className="text-sm font-semibold leading-none text-foreground">Weighbridge</p><p className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">Control platform</p></div></div><nav className="space-y-0.5 p-2 pb-24">{groupedItems.map((g, index) => {
    if (g.group) {
      return <NavGroup key={index} group={g.group} items={g.items} pathname={pathname} />;
    }
    return g.items.map(item => {
      const Icon = item.icon!; const active = pathname === item.href; return <Link key={item.href} href={item.href!} className={cn("flex h-8 items-center gap-3 rounded-sm px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground", active && "bg-muted font-medium text-primary")}><Icon size={16} />{item.label}</Link>;
    });
  })}</nav><div className="fixed bottom-0 left-0 w-56 border-t border-border bg-surface p-2"><div className="mb-2 px-2"><p className="truncate text-sm font-medium text-foreground">{userName}</p><p className="text-2xs uppercase tracking-wider text-muted-foreground">{role}</p>{scopeLabel && <p className="truncate text-2xs text-muted-foreground">{scopeLabel}</p>}</div><Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={14} className="mr-2" />Sign out</Button></div></aside><div className="lg:pl-56"><header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:px-6"><div><p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">Central cloud enforcement</p></div><div className="flex items-center gap-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-success" />Platform online</div><ThemeToggle /></div></header><main className="p-4 lg:p-6">{children}</main></div></div>;
}
