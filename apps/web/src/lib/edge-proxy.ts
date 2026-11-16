import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { siteIdentifierWhere } from "@/lib/utils";

/**
 * Co-located deployments (web app on the same LAN as one edge controller) may proxy
 * live telemetry and operator commands to that controller. The controller serves
 * exactly one site, named by SITE_DAEMON_SITE_CODE; callers must have access to that
 * site, and requests carry the controller's local token. Cloud deployments leave
 * SITE_DAEMON_URL unset and the edge reaches the cloud instead (heartbeat/MQTT).
 */
export function daemonConfigured(): boolean {
  return Boolean(process.env.SITE_DAEMON_URL && process.env.SITE_DAEMON_SITE_CODE);
}

export async function daemonSiteFor(user: { id: string; organisationId?: string | null; platformRole?: any; role?: any }) {
  if (!daemonConfigured()) return null;
  const site = await prisma.site.findFirst({ where: siteIdentifierWhere(process.env.SITE_DAEMON_SITE_CODE!), select: { id: true, code: true, organisationId: true } });
  if (!site || !(await canAccessSite(user, site))) return null;
  return site;
}

export function daemonUrl(path: string): string {
  return `${process.env.SITE_DAEMON_URL!.replace(/\/$/, "")}${path}`;
}

export function daemonHeaders(): Record<string, string> {
  return { "content-type": "application/json", ...(process.env.SITE_DAEMON_TOKEN ? { "x-edge-token": process.env.SITE_DAEMON_TOKEN } : {}) };
}
