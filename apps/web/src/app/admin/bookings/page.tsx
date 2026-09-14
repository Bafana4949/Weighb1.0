import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mineScope } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { BookingApprovals } from "@/components/booking-approvals";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const s = await auth();
  if (!s?.user) redirect("/login");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = 25;
  const scope = { site: mineScope(s.user.organisationId) };

  const where = {
    ...scope,
    ...(params.q
      ? {
          OR: [
            { reference: { contains: params.q, mode: "insensitive" as const } },
            { commodity: { contains: params.q, mode: "insensitive" as const } },
            { vehicle: { plate: { contains: params.q, mode: "insensitive" as const } } },
            { driver: { firstName: { contains: params.q, mode: "insensitive" as const } } },
            { driver: { lastName: { contains: params.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        vehicle: true,
        driver: true,
        site: true,
        transporterOrganisation: true,
        order: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  return (
    <AppShell
      role={s.user.role}
      userName={s.user.name ?? "Admin"}
      orgName={s.user.organisationName}
      isSuperAdmin={isPlatformSuperAdmin(s.user)}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Truck Bookings & Queue</h1>
            <p className="text-xs text-muted-foreground">
              Monitor approved truck arrivals, pending approvals, and scheduled weighbridge loads.
            </p>
          </div>
          <Link href="/admin/orders">
            <Button size="sm" className="gap-1.5 cursor-pointer">
              <Plus size={14} />
              Assign Fleet from Orders
            </Button>
          </Link>
        </div>

        <form className="flex items-end gap-2" method="get">
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search reference, vehicle plate, driver…"
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <BookingApprovals initialBookings={JSON.parse(JSON.stringify(bookings))} />

        <PaginationControls
          page={page}
          limit={limit}
          total={total}
          basePath="/admin/bookings"
          params={{ q: params.q }}
        />
      </div>
    </AppShell>
  );
}
