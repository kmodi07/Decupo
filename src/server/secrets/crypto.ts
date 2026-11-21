import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";

function masterKey(): Buffer {
  const hex = process.env.SECRETS_MASTER_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("SECRETS_MASTER_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt a secret for storage. Output: v1:<iv>:<tag>:<ciphertext> (base64url). */
export function encryptSecret(plaintext: string, aad = ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(":");
}

export function decryptSecret(envelope: string, aad = ""): string {
  const [version, ivB64, tagB64, ctB64] = envelope.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) throw new Error("Malformed secret envelope");
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}
