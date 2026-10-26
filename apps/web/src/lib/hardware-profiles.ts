import type { HardwareDeviceType, OperatingTier } from "@prisma/client";
import type { ConnectionType } from "@/lib/hardware-catalog";

export type ProfileDevice = {
  type: HardwareDeviceType;
  deviceKey: string;
  name: string;
  laneNumber?: number | null;
  connectionType: ConnectionType;
  configuration?: Record<string, string | number | boolean>;
};

export type HardwareProfileDef = { id: string; name: string; description: string; tier: OperatingTier; devices: ProfileDevice[]; builtIn: true };

/**
 * Starting points for a new site. Applying a template only creates device rows with
 * sensible defaults; addresses, ports and channels are then filled in per site.
 */
export const BUILT_IN_PROFILES: HardwareProfileDef[] = [
  {
    id: "builtin-manual",
    name: "Manual weighbridge",
    description: "Indicator read through the operator PC (USB/serial), desk printer, optional NFC card reader.",
    tier: "MANUAL",
    builtIn: true,
    devices: [
      { type: "SCALE", deviceKey: "SCALE_PRIMARY", name: "Weighbridge indicator", laneNumber: 1, connectionType: "WEB_SERIAL", configuration: { protocol: "METTLER_TOLEDO_CONTINUOUS", unit: "kg", baudRate: "9600", dataBits: "7", parity: "even", stopBits: "1", requireStable: true, maxCapacityKg: 80000 } },
      { type: "PRINTER", deviceKey: "PRINTER_DESK", name: "Office printer", connectionType: "USB", configuration: { printerType: "STANDARD", paperWidthMm: "210", copies: 3 } },
    ],
  },
  {
    id: "builtin-semi",
    name: "Standard semi-automatic",
    description: "Edge controller, indicator, RFID at the deck, P1/P2 beams, traffic lights, printer, optional boom gate.",
    tier: "SEMI_AUTOMATIC",
    builtIn: true,
    devices: [
      { type: "EDGE_DAEMON", deviceKey: "EDGE_CONTROLLER", name: "Edge controller", connectionType: "NONE", configuration: { hardware: "INDUSTRIAL_PC", heartbeatSeconds: 30 } },
      { type: "CONTROLLER", deviceKey: "CTRL_MAIN", name: "Lane I/O controller", connectionType: "SERIAL_RS232", configuration: { controllerType: "PIC18F45K22", comPort: "/dev/ttyUSB0", baudRate: "115200", watchdogSeconds: 5 } },
      { type: "SCALE", deviceKey: "SCALE_PRIMARY", name: "Weighbridge indicator", laneNumber: 1, connectionType: "SERIAL_RS232", configuration: { protocol: "PIC_CONTROLLER", unit: "kg", baudRate: "9600", requireStable: true, maxCapacityKg: 80000 } },
      { type: "RFID_READER", deviceKey: "RFID_DECK", name: "Deck RFID reader", laneNumber: 1, connectionType: "TCP_IP", configuration: { technology: "RFID_UHF", position: "DECK", port: 6000 } },
      { type: "POSITION_SENSOR", deviceKey: "BEAM_P1", name: "Positioning beam P1", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { role: "P1", controllerKey: "CTRL_MAIN", channel: 1, debounceMs: 200 } },
      { type: "POSITION_SENSOR", deviceKey: "BEAM_P2", name: "Positioning beam P2", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { role: "P2", controllerKey: "CTRL_MAIN", channel: 2, debounceMs: 200 } },
      { type: "TRAFFIC_LIGHT", deviceKey: "LIGHT_DECK", name: "Deck traffic light", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { controllerKey: "CTRL_MAIN", channel: 10, redChannel: 10, greenChannel: 11, defaultState: "RED" } },
      { type: "PRINTER", deviceKey: "PRINTER_DESK", name: "Ticket printer", connectionType: "USB", configuration: { printerType: "STANDARD", copies: 3 } },
    ],
  },
  {
    id: "builtin-full",
    name: "Fully automatic lane",
    description: "Everything in semi-automatic plus ANPR, entry/exit boom gates with safety beams, kiosk and UPS.",
    tier: "FULLY_AUTOMATIC",
    builtIn: true,
    devices: [
      { type: "EDGE_DAEMON", deviceKey: "EDGE_CONTROLLER", name: "Edge controller", connectionType: "NONE", configuration: { hardware: "INDUSTRIAL_PC", heartbeatSeconds: 30 } },
      { type: "CONTROLLER", deviceKey: "CTRL_MAIN", name: "Lane I/O controller", connectionType: "SERIAL_RS232", configuration: { controllerType: "PIC18F45K22", comPort: "/dev/ttyUSB0", baudRate: "115200", watchdogSeconds: 5 } },
      { type: "SCALE", deviceKey: "SCALE_PRIMARY", name: "Weighbridge indicator", laneNumber: 1, connectionType: "SERIAL_RS232", configuration: { protocol: "PIC_CONTROLLER", unit: "kg", baudRate: "9600", requireStable: true, maxCapacityKg: 80000 } },
      { type: "RFID_READER", deviceKey: "RFID_ENTRY", name: "Entry RFID reader", laneNumber: 1, connectionType: "TCP_IP", configuration: { technology: "RFID_UHF", position: "ENTRY", port: 6000 } },
      { type: "ANPR_CAMERA", deviceKey: "ANPR_ENTRY", name: "Entry ANPR camera", laneNumber: 1, connectionType: "SNAPSHOT", configuration: { direction: "ENTRY", ocrEngine: "EASYOCR_EDGE", confidenceThreshold: 0.75, plateFormat: "ZA", imageRetentionDays: 30 } },
      { type: "POSITION_SENSOR", deviceKey: "BEAM_P1", name: "Positioning beam P1", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { role: "P1", controllerKey: "CTRL_MAIN", channel: 1, debounceMs: 200 } },
      { type: "POSITION_SENSOR", deviceKey: "BEAM_P2", name: "Positioning beam P2", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { role: "P2", controllerKey: "CTRL_MAIN", channel: 2, debounceMs: 200 } },
      { type: "POSITION_SENSOR", deviceKey: "BEAM_GATE_SAFETY", name: "Gate safety beam", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { role: "GATE_SAFETY", controllerKey: "CTRL_MAIN", channel: 3, debounceMs: 100 } },
      { type: "ENTRY_GATE", deviceKey: "GATE_ENTRY", name: "Entry boom gate", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { controllerKey: "CTRL_MAIN", channel: 20, pulseMs: 1500, autoCloseSeconds: 8, openTimeoutSeconds: 5, safetyBeamKey: "BEAM_GATE_SAFETY", faultBehaviour: "HOLD_CLOSED", manualOverride: "SUPERVISOR" } },
      { type: "EXIT_GATE", deviceKey: "GATE_EXIT", name: "Exit boom gate", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { controllerKey: "CTRL_MAIN", channel: 21, pulseMs: 1500, autoCloseSeconds: 8, openTimeoutSeconds: 5, safetyBeamKey: "BEAM_GATE_SAFETY", faultBehaviour: "HOLD_CLOSED", manualOverride: "SUPERVISOR" } },
      { type: "TRAFFIC_LIGHT", deviceKey: "LIGHT_DECK", name: "Deck traffic light", laneNumber: 1, connectionType: "DIGITAL_IO", configuration: { controllerKey: "CTRL_MAIN", channel: 10, redChannel: 10, greenChannel: 11, defaultState: "RED" } },
      { type: "KIOSK", deviceKey: "KIOSK_DRIVER", name: "Driver kiosk", laneNumber: 1, connectionType: "NONE", configuration: { mode: "DRIVER_SELF_SERVICE" } },
      { type: "PRINTER", deviceKey: "PRINTER_KIOSK", name: "Kiosk ticket printer", laneNumber: 1, connectionType: "USB", configuration: { printerType: "STANDARD", copies: 2 } },
      { type: "UPS", deviceKey: "UPS_MAIN", name: "Lane UPS", connectionType: "NONE", configuration: { capacityVa: 3000, runtimeMinutes: 30 } },
    ],
  },
];
