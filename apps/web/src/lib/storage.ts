import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal swappable storage abstraction for service-order attachments.
 *
 * This local-disk implementation is deliberately the ONLY one wired up right
 * now — it's what let this feature be verified end-to-end (real upload/
 * download round trip) against the local Docker environment, since no
 * external blob provider credentials are available in this environment.
 *
 * IMPORTANT for production on Vercel: Vercel's serverless functions have an
 * ephemeral, effectively read-only filesystem outside /tmp — files written
 * here will NOT persist or be shared across invocations in that environment.
 * Before deploying this feature to Vercel, replace saveFile/getFile with a
 * real blob store (Vercel Blob is the natural fit — same platform, no new
 * vendor signup, works from serverless functions). The storageKey scheme
 * (opaque string) and the two function signatures below are intentionally
 * provider-agnostic so that swap only touches this one file.
 */
const STORAGE_ROOT = process.env.ATTACHMENT_STORAGE_PATH ?? path.join(process.cwd(), ".attachments");

export async function saveFile(buffer: Buffer, extension: string): Promise<string> {
  await mkdir(STORAGE_ROOT, { recursive: true });
  const key = `${randomUUID()}${extension}`;
  await writeFile(path.join(STORAGE_ROOT, key), buffer);
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  return readFile(path.join(STORAGE_ROOT, key));
}
