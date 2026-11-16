import { z } from "zod";
import type { HardwareDeviceType } from "@prisma/client";

/**
 * Single source of truth for configurable hardware: which device types exist, how
 * each may connect, and which settings apply. The configuration UI renders from this,
 * and the API validates against it, so a new device type is added here — not in
 * per-site code.
 *
 * `support` is deliberately honest: "implemented" means a working adapter ships in
 * this repository; "edge" means the on-site controller (apps/site-daemon) drives it;
 * "planned" means the setting can be recorded but no adapter exists yet.
 */

export type Support = "implemented" | "edge" | "planned";

export const CONNECTION_TYPES = {
  WEB_SERIAL: { label: "USB/serial via browser (Web Serial)", support: "implemented", note: "Operator console reads the indicator directly. Chrome or Edge only." },
  SERIAL_RS232: { label: "Serial RS-232", support: "edge", note: "Read by the edge controller (pyserial)." },
  SERIAL_RS485: { label: "Serial RS-485", support: "edge", note: "Through an RS-485 converter presenting a serial port. Multi-drop addressing is not implemented." },
  USB: { label: "USB", support: "implemented", note: "PC/SC NFC readers through the local NFC bridge; USB-serial indicators through Web Serial." },
  TCP_IP: { label: "TCP/IP (Ethernet / Wi-Fi)", support: "edge", note: "Edge controller opens a TCP socket to the device or serial server." },
  MQTT: { label: "MQTT", support: "implemented", note: "Device publishes to the site's tenant topic tree." },
  HTTP_API: { label: "HTTP API", support: "planned", note: "Vendor HTTP integrations need a per-vendor adapter." },
  RTSP: { label: "RTSP video stream", support: "planned", note: "ANPR currently reads still snapshots; live RTSP decoding is not implemented." },
  SNAPSHOT: { label: "Snapshot image source", support: "edge", note: "Edge ANPR reads a still image (file or snapshot path) per capture." },
  MODBUS_TCP: { label: "Modbus TCP", support: "planned", note: "No Modbus adapter yet. Use the PIC/relay controller protocol." },
  MODBUS_RTU: { label: "Modbus RTU", support: "planned", note: "No Modbus adapter yet." },
  DIGITAL_IO: { label: "Digital I/O via controller", support: "edge", note: "Input/relay channel on the site I/O controller (PIC18 protocol)." },
  NFC_BRIDGE: { label: "Local NFC bridge", support: "implemented", note: "tools/nfc-bridge on the operator PC, proxied by /api/nfc/uid." },
  BLUETOOTH: { label: "Bluetooth", support: "planned", note: "No Bluetooth adapter yet." },
  NETWORK: { label: "Network (monitoring only)", support: "planned", note: "Infrastructure is recorded for documentation; SNMP monitoring is not implemented." },
  NONE: { label: "Not connected (record only)", support: "implemented", note: "Documented for the site record; no data link." },
} as const satisfies Record<string, { label: string; support: Support; note: string }>;

export type ConnectionType = keyof typeof CONNECTION_TYPES;

export type FieldGroup = "connection" | "device";

export type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "number" | "select" | "boolean";
  group: FieldGroup;
  options?: readonly { value: string; label: string }[];
  min?: number;
  max?: number;
  required?: boolean;
  help?: string;
  /** Only shown/validated for these connection types. */
  connections?: readonly ConnectionType[];
};

const opt = (...values: string[]) => values.map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }));

const NETWORKED: ConnectionType[] = ["TCP_IP", "HTTP_API", "RTSP", "MODBUS_TCP"];
const SERIAL: ConnectionType[] = ["SERIAL_RS232", "SERIAL_RS485", "MODBUS_RTU", "WEB_SERIAL"];

