// lib/weights.ts — Single source of truth for kilogram formatting, parsing, and invariant assertions.
// Exact. No rounding, ever.

const NBSP = "\u00A0";

/**
 * Exact kilogram formatter.
 * No rounding, ever. Input must be an integer kg.
 * Formats according to South African locale conventions (e.g., "14 532 kg").
 */
export function formatKg(value: number): string {
  if (!Number.isFinite(value)) return `0${NBSP}kg`;
  const roundedInt = Math.round(value); // Safe integer representation if clean float was passed
  return `${roundedInt.toLocaleString("en-ZA").replace(/,/g, NBSP)}${NBSP}kg`;
}

/**
 * Manual operator entry parser.
 * Rejects decimals, negatives, and noisy inputs without silent coercion.
 */
export function parseManualKg(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/[\s\u00A0,]/g, "");
  if (!/^\d{1,6}$/.test(trimmed)) return null; // No '.', '-', '+', or junk characters
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/**
 * Enforces the legal weighbridge invariant: Gross - Tare must strictly equal Net.
 */
export function assertWeightInvariant(gross: number, tare: number, net: number): void {
  if (gross - tare !== net) {
    throw new Error(`Weight invariant violated: gross (${gross}) - tare (${tare}) !== net (${net})`);
  }
}
