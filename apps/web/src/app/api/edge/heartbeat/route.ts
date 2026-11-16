import { z } from "zod";
import { HardwareHealth } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail, ok, requireEdge } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordDeviceHealth } from "@/lib/hardware-service";

const schema = z.object({
  edgeVersion: z.string().max(40),
  pendingSync: z.number().int().min(0).max(10_000_000),
  failedSync: z.number().int().min(0).max(10_000_000).default(0),
  mqttConnected: z.boolean(),
  uptimeSeconds: z.number().int().min(0).optional(),
  simulated: z.boolean().optional(),
  devices: z.array(z.object({
    deviceKey: z.string().max(60),
    health: z.nativeEnum(HardwareHealth),
    message: z.string().max(300).optional(),
    readings: z.record(z.unknown()).optional(),
  })).max(200).default([]),
});

/** Edge controller heartbeat: edge liveness, sync backlog and per-device health. */
export async function POST(request: Request) {
  const auth = await requireEdge(request);
  if (auth.error) return auth.error;
  const siteId = auth.actor!.siteId;
  // Normal cadence is every 30 s; allow bursts after reconnects.
  if (!checkRateLimit(`edge-heartbeat:${siteId}`, 20, 60_000).allowed) return fail("Heartbeat rate exceeded", 429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid heartbeat", 422);
  const now = new Date();
  await prisma.site.update({
    where: { id: siteId },
    data: {
      edgeLastSeenAt: now,
      edgeVersion: parsed.data.edgeVersion,
      edgePendingSync: parsed.data.pendingSync,
      edgeFailedSync: parsed.data.failedSync,
      edgeMqttConnected: parsed.data.mqttConnected,
      edgeSimulated: parsed.data.simulated ?? false,
    },
  });
  const devices = await prisma.hardwareDevice.findMany({
    where: { siteId, deviceKey: { in: parsed.data.devices.map((d) => d.deviceKey) } },
    select: { id: true, siteId: true, deviceKey: true, lastHealth: true },
  });
  for (const report of parsed.data.devices) {
    const device = devices.find((d) => d.deviceKey === report.deviceKey);
    if (device) await recordDeviceHealth(device, report, now);
  }
  // The edge controller itself is a device too, when registered.
  const edge = await prisma.hardwareDevice.findFirst({ where: { siteId, type: "EDGE_DAEMON", isActive: true }, select: { id: true, siteId: true, lastHealth: true } });
  if (edge) await recordDeviceHealth(edge, { health: parsed.data.failedSync > 0 ? "DEGRADED" : "ONLINE", message: `v${parsed.data.edgeVersion}, ${parsed.data.pendingSync} pending sync` }, now);
  return ok({ receivedAt: now.toISOString(), unknownDevices: parsed.data.devices.filter((r) => !devices.some((d) => d.deviceKey === r.deviceKey)).map((r) => r.deviceKey) });
}
