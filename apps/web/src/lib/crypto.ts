import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET ?? "development-secret-change-before-production";
  return createHash("sha256").update(secret).digest();
}

export function hashValue(value: string): string {
  const pepper = process.env.PASSWORD_PEPPER ?? process.env.AUTH_SECRET ?? "development-pepper-change-before-production";
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export function encryptSensitive(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptSensitive(value: string): string {
  const packed = Buffer.from(value, "base64url");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((item) => `${JSON.stringify(item)}:${stableStringify(object[item])}`).join(",")}}`;
}