const CONNECTION_FIELDS: FieldDef[] = [
  { key: "host", label: "IP address / hostname", kind: "text", group: "connection", required: true, connections: NETWORKED, help: "Address on the site LAN, reachable from the edge controller." },
  { key: "port", label: "TCP port", kind: "number", group: "connection", min: 1, max: 65535, required: true, connections: NETWORKED },
  { key: "path", label: "URL path", kind: "text", group: "connection", connections: ["HTTP_API", "RTSP"] },
  { key: "comPort", label: "COM port / device path", kind: "text", group: "connection", connections: ["SERIAL_RS232", "SERIAL_RS485", "MODBUS_RTU"], help: "e.g. COM3 or /dev/ttyUSB0 on the edge controller." },
  { key: "baudRate", label: "Baud rate", kind: "select", group: "connection", options: opt("1200", "2400", "4800", "9600", "19200", "38400", "57600", "115200"), required: true, connections: SERIAL },
  { key: "dataBits", label: "Data bits", kind: "select", group: "connection", options: opt("7", "8"), connections: SERIAL },
  { key: "parity", label: "Parity", kind: "select", group: "connection", options: opt("none", "even", "odd"), connections: SERIAL },
  { key: "stopBits", label: "Stop bits", kind: "select", group: "connection", options: opt("1", "2"), connections: SERIAL },
  { key: "modbusUnitId", label: "Modbus unit ID", kind: "number", group: "connection", min: 0, max: 247, connections: ["MODBUS_TCP", "MODBUS_RTU"] },
  { key: "mqttTopic", label: "MQTT topic suffix", kind: "text", group: "connection", connections: ["MQTT"], help: "Appended to tenant/{company}/site/{site}/lane/{lane}/" },
  { key: "controllerKey", label: "I/O controller device key", kind: "text", group: "connection", required: true, connections: ["DIGITAL_IO"], help: "Device key of the CONTROLLER this channel is wired to." },
  { key: "channel", label: "Controller channel", kind: "number", group: "connection", min: 0, max: 64, required: true, connections: ["DIGITAL_IO"] },
  { key: "credentialRef", label: "Credential reference", kind: "text", group: "connection", connections: [...NETWORKED, "MQTT"], help: "Name of the secret stored on the edge controller. Passwords are never stored in the cloud." },
];

const COMMON_FIELDS: FieldDef[] = [
  { key: "heartbeatSeconds", label: "Expected heartbeat (seconds)", kind: "number", group: "device", min: 5, max: 3600, help: "Device is shown Offline after three missed heartbeats." },
];

type DeviceTypeDef = {
  label: string;
  category: "Weighing" | "Identification" | "Access & traffic" | "Sensors" | "Control" | "Output" | "Infrastructure";
  description: string;
  connections: readonly ConnectionType[];
  defaultConnection: ConnectionType;
  fields: FieldDef[];
  /** A suggested device key prefix; the UI appends a lane number. */
  keyPrefix: string;
};

export const SCALE_PROTOCOLS = [
  { value: "METTLER_TOLEDO_CONTINUOUS", label: "Mettler Toledo Continuous", support: "implemented" },
  { value: "MT_SICS", label: "Mettler Toledo MT-SICS", support: "implemented" },
  { value: "GENERIC_ASCII", label: "Generic continuous ASCII (Net/Gross/WT)", support: "implemented" },
  { value: "AVERY_WEIGHTRONIX", label: "Avery Weigh-Tronix (via generic ASCII)", support: "implemented" },
  { value: "RICELAKE_IQ355", label: "Rice Lake IQ (via generic ASCII)", support: "implemented" },
  { value: "PIC_CONTROLLER", label: "Edge I/O controller telemetry", support: "edge" },
] as const;

