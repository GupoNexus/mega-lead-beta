import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type Envelope = { v: number; iv: string; tag: string; data: string };

function keyForVersion(version: number) {
  const raw = process.env[`TOKEN_ENCRYPTION_KEY_V${version}`] || (version === 1 ? process.env.TOKEN_ENCRYPTION_KEY : undefined);
  if (!raw) throw new Error(`TOKEN_ENCRYPTION_KEY_V${version} não configurada no backend`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`TOKEN_ENCRYPTION_KEY_V${version} deve conter 32 bytes em base64`);
  return key;
}

export function activeEncryptionVersion() {
  const version = Number(process.env.TOKEN_ENCRYPTION_ACTIVE_VERSION || "1");
  if (!Number.isInteger(version) || version < 1) throw new Error("TOKEN_ENCRYPTION_ACTIVE_VERSION inválida");
  return version;
}

export function encryptSecret(plain: string, version = activeEncryptionVersion()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyForVersion(version), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const envelope: Envelope = { v: version, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
  return `mlsec:${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
}

export function decryptSecret(value: string) {
  if (!value.startsWith("mlsec:")) throw new Error("Segredo legado não criptografado; reconecte o canal");
  const envelope = JSON.parse(Buffer.from(value.slice(6), "base64url").toString("utf8")) as Envelope;
  const decipher = createDecipheriv("aes-256-gcm", keyForVersion(envelope.v), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8");
}

export function rotateSecret(value: string) {
  return encryptSecret(decryptSecret(value), activeEncryptionVersion());
}
