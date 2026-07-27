export const mqttTopics = {
  telemetry: (siteId: string) => `weighbridge/${siteId}/telemetry`,
  state: (siteId: string) => `weighbridge/${siteId}/state`,
  transaction: (siteId: string) => `weighbridge/${siteId}/transaction`,
  alerts: (siteId: string) => `weighbridge/${siteId}/alerts`,
  hardwareStatus: (siteId: string) => `weighbridge/${siteId}/hardware/status`,
  gateCommand: (siteId: string) => `weighbridge/${siteId}/gate/command`,
  gateStatus: (siteId: string) => `weighbridge/${siteId}/gate/status`,
  queue: (siteId: string) => `weighbridge/${siteId}/queue`,
  notification: (userId: string) => `dashboard/${userId}/notifications`,
  syncStatus: (siteId: string) => `sync/${siteId}/status`,
} as const;

export const mqttQos = {
  telemetry: 0,
  state: 0,
  transaction: 1,
  alert: 1,
  hardwareStatus: 0,
  gate: 1,
  queue: 0,
  notification: 1,
  sync: 1,
} as const;