export const DEVICE_TYPES: Record<HardwareDeviceType, DeviceTypeDef> = {
  SCALE: {
    label: "Scale indicator",
    category: "Weighing",
    description: "Weighbridge deck, load cells and indicator. The indicator is what the system talks to.",
    connections: ["WEB_SERIAL", "SERIAL_RS232", "SERIAL_RS485", "TCP_IP", "MODBUS_TCP", "NONE"],
    defaultConnection: "WEB_SERIAL",
    keyPrefix: "SCALE",
    fields: [
      { key: "protocol", label: "Protocol / parser", kind: "select", group: "device", options: SCALE_PROTOCOLS, required: true },
      { key: "unit", label: "Unit", kind: "select", group: "device", options: opt("kg", "t"), required: true },
      { key: "requireStable", label: "Require stable weight before capture", kind: "boolean", group: "device" },
      { key: "zeroThresholdKg", label: "Zero threshold (kg)", kind: "number", group: "device", min: 0, max: 2000 },
      { key: "minWeightKg", label: "Minimum weighable (kg)", kind: "number", group: "device", min: 0, max: 50000 },
      { key: "maxCapacityKg", label: "Maximum capacity (kg)", kind: "number", group: "device", min: 1000, max: 200000 },
      { key: "pollIntervalMs", label: "Polling interval (ms)", kind: "number", group: "device", min: 50, max: 10000 },
      { key: "timeoutMs", label: "Signal-lost timeout (ms)", kind: "number", group: "device", min: 500, max: 60000 },
      { key: "decimals", label: "Decimal precision", kind: "number", group: "device", min: 0, max: 3 },
    ],
  },
  RFID_READER: {
    label: "RFID reader",
    category: "Identification",
    description: "Reads vehicle tags or driver cards at entry, deck or exit.",
    connections: ["TCP_IP", "SERIAL_RS232", "MQTT", "USB"],
    defaultConnection: "TCP_IP",
    keyPrefix: "RFID",
    fields: [
      { key: "technology", label: "Technology", kind: "select", group: "device", options: [{ value: "RFID_UHF", label: "UHF (860–960 MHz)" }, { value: "RFID_HF", label: "HF 13.56 MHz" }, { value: "RFID_LF", label: "LF 125 kHz" }], required: true },
      { key: "position", label: "Position", kind: "select", group: "device", options: opt("ENTRY", "DECK", "EXIT"), required: true },
      { key: "readerId", label: "Reader ID", kind: "text", group: "device" },
    ],
  },
  NFC_READER: {
    label: "NFC reader",
    category: "Identification",
    description: "13.56 MHz card reader for driver or vehicle cards.",
    connections: ["NFC_BRIDGE", "USB", "TCP_IP", "MQTT"],
    defaultConnection: "NFC_BRIDGE",
    keyPrefix: "NFC",
    fields: [
      { key: "position", label: "Position", kind: "select", group: "device", options: opt("OPERATOR_DESK", "ENTRY", "DECK", "EXIT", "KIOSK"), required: true },
      { key: "readerId", label: "Reader ID", kind: "text", group: "device" },
    ],
  },
  QR_SCANNER: {
    label: "QR scanner",
    category: "Identification",
    description: "Scans booking or journey QR codes.",
    connections: ["USB", "SERIAL_RS232", "TCP_IP"],
    defaultConnection: "USB",
    keyPrefix: "QR",
    fields: [{ key: "mode", label: "Input mode", kind: "select", group: "device", options: [{ value: "KEYBOARD_WEDGE", label: "Keyboard wedge" }, { value: "SERIAL", label: "Serial" }], required: true }],
  },
  ANPR_CAMERA: {
    label: "ANPR camera",
    category: "Identification",
    description: "Number-plate recognition at entry or exit.",
    connections: ["SNAPSHOT", "RTSP", "HTTP_API"],
    defaultConnection: "SNAPSHOT",
    keyPrefix: "ANPR",
    fields: [
      { key: "direction", label: "Direction", kind: "select", group: "device", options: opt("ENTRY", "EXIT"), required: true },
      { key: "ocrEngine", label: "Recognition engine", kind: "select", group: "device", options: [{ value: "EASYOCR_EDGE", label: "EasyOCR on edge" }, { value: "CAMERA_ONBOARD", label: "Camera on-board (planned)" }], required: true },
      { key: "confidenceThreshold", label: "Confidence threshold (0–1)", kind: "number", group: "device", min: 0.3, max: 1 },
      { key: "plateFormat", label: "Plate format", kind: "select", group: "device", options: [{ value: "ZA", label: "South Africa" }, { value: "ANY", label: "Any alphanumeric" }] },
      { key: "captureTimeoutMs", label: "Capture timeout (ms)", kind: "number", group: "device", min: 200, max: 30000 },
      { key: "imageRetentionDays", label: "Image retention (days)", kind: "number", group: "device", min: 0, max: 3650, help: "0 = keep plate text only (POPIA-friendly)." },
    ],
  },
  CCTV_CAMERA: {
    label: "CCTV camera",
    category: "Identification",
    description: "Evidence snapshots linked to transactions. No live stream is exposed through the platform.",
    connections: ["SNAPSHOT", "RTSP", "HTTP_API"],
    defaultConnection: "SNAPSHOT",
    keyPrefix: "CCTV",
    fields: [
      { key: "view", label: "View", kind: "select", group: "device", options: opt("DECK", "ENTRY", "EXIT", "CAB", "LOAD"), required: true },
      { key: "imageRetentionDays", label: "Image retention (days)", kind: "number", group: "device", min: 0, max: 3650 },
    ],
  },
  ENTRY_GATE: {
    label: "Entry boom gate",
    category: "Access & traffic",
    description: "Barrier before the deck. Commands go through the edge controller only.",
    connections: ["DIGITAL_IO", "MODBUS_TCP", "NONE"],
    defaultConnection: "DIGITAL_IO",
    keyPrefix: "GATE_ENTRY",
    fields: gateFields(),
  },
  EXIT_GATE: {
    label: "Exit boom gate",
    category: "Access & traffic",
    description: "Barrier after the deck. Commands go through the edge controller only.",
    connections: ["DIGITAL_IO", "MODBUS_TCP", "NONE"],
    defaultConnection: "DIGITAL_IO",
    keyPrefix: "GATE_EXIT",
    fields: gateFields(),
  },
  TRAFFIC_LIGHT: {
    label: "Traffic light",
    category: "Access & traffic",
    description: "Red/amber/green driver guidance.",
    connections: ["DIGITAL_IO", "MODBUS_TCP", "NONE"],
    defaultConnection: "DIGITAL_IO",
    keyPrefix: "LIGHT",
    fields: [
      { key: "redChannel", label: "Red channel", kind: "number", group: "device", min: 0, max: 64 },
      { key: "amberChannel", label: "Amber channel", kind: "number", group: "device", min: 0, max: 64 },
      { key: "greenChannel", label: "Green channel", kind: "number", group: "device", min: 0, max: 64 },
      { key: "defaultState", label: "Default / fault state", kind: "select", group: "device", options: opt("RED"), required: true, help: "Lights always fall back to red." },
    ],
  },
  POSITION_SENSOR: {
    label: "Positioning beam / sensor",
    category: "Sensors",
    description: "Beams and loops that confirm vehicle position, deck occupancy and gate safety.",
    connections: ["DIGITAL_IO", "MODBUS_TCP", "MQTT"],
    defaultConnection: "DIGITAL_IO",
    keyPrefix: "BEAM",
    fields: [
      { key: "role", label: "Role", kind: "select", group: "device", options: [
        { value: "P1", label: "Beam P1 (front)" }, { value: "P2", label: "Beam P2 (rear)" },
        { value: "ENTRY_LOOP", label: "Entry loop" }, { value: "EXIT_LOOP", label: "Exit loop" },
        { value: "DECK_OCCUPANCY", label: "Deck occupancy" }, { value: "OBSTRUCTION", label: "Obstruction" }, { value: "GATE_SAFETY", label: "Gate safety beam" },
      ], required: true },
      { key: "activeLow", label: "Active low", kind: "boolean", group: "device" },
      { key: "debounceMs", label: "Debounce (ms)", kind: "number", group: "device", min: 0, max: 5000 },
    ],
  },
  CONTROLLER: {
    label: "I/O controller (PIC / PLC / relay)",
    category: "Control",
    description: "Drives gates, lights and reads beams. Gates fail safe if it loses contact.",
    connections: ["SERIAL_RS232", "TCP_IP", "MODBUS_TCP", "MODBUS_RTU"],
    defaultConnection: "SERIAL_RS232",
    keyPrefix: "CTRL",
    fields: [
      { key: "controllerType", label: "Controller type", kind: "select", group: "device", options: [{ value: "PIC18F45K22", label: "PIC18F45K22 (WB protocol v1)" }, { value: "PLC", label: "PLC (planned)" }, { value: "RELAY_BOARD", label: "Relay board (planned)" }], required: true },
      { key: "watchdogSeconds", label: "Watchdog (seconds)", kind: "number", group: "device", min: 1, max: 120, help: "Controller returns outputs to safe state if the edge is silent this long." },
    ],
  },
  PRINTER: {
    label: "Printer",
    category: "Output",
    description: "Waybill or receipt printer.",
    connections: ["USB", "TCP_IP", "NONE"],
    defaultConnection: "USB",
    keyPrefix: "PRINTER",
    fields: [
      { key: "printerType", label: "Printer type", kind: "select", group: "device", options: [{ value: "STANDARD", label: "Standard (browser PDF print)" }, { value: "THERMAL_ESC_POS", label: "Thermal ESC/POS (planned)" }], required: true },
      { key: "paperWidthMm", label: "Paper width (mm)", kind: "select", group: "device", options: opt("58", "80", "210") },
      { key: "copies", label: "Copies", kind: "number", group: "device", min: 1, max: 5 },
    ],
  },
  EDGE_DAEMON: {
    label: "Edge controller",
    category: "Control",
    description: "On-site computer running the site daemon: offline ledger, sync, hardware I/O.",
    connections: ["TCP_IP", "NONE"],
    defaultConnection: "NONE",
    keyPrefix: "EDGE",
    fields: [
      { key: "hostname", label: "Hostname", kind: "text", group: "device" },
      { key: "hardware", label: "Hardware", kind: "select", group: "device", options: opt("INDUSTRIAL_PC", "MINI_PC", "RASPBERRY_PI", "VM") },
    ],
  },
  KIOSK: {
    label: "Touchscreen kiosk",
    category: "Output",
    description: "Driver self-service or operator touchscreen.",
    connections: ["TCP_IP", "NONE"],
    defaultConnection: "NONE",
    keyPrefix: "KIOSK",
    fields: [{ key: "mode", label: "Mode", kind: "select", group: "device", options: opt("DRIVER_SELF_SERVICE", "OPERATOR"), required: true }],
  },
  NETWORK_DEVICE: {
    label: "Network device",
    category: "Infrastructure",
    description: "Switch, router, firewall or access point (recorded for support).",
    connections: ["NETWORK", "NONE"],
    defaultConnection: "NONE",
    keyPrefix: "NET",
    fields: [
      { key: "role", label: "Role", kind: "select", group: "device", options: opt("SWITCH", "ROUTER", "FIREWALL", "ACCESS_POINT", "LTE_BACKUP"), required: true },
      { key: "managementIp", label: "Management IP", kind: "text", group: "device" },
    ],
  },
  UPS: {
    label: "UPS",
    category: "Infrastructure",
    description: "Keeps the edge, indicator and network up through short outages.",
    connections: ["NETWORK", "USB", "NONE"],
    defaultConnection: "NONE",
    keyPrefix: "UPS",
    fields: [
      { key: "capacityVa", label: "Capacity (VA)", kind: "number", group: "device", min: 300, max: 100000 },
      { key: "runtimeMinutes", label: "Runtime at load (minutes)", kind: "number", group: "device", min: 1, max: 1440 },
    ],
  },
  BUZZER: {
    label: "Buzzer / siren",
    category: "Access & traffic",
    description: "Audible alert on the deck.",
    connections: ["DIGITAL_IO", "NONE"],
    defaultConnection: "DIGITAL_IO",
    keyPrefix: "BUZZER",
    fields: [],
  },
  OTHER: {
    label: "Other device",
    category: "Infrastructure",
    description: "Anything else worth recording against the site.",
    connections: Object.keys(CONNECTION_TYPES) as ConnectionType[],
    defaultConnection: "NONE",
    keyPrefix: "DEVICE",
    fields: [{ key: "notes", label: "Notes", kind: "text", group: "device" }],
  },
};

