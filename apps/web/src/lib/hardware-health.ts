import type { HardwareHealth } from "@prisma/client";

/** Display states used everywhere hardware status is shown. */
export type DeviceStatus = "ONLINE" | "OFFLINE" | "WARNING" | "ERROR" | "DISABLED" | "UNKNOWN" | "MAINTENANCE";

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  ONLINE: "Online",
  OFFLINE: "Offline",
  WARNING: "Warning",
  ERROR: "Error",
  DISABLED: "Disabled",
  UNKNOWN: "Unknown",
  MAINTENANCE: "Maintenance",
};

export const DEFAULT_HEARTBEAT_SECONDS = 30;
/** A device is considered offline after this many missed heartbeats. */
export const MISSED_HEARTBEATS_OFFLINE = 3;

export function staleAfterMs(heartbeatSeconds?: number | null): number {
  const interval = heartbeatSeconds && heartbeatSeconds > 0 ? heartbeatSeconds : DEFAULT_HEARTBEAT_SECONDS;
  return Math.max(interval * MISSED_HEARTBEATS_OFFLINE, 60) * 1000;
}

export function deriveDeviceStatus(
  device: {
    isActive: boolean;
    maintenanceMode?: boolean | null;
    lastHealth?: HardwareHealth | null;
    lastSeenAt?: Date | string | null;
    configuration?: unknown;
  },
  now: Date = new Date(),
): DeviceStatus {
  if (!device.isActive) return "DISABLED";
  if (device.maintenanceMode) return "MAINTENANCE";
  if (!device.lastSeenAt || !device.lastHealth) return "UNKNOWN";
  const heartbeat = Number((device.configuration as Record<string, unknown> | null)?.heartbeatSeconds) || null;
  if (now.getTime() - new Date(device.lastSeenAt).getTime() > staleAfterMs(heartbeat)) return "OFFLINE";
  switch (device.lastHealth) {
    case "ONLINE":
      return "ONLINE";
    case "DEGRADED":
      return "WARNING";
    case "FAULT":
      return "ERROR";
    case "OFFLINE":
      return "OFFLINE";
  }
}

export type EdgeStatus = "ONLINE" | "OFFLINE" | "NEVER_CONNECTED" | "NOT_REQUIRED";

export function deriveEdgeStatus(
  site: { edgeKeyHash?: string | null; edgeLastSeenAt?: Date | string | null },
  now: Date = new Date(),
): EdgeStatus {
  if (!site.edgeKeyHash) return site.edgeLastSeenAt ? "OFFLINE" : "NOT_REQUIRED";
  if (!site.edgeLastSeenAt) return "NEVER_CONNECTED";
  return now.getTime() - new Date(site.edgeLastSeenAt).getTime() > staleAfterMs(DEFAULT_HEARTBEAT_SECONDS) ? "OFFLINE" : "ONLINE";
}

/** "8 sec ago" / "4 min ago" / "3 h ago" / "never". */
export function ageLabel(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return "never";
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 1000));
  if (seconds < 60) return `${seconds} sec ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}
