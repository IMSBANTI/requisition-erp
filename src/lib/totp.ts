import crypto from "crypto";
import bcrypt from "bcryptjs";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${clean[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** Generate a 160-bit (20-byte) Base32 secret suitable for Google / Microsoft Authenticator. */
export function generateTotpSecret(numBytes = 20): string {
  return base32Encode(crypto.randomBytes(numBytes));
}

/** Generate a 6-digit RFC 6238 TOTP code for a given secret and timestamp. */
export function generateTotpCode(secretBase32: string, timestampMs = Date.now()): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);

  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return String(otp).padStart(TOTP_DIGITS, "0");
}

/** Verify a 6-digit TOTP code with ±window steps (default ±1 = ±30s clock skew tolerance). */
export function verifyTotpCode(
  secretBase32: string,
  token: string,
  timestampMs = Date.now(),
  window = 1
): boolean {
  const clean = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const targetBuf = Buffer.from(clean, "utf8");
  for (let delta = -window; delta <= window; delta++) {
    const candidate = generateTotpCode(
      secretBase32,
      timestampMs + delta * TOTP_PERIOD_SECONDS * 1000
    );
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === targetBuf.length &&
      crypto.timingSafeEqual(candidateBuf, targetBuf)
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri({
  issuer = "IMS GROUP ERP",
  accountName,
  secret,
}: {
  issuer?: string;
  accountName: string;
  secret: string;
}): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function deriveEncryptionKey(secretSource?: string): Buffer {
  const raw = secretSource || process.env.SESSION_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short for 2FA encryption");
  }
  return crypto.createHash("sha256").update(`ims-erp-2fa-v1:${raw}`).digest();
}

/** Encrypt a plaintext TOTP secret with AES-256-GCM before storing in PostgreSQL. */
export function encryptTotpSecret(plainSecret: string, secretSource?: string): string {
  const key = deriveEncryptionKey(secretSource);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainSecret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Decrypt an AES-256-GCM encrypted TOTP secret. */
export function decryptTotpSecret(encoded: string, secretSource?: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted 2FA secret format");
  }
  const key = deriveEncryptionKey(secretSource);
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

const BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes ambiguous 0/O/1/I

/** Generate N readable one-time recovery codes (format: XXXX-XXXX). */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(8);
    let raw = "";
    for (let j = 0; j < 8; j++) {
      raw += BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function normalizeBackupCode(code: string): string {
  return String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(normalizeBackupCode(c), 10)));
}

/** Match a recovery code against stored bcrypt hashes; returns matched index or -1. */
export async function matchBackupCodeIndex(
  inputCode: string,
  hashedCodes: string[]
): Promise<number> {
  const normalized = normalizeBackupCode(inputCode);
  if (normalized.length < 6) return -1;
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(normalized, hashedCodes[i])) {
      return i;
    }
  }
  return -1;
}
