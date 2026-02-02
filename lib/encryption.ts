/**
 * Encryption utilities for continuity backups
 * Agent-controlled encryption - Embassy cannot read contents
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encrypt data with agent's key
 * Returns: encrypted data + IV + salt + auth tag (all base64 encoded)
 */
export function encryptBackup(
  data: Buffer,
  agentKey: string
): { encrypted: string; iv: string; salt: string; tag: string } {
  // Generate random IV and salt
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive key from agent key + salt
  const key = crypto.pbkdf2Sync(agentKey, salt, 100000, KEY_LENGTH, 'sha256');

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Get auth tag
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt data with agent's key
 */
export function decryptBackup(
  encryptedData: { encrypted: string; iv: string; salt: string; tag: string },
  agentKey: string
): Buffer {
  // Decode base64
  const encrypted = Buffer.from(encryptedData.encrypted, 'base64');
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const tag = Buffer.from(encryptedData.tag, 'base64');

  // Derive key from agent key + salt
  const key = crypto.pbkdf2Sync(agentKey, salt, 100000, KEY_LENGTH, 'sha256');

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  // Decrypt
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted;
}

/**
 * Generate encryption key hint (for agent to locate their key)
 * This is a hash that the agent can use to identify which key to use
 */
export function generateKeyHint(agentId: string, timestamp: string): string {
  return crypto
    .createHash('sha256')
    .update(`${agentId}:${timestamp}`)
    .digest('hex')
    .substring(0, 32);
}