function gateFields(): FieldDef[] {
  return [
    { key: "pulseMs", label: "Open pulse (ms)", kind: "number", group: "device", min: 100, max: 10000 },
    { key: "autoCloseSeconds", label: "Auto-close after (seconds)", kind: "number", group: "device", min: 2, max: 300, required: true },
    { key: "openTimeoutSeconds", label: "Open confirmation timeout (seconds)", kind: "number", group: "device", min: 1, max: 60 },
    { key: "safetyBeamKey", label: "Safety beam device key", kind: "text", group: "device", help: "Gate will not close while this beam is broken." },
    { key: "faultBehaviour", label: "On controller fault", kind: "select", group: "device", options: [{ value: "HOLD_CLOSED", label: "Stay closed (default)" }, { value: "OPEN_FOR_EVACUATION", label: "Open for evacuation" }], required: true },
    { key: "manualOverride", label: "Manual override allowed for", kind: "select", group: "device", options: [{ value: "SUPERVISOR", label: "Supervisors / admins only" }, { value: "OPERATOR", label: "Operators" }], required: true },
  ];
}

export const DEVICE_CATEGORIES = ["Weighing", "Identification", "Access & traffic", "Sensors", "Control", "Output", "Infrastructure"] as const;

/** Fields visible for a device type with a given connection type (progressive disclosure). */
export function visibleFields(type: HardwareDeviceType, connection: ConnectionType | null | undefined): FieldDef[] {
  const def = DEVICE_TYPES[type];
  const conn = connection ?? def.defaultConnection;
  return [...CONNECTION_FIELDS, ...def.fields, ...COMMON_FIELDS].filter((f) => !f.connections || f.connections.includes(conn));
}

