/**
 * MQTT topic hierarchy shared by the cloud and the edge (apps/site-daemon/topics.py):
 *
 *   tenant/{organisationId}/site/{siteId}/lane/{laneNumber}/{scale/weight | gate/status | gate/command | ...}
 *   tenant/{organisationId}/site/{siteId}/{edge/heartbeat | hardware/status | sync/status | alerts}
 *
 * Tenant and site ids are path segments, so broker ACLs (`pattern readwrite tenant/+/site/%u/#`)
 * confine each edge controller to its own site and no subscription can span tenants by accident.
 */

export const LANE_TOPICS = ["scale/weight", "gate/status", "gate/command", "rfid/event", "sensors/state", "state", "alerts", "transaction"] as const;
export const SITE_TOPICS = ["edge/heartbeat", "hardware/status", "sync/status", "alerts"] as const;
export type LaneTopic = (typeof LANE_TOPICS)[number];
export type SiteTopic = (typeof SITE_TOPICS)[number];

const SEGMENT = /^[A-Za-z0-9_.:-]+$/;

function segment(label: string, value: string): string {
  if (!SEGMENT.test(value)) throw new Error(`Invalid ${label} for MQTT topic: ${JSON.stringify(value)}`);
  return value;
}

export function sitePrefix(organisationId: string, siteId: string): string {
  return `tenant/${segment("organisation id", organisationId)}/site/${segment("site id", siteId)}`;
}

export function laneTopic(organisationId: string, siteId: string, laneNumber: number, topic: LaneTopic): string {
  if (!Number.isInteger(laneNumber) || laneNumber < 1) throw new Error(`Invalid lane number ${laneNumber}`);
  return `${sitePrefix(organisationId, siteId)}/lane/${laneNumber}/${topic}`;
}

export function siteTopic(organisationId: string, siteId: string, topic: SiteTopic): string {
  return `${sitePrefix(organisationId, siteId)}/${topic}`;
}

/** Subscription filter for everything one site publishes (never wider than a site). */
export function siteSubscription(organisationId: string, siteId: string): string {
  return `${sitePrefix(organisationId, siteId)}/#`;
}

export const mqttQos = {
  "scale/weight": 0,
  "sensors/state": 0,
  state: 0,
  "gate/status": 1,
  "gate/command": 1,
  "rfid/event": 1,
  alerts: 1,
  transaction: 1,
  "edge/heartbeat": 0,
  "hardware/status": 0,
  "sync/status": 1,
} as const satisfies Record<LaneTopic | SiteTopic, 0 | 1>;
