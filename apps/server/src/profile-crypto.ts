import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const PREFIX = "enc:v1:";
const secret = process.env.PROFILE_ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me";
const key = scryptSync(secret, "tunnel-gate/profile-config/v1", 32);

export function encryptProfileConfig(config: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  return PREFIX + payload.toString("base64");
}

export function decryptProfileConfig(value: string): unknown {
  if (!value.startsWith(PREFIX)) throw new Error("VPN profile configuration is not encrypted");
  const payload = Buffer.from(value.slice(PREFIX.length), "base64");
  if (payload.length < 29) throw new Error("Invalid encrypted VPN profile configuration");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
  } catch {
    throw new Error("Unable to decrypt VPN profile configuration; check PROFILE_ENCRYPTION_KEY");
  }
}