export function connectionSupport(connection: ConnectionType): Support {
  return CONNECTION_TYPES[connection].support;
}

function fieldSchema(field: FieldDef): z.ZodTypeAny {
  if (field.kind === "boolean") return z.coerce.boolean();
  if (field.kind === "number") {
    let n = z.coerce.number().finite();
    if (field.min !== undefined) n = n.min(field.min, `${field.label} must be at least ${field.min}`);
    if (field.max !== undefined) n = n.max(field.max, `${field.label} must be at most ${field.max}`);
    return n;
  }
  if (field.kind === "select" && field.options) {
    const values = field.options.map((o) => o.value) as [string, ...string[]];
    return z.enum(values, { errorMap: () => ({ message: `${field.label}: choose one of ${values.join(", ")}` }) });
  }
  return z.string().trim().max(200);
}

export type ConfigValidation =
  | { ok: true; configuration: Record<string, string | number | boolean> }
  | { ok: false; errors: string[] };

/**
 * Validates and normalises a device configuration. Unknown keys are dropped (no mass
 * assignment into the JSON column); empty optional values are omitted.
 */
export function validateDeviceConfiguration(type: HardwareDeviceType, connection: ConnectionType, raw: unknown): ConfigValidation {
  const def = DEVICE_TYPES[type];
  if (!def.connections.includes(connection)) {
    return { ok: false, errors: [`${def.label} cannot connect via ${CONNECTION_TYPES[connection].label}`] };
  }
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const errors: string[] = [];
  const configuration: Record<string, string | number | boolean> = {};
  for (const field of visibleFields(type, connection)) {
    const value = input[field.key];
    const empty = value === undefined || value === null || value === "";
    if (empty) {
      if (field.required && field.kind !== "boolean") errors.push(`${field.label} is required`);
      continue;
    }
    const parsed = fieldSchema(field).safeParse(value);
    if (!parsed.success) errors.push(parsed.error.issues[0]?.message ?? `${field.label} is invalid`);
    else configuration[field.key] = parsed.data as string | number | boolean;
  }
  if (typeof configuration.host === "string" && !/^[A-Za-z0-9.-]{1,253}$/.test(configuration.host)) {
    errors.push("IP address / hostname contains invalid characters");
  }
  return errors.length ? { ok: false, errors } : { ok: true, configuration };
}

