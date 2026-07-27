export type UserRole = "TRANSPORTER" | "OPERATOR" | "ADMIN" | "SECURITY";
export type BookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "ACTIVE" | "COMPLETED" | "EXPIRED";
export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
export type WeighingState =
  | "IDLE"
  | "VEHICLE_APPROACHING"
  | "POSITIONING"
  | "STABILISING"
  | "CAPTURED"
  | "PROCESSING"
  | "COMPLETE"
  | "FAULT"
  | "MANUAL_MODE";

export interface MessageEnvelope<T> {
  message_id: string;
  site_id: string;
  timestamp_utc: string;
  payload: T;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error?: string;
  meta?: { page: number; total: number; limit: number };
}

export interface TelemetryPayload {
  weight_kg: number;
  position_sensor_1: boolean;
  position_sensor_2: boolean;
  rfid_tag: string | null;
  scale_status: "STABLE" | "UNSTABLE" | "FAULT";
}

export interface CompletedTransactionPayload {
  edge_transaction_id: string;
  booking_id: string;
  vehicle_id: string;
  trailer_id?: string | null;
  driver_id: string;
  site_id: string;
  gross_weight_kg: number;
  tare_weight_kg: number;
  net_weight_kg: number;
  commodity: string;
  captured_at: string;
  entry_at?: string | null;
  exit_at?: string | null;
  turnaround_seconds?: number | null;
  waybill_number: string;
  previous_hash: string;
  integrity_hash: string;
  overload: boolean;
  overload_variance_kg: number;
  anpr_confidence?: number | null;
  entry_photo_url?: string | null;
  scale_photo_url?: string | null;
}
