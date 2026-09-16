import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Prisma } from "@prisma/client";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Site UUID and site code are interchangeable identifiers throughout the API, but
 * `id` is a `@db.Uuid` column: Postgres rejects casting a non-UUID string (e.g. a
 * site code) to compare it, which fails the whole OR — even the `code` branch that
 * would have matched. Only include the `id` branch when the value is actually a UUID.
 */
export function siteIdentifierWhere(identifier: string): Prisma.SiteWhereInput {
  return UUID_PATTERN.test(identifier) ? { OR: [{ id: identifier }, { code: identifier }] } : { code: identifier };
}

export function normalisePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export { formatKg } from "./weights";

export function parsePagination(url: URL): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  return { page, limit, skip: (page - 1) * limit };
}

/** Use as `select: safeUserSelect` on any User relation include — never spread a full User row (passwordHash) into a client-facing response. */
export const safeUserSelect = { id: true, firstName: true, lastName: true, email: true } as const;
