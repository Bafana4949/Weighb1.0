import { describe, expect, it } from "vitest";
import { HardwareDeviceType } from "@prisma/client";
import { CONNECTION_TYPES, DEVICE_TYPES, staticDeviceCheck, validateDeviceConfiguration, visibleFields, type ConnectionType } from "@/lib/hardware-catalog";
import { BUILT_IN_PROFILES } from "@/lib/hardware-profiles";
import { ageLabel, deriveDeviceStatus, deriveEdgeStatus } from "@/lib/hardware-health";
import { constantTimeEqual, generateEdgeKey, hashEdgeKey, legacySiteKeyMatches, looksLikeEdgeKey } from "@/lib/edge-auth";

describe("Hardware catalogue", () => {
  it("defines every device type in the database enum", () => {
    for (const type of Object.values(HardwareDeviceType)) expect(DEVICE_TYPES[type], type).toBeDefined();
  });

  it("only offers known connection types and a default that is offered", () => {
    for (const [type, def] of Object.entries(DEVICE_TYPES)) {
      for (const c of def.connections) expect(CONNECTION_TYPES[c], `${type}:${c}`).toBeDefined();
      expect(def.connections, type).toContain(def.defaultConnection);
    }
  });

  it("shows serial settings only for serial connections (progressive disclosure)", () => {
    const serial = visibleFields("SCALE", "WEB_SERIAL").map((f) => f.key);
    const tcp = visibleFields("SCALE", "TCP_IP").map((f) => f.key);
    expect(serial).toContain("baudRate");
    expect(serial).not.toContain("host");
    expect(tcp).toContain("host");
    expect(tcp).not.toContain("baudRate");
  });

  it("enforces required fields and ranges", () => {
    const r = validateDeviceConfiguration("SCALE", "TCP_IP", { protocol: "MT_SICS", unit: "kg", port: 70000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join(" ")).toMatch(/IP address \/ hostname is required/);
      expect(r.errors.join(" ")).toMatch(/at most 65535/);
    }
  });

  it("drops unknown keys so nothing arbitrary is stored", () => {
    const r = validateDeviceConfiguration("PRINTER", "USB", { printerType: "STANDARD", password: "hunter2", __proto__x: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.configuration).toEqual({ printerType: "STANDARD" });
  });

  it("rejects a connection the device type does not support", () => {
    expect(validateDeviceConfiguration("ENTRY_GATE", "WEB_SERIAL", {}).ok).toBe(false);
  });

  it("rejects hostnames with shell or URL metacharacters", () => {
    const r = validateDeviceConfiguration("RFID_READER", "TCP_IP", { technology: "RFID_UHF", position: "DECK", host: "10.0.0.5;rm -rf /", port: 6000 });
    expect(r.ok).toBe(false);
  });

  it("is honest about planned adapters", () => {
    const check = staticDeviceCheck({ type: "ENTRY_GATE", connectionType: "MODBUS_TCP", isSimulated: false, configuration: { host: "10.0.0.9", port: 502, autoCloseSeconds: 8, faultBehaviour: "HOLD_CLOSED", manualOverride: "SUPERVISOR" } });
    expect(check.status).toBe("warn");
    expect(check.messages.join(" ")).toMatch(/not implemented/);
    expect((Object.keys(CONNECTION_TYPES) as ConnectionType[]).filter((c) => CONNECTION_TYPES[c].support === "planned")).toEqual(expect.arrayContaining(["MODBUS_TCP", "MODBUS_RTU", "RTSP", "HTTP_API"]));
  });

  it("flags simulated devices", () => {
    const check = staticDeviceCheck({ type: "PRINTER", connectionType: "USB", isSimulated: true, configuration: { printerType: "STANDARD" } });
    expect(check.messages.join(" ")).toMatch(/SIMULATED/);
  });

  it("built-in templates validate, apart from site-specific addresses left for commissioning", () => {
    for (const profile of BUILT_IN_PROFILES) {
      for (const d of profile.devices) {
        const r = validateDeviceConfiguration(d.type, d.connectionType, d.configuration ?? {});
        if (!r.ok) expect(r.errors.every((e) => /IP address \/ hostname is required/.test(e)), `${profile.name}/${d.deviceKey}: ${r.errors}`).toBe(true);
      }
      expect(new Set(profile.devices.map((d) => d.deviceKey)).size, profile.name).toBe(profile.devices.length);
    }
  });
});

describe("Hardware health", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  it("derives the display states", () => {
    expect(deriveDeviceStatus({ isActive: false }, now)).toBe("DISABLED");
    expect(deriveDeviceStatus({ isActive: true, maintenanceMode: true, lastHealth: "ONLINE", lastSeenAt: ago(5) }, now)).toBe("MAINTENANCE");
    expect(deriveDeviceStatus({ isActive: true }, now)).toBe("UNKNOWN");
    expect(deriveDeviceStatus({ isActive: true, lastHealth: "ONLINE", lastSeenAt: ago(10) }, now)).toBe("ONLINE");
    expect(deriveDeviceStatus({ isActive: true, lastHealth: "DEGRADED", lastSeenAt: ago(10) }, now)).toBe("WARNING");
    expect(deriveDeviceStatus({ isActive: true, lastHealth: "FAULT", lastSeenAt: ago(10) }, now)).toBe("ERROR");
  });

  it("goes Offline after three missed heartbeats, honouring the device's interval", () => {
    expect(deriveDeviceStatus({ isActive: true, lastHealth: "ONLINE", lastSeenAt: ago(89) }, now)).toBe("ONLINE");
    expect(deriveDeviceStatus({ isActive: true, lastHealth: "ONLINE", lastSeenAt: ago(91) }, now)).toBe("OFFLINE");
    expect(deriveDeviceStatus({ isActive: true, lastHealth: "ONLINE", lastSeenAt: ago(500), configuration: { heartbeatSeconds: 300 } }, now)).toBe("ONLINE");
  });

  it("derives edge status from key and heartbeat", () => {
    expect(deriveEdgeStatus({ edgeKeyHash: null }, now)).toBe("NOT_REQUIRED");
    expect(deriveEdgeStatus({ edgeKeyHash: "x" }, now)).toBe("NEVER_CONNECTED");
    expect(deriveEdgeStatus({ edgeKeyHash: "x", edgeLastSeenAt: ago(8) }, now)).toBe("ONLINE");
    expect(deriveEdgeStatus({ edgeKeyHash: "x", edgeLastSeenAt: ago(600) }, now)).toBe("OFFLINE");
    expect(ageLabel(ago(8), now)).toBe("8 sec ago");
  });
});

