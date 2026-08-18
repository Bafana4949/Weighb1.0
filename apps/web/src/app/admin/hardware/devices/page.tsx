import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { HardwareDeviceManagement } from "@/components/hardware-device-management";
import { auth } from "@/auth";
import { isPlatformSuperAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Hardware Devices | Weighbridge Admin",
};

export default async function HardwareDevicesPage() {
  const session = await auth();
  if (!session || !isPlatformSuperAdmin(session.user)) redirect("/admin");

  // Fetch all devices
  const devices = await prisma.hardwareDevice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      site: { select: { name: true, organisation: { select: { name: true } } } },
      lane: { select: { name: true } },
    }
  });

  const organisations = await prisma.organisation.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });

  const sites = await prisma.site.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, organisationId: true }
  });

  const lanes = await prisma.lane.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, siteId: true }
  });

  return (
    <AppShell 
      role={session.user.role} 
      userName={session.user.name ?? "Admin"} 
      orgName={session.user.organisationName} 
      isSuperAdmin={isPlatformSuperAdmin(session.user)}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hardware Devices</h1>
          <p className="text-sm text-muted-foreground">
            Manage physical equipment (Cameras, Sensors, Gates, Scales) across all sites.
          </p>
        </div>
        
        <HardwareDeviceManagement 
          initialDevices={devices} 
          organisations={organisations} 
          sites={sites} 
          lanes={lanes} 
        />
      </div>
    </AppShell>
  );
}