/** Configuration-level checks that don't need the device to be reachable. */
export function staticDeviceCheck(device: {
  type: HardwareDeviceType;
  connectionType: string | null;
  configuration: unknown;
  isSimulated: boolean;
}): { status: "pass" | "warn" | "fail"; messages: string[] } {
  const messages: string[] = [];
  const connection = (device.connectionType ?? DEVICE_TYPES[device.type].defaultConnection) as ConnectionType;
  if (!(connection in CONNECTION_TYPES)) return { status: "fail", messages: [`Unknown connection type ${device.connectionType}`] };
  const validation = validateDeviceConfiguration(device.type, connection, device.configuration);
  if (!validation.ok) return { status: "fail", messages: validation.errors };
  const support = connectionSupport(connection);
  if (support === "planned") {
    messages.push(`${CONNECTION_TYPES[connection].label}: adapter not implemented yet — configuration is recorded but the device will not be driven.`);
  }
  if (device.isSimulated) messages.push("Marked as SIMULATED: the edge will refuse it in production unless simulation is explicitly allowed.");
  if (device.type === "SCALE") {
    const protocol = SCALE_PROTOCOLS.find((p) => p.value === (device.configuration as Record<string, unknown> | null)?.protocol);
    if (protocol?.value === "AVERY_WEIGHTRONIX" || protocol?.value === "RICELAKE_IQ355") {
      messages.push(`${protocol.label}: parsed by the generic ASCII parser. Validate with a live reading on site.`);
    }
  }
  return { status: support === "planned" ? "warn" : messages.length ? "warn" : "pass", messages: messages.length ? messages : ["Configuration is complete and uses an implemented adapter."] };
}
