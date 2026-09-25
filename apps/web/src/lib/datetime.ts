/**
 * South African Timezone (SAST: UTC+2 / Africa/Johannesburg) Formatting Utilities
 */

export const SA_TIMEZONE = "Africa/Johannesburg";
export const SA_LOCALE = "en-ZA";

/**
 * Format a Date to South African date string (YYYY-MM-DD)
 */
export function formatSADate(date: Date | string | number | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  // Use Intl with parts to guarantee YYYY-MM-DD in Africa/Johannesburg timezone
  const formatter = new Intl.DateTimeFormat(SA_LOCALE, {
    timeZone: SA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }
  return formatter.format(d).replace(/\//g, "-");
}

/**
 * Format a Date to South African time string (HH:mm:ss or HH:mm)
 */
export function formatSATime(
  date: Date | string | number | null | undefined,
  includeSeconds = true
): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(SA_LOCALE, {
    timeZone: SA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(d);
}

/**
 * Format a Date to full South African date & time string (YYYY-MM-DD HH:mm:ss)
 */
export function formatSADateTime(
  date: Date | string | number | null | undefined,
  includeSeconds = true
): string {
  if (!date) return "—";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  return `${formatSADate(d)} ${formatSATime(d, includeSeconds)}`;
}

/**
 * Nullable versions for API outputs
 */
export function formatSADateNullable(date: Date | string | number | null | undefined): string | null {
  if (!date) return null;
  const res = formatSADate(date);
  return res === "—" ? null : res;
}

export function formatSATimeNullable(
  date: Date | string | number | null | undefined,
  includeSeconds = true
): string | null {
  if (!date) return null;
  const res = formatSATime(date, includeSeconds);
  return res === "—" ? null : res;
}

/**
 * Parse a date input string (e.g. "2026-09-25") as the start of day in South Africa (00:00:00.000+02:00)
 */
export function parseSAStartOfDay(dateStr: string): Date {
  if (dateStr.includes("T")) return new Date(dateStr);
  return new Date(`${dateStr}T00:00:00.000+02:00`);
}

/**
 * Parse a date input string (e.g. "2026-09-25") as the end of day in South Africa (23:59:59.999+02:00)
 */
export function parseSAEndOfDay(dateStr: string): Date {
  if (dateStr.includes("T")) return new Date(dateStr);
  return new Date(`${dateStr}T23:59:59.999+02:00`);
}
