"use node";
/**
 * convex/ai/encryption.ts
 *
 * AES-GCM encryption helpers for BYOK API keys.
 * Marked "use node" because Convex's V8 isolate does not expose
 * `node:crypto`. Only files that themselves opt into Node ("use node")
 * may import from this module.
 *
 * V8-safe siblings — ProviderId / detectProvider / keyHint — live in
 * `./encryptionTypes`. Re-exported below for backwards compatibility so
 * any pre-existing `import { ProviderId } from "./encryption"` continues
 * to compile (TS type imports are erased and won't pull this file into
 * the V8 bundle).
 *
 * Env var: AI_KEYS_ENCRYPTION_KEY — 32-byte base64-encoded secret.
 * Generate once: `openssl rand -base64 32`
 *
 * Wire format: base64(iv[12] || ciphertext || authTag[16])
 *
 * NEVER called from browser context — only from convex/ai/keys.ts (write)
 * and convex/ai/processChat.ts (read).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Backward-compat re-exports — see file header.
export { detectProvider, keyHint, type ProviderId } from "./encryptionTypes";

function getEncryptionKey(): Buffer {
	const raw = process.env.AI_KEYS_ENCRYPTION_KEY;
	if (!raw) throw new Error("AI_KEYS_ENCRYPTION_KEY env var is not set");
	const buf = Buffer.from(raw, "base64");
	if (buf.length !== 32)
		throw new Error("AI_KEYS_ENCRYPTION_KEY must be 32 bytes (base64 of 32 raw bytes)");
	return buf;
}

/**
 * Encrypts a plaintext API key.
 * Returns base64(iv || ciphertext || authTag).
 */
export function encryptApiKey(plaintext: string): string {
	const key = getEncryptionKey();
	const iv = randomBytes(12); // 96-bit IV — recommended for GCM
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag(); // 16-byte GCM auth tag
	return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

/**
 * Decrypts an API key produced by encryptApiKey.
 * Throws on tampered ciphertext (tag mismatch).
 */
export function decryptApiKey(payload: string): string {
	const key = getEncryptionKey();
	const buf = Buffer.from(payload, "base64");
	if (buf.length < 28) throw new Error("Invalid encrypted key payload — too short");
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(buf.length - 16);
	const ciphertext = buf.subarray(12, buf.length - 16);
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return decipher.update(ciphertext) + decipher.final("utf8");
}