describe("Edge credentials", () => {
  it("generates unique prefixed keys and stores only a hash", () => {
    const a = generateEdgeKey();
    const b = generateEdgeKey();
    expect(a.key).not.toEqual(b.key);
    expect(looksLikeEdgeKey(a.key)).toBe(true);
    expect(a.hash).toEqual(hashEdgeKey(a.key));
    expect(a.hash).not.toContain(a.key);
    expect(a.key.startsWith(a.prefix)).toBe(true);
  });

  it("refuses the legacy shared key unless explicitly enabled, and never a placeholder", () => {
    const strong = "k".repeat(40);
    expect(legacySiteKeyMatches(strong, { SITE_DAEMON_API_KEY: strong } as NodeJS.ProcessEnv)).toBe(false);
    expect(legacySiteKeyMatches(strong, { SITE_DAEMON_API_KEY: strong, ALLOW_LEGACY_SITE_KEY: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(legacySiteKeyMatches("dev-site-key-change-me", { SITE_DAEMON_API_KEY: "dev-site-key-change-me", ALLOW_LEGACY_SITE_KEY: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(legacySiteKeyMatches("wrong".padEnd(40, "x"), { SITE_DAEMON_API_KEY: strong, ALLOW_LEGACY_SITE_KEY: "true" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("compares in constant time and handles different lengths", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
