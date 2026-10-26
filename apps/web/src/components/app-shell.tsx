"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Activity, AlertTriangle, BarChart3, Building2, ClipboardList, Database, FileClock, FileText, Gauge, HeartPulse, LogOut, Menu, PackageSearch, Receipt, Rocket, ShieldCheck, Siren, SlidersHorizontal, Truck, UserPlus, Users, Wallet, Wrench, ChevronDown, Server, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

type Role = "TRANSPORTER" | "OPERATOR" | "ADMIN" | "SECURITY";
type NavItem = { group?: string; href?: string; label?: string; icon?: React.ElementType; superAdminOnly?: boolean };
const nav: Record<Role, NavItem[]> = {
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
    { href: "/admin/sites/new", label: "Site setup wizard", icon: Rocket, superAdminOnly: true },
    { href: "/admin/transporters", label: "Transporters", icon: UserPlus, superAdminOnly: false },
    { group: "Master Data" },
    { href: "/admin/sites", label: "Sites", icon: Building2 },
    { href: "/admin/sources", label: "Sources", icon: Building2 },
    { href: "/admin/destinations", label: "Destinations", icon: Building2 },
    { href: "/admin/products", label: "Products", icon: PackageSearch },
    { group: "Hardware" },
    { href: "/admin/hardware/health", label: "Hardware health", icon: HeartPulse },
    { href: "/admin/hardware", label: "Configuration", icon: SlidersHorizontal },
    { href: "/admin/hardware/rfid", label: "RFID / NFC tags", icon: Radio, superAdminOnly: true },
    { href: "/admin/hardware/installations", label: "Installations", icon: Server, superAdminOnly: true },
    { group: "Access Control" },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/roles", label: "Roles", icon: ShieldCheck },
    { group: "Analytics & Data" },
    { href: "/admin/reports", label: "Reports", icon: FileText },
    { href: "/admin/reports/consolidated", label: "Platform report", icon: BarChart3, superAdminOnly: true },
    { href: "/admin/billing", label: "Billing", icon: Wallet },
    { href: "/admin/raw-data", label: "Raw data", icon: Database },
    { href: "/admin/audit-log", label: "Audit log", icon: FileClock },
  ],
};

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  return pathname === href || (href !== "/admin" && href !== "/admin/hardware" && pathname.startsWith(href + "/"));
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const Icon = item.icon!;
  const active = isActive(pathname, item.href);
  return (
    <Link href={item.href!} onClick={onNavigate} aria-current={active ? "page" : undefined}
      className={cn("flex h-9 items-center gap-3 rounded-sm px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground lg:h-8", active && "bg-muted font-medium text-primary")}>
      <Icon size={16} />{item.label}
    </Link>
  );
}

function NavGroup({ group, items, pathname, onNavigate }: { group: string; items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const isActiveGroup = items.some((item) => isActive(pathname, item.href));
  const [isOpen, setIsOpen] = useState(isActiveGroup || group === "Dashboard" || group === "Operations");
  useEffect(() => { if (isActiveGroup) setIsOpen(true); }, [isActiveGroup]);
  return (
    <div className="mb-2">
      <button onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}
        className="flex w-full cursor-pointer select-none items-center justify-between px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground">
        {group}
        <ChevronDown size={14} className={cn("transition-transform duration-200", !isOpen && "-rotate-90")} />
      </button>
      {isOpen && <div className="space-y-0.5 pt-1">{items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}</div>}
    </div>
  );
}

function NavTree({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const groups: { group: string | null; items: NavItem[] }[] = [];
  let current = { group: null as string | null, items: [] as NavItem[] };
  for (const item of items) {
    if (item.group) {
      if (current.group !== null || current.items.length > 0) groups.push(current);
      current = { group: item.group, items: [] };
    } else current.items.push(item);
  }
  if (current.group !== null || current.items.length > 0) groups.push(current);
  return (
    <nav aria-label="Main" className="space-y-0.5 p-2 pb-24">
      {groups.map((g, i) => g.group
        ? <NavGroup key={i} group={g.group} items={g.items} pathname={pathname} onNavigate={onNavigate} />
        : g.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />))}
    </nav>
  );
}

/** Browser connectivity — a true statement about this device, unlike a hard-coded "online". */
function ConnectionIndicator() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><span className={cn("h-2 w-2 rounded-full", online ? "bg-success" : "bg-danger")} />{online ? "Connected" : "No connection"}</div>;
}

export function AppShell({ children, role, userName, orgName, isSuperAdmin }: { children: React.ReactNode; role: Role; userName: string; orgName?: string | null; isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleLabel, setRoleLabel] = useState<string>(isSuperAdmin ? "Platform Super Admin" : role === "ADMIN" ? "Administrator" : role.charAt(0) + role.slice(1).toLowerCase());
  const scopeLabel = isSuperAdmin ? "All companies" : orgName;
  const items = nav[role].filter((item) => !item.superAdminOnly || isSuperAdmin);

  useEffect(() => {
    fetch("/api/users/me", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (b?.data?.roleLabel) setRoleLabel(b.data.roleLabel); }).catch(() => undefined);
  }, []);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const brand = (
    <div className="flex items-center gap-2">
      <Image src="/brand/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" priority />
      <div><p className="text-sm font-semibold leading-none text-foreground">Weighbridge</p><p className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">Control platform</p></div>
    </div>
  );
  const userBlock = (
    <div className="border-t border-border bg-surface p-2">
      <div className="mb-2 px-2">
        <p className="truncate text-sm font-medium text-foreground">{userName}</p>
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{roleLabel}</p>
        {scopeLabel && <p className="truncate text-2xs text-muted-foreground">{scopeLabel}</p>}
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => signOut({ callbackUrl: "/login" })}><LogOut size={14} className="mr-2" />Sign out</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
        <div className="sticky top-0 z-10 flex h-12 items-center border-b border-border bg-surface px-4">{brand}</div>
        <div className="flex-1"><NavTree items={items} pathname={pathname} /></div>
        <div className="sticky bottom-0">{userBlock}</div>
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface shadow-xl">
            <div className="flex h-12 items-center justify-between border-b border-border px-4">{brand}<Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={18} /></Button></div>
            <div className="flex-1"><NavTree items={items} pathname={pathname} onNavigate={() => setMenuOpen(false)} /></div>
            {userBlock}
          </div>
        </div>
      )}

      <div className="lg:pl-56">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={18} /></Button>
            <p className="truncate text-2xs uppercase tracking-[0.2em] text-muted-foreground">{scopeLabel ?? roleLabel}</p>
          </div>
          <div className="flex items-center gap-3"><ConnectionIndicator /><ThemeToggle /></div>
        </header>
        <main className="p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
