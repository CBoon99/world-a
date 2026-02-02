import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne } from '../../lib/db';
import { getStorage } from '../../lib/storage';
import { decryptBackup } from '../../lib/encryption';
import crypto from 'crypto';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, data, request_id } = req;

  if (!data || !data.backup_id || !data.encryption_key) {
    return errorResponse(
      'invalid_request',
      'Missing required fields: backup_id, encryption_key',
      request_id
    );
  }

  const { backup_id, encryption_key } = data;

  // Get backup record
  const backup = await queryOne(
    `SELECT * FROM continuity_backups WHERE backup_id = ?`,
    [backup_id]
  );

  if (!backup) {
    return errorResponse('backup_not_found', 'Backup does not exist', request_id);
  }

  // Verify agent owns this backup
  if (backup.agent_id !== agent_id) {
    return errorResponse(
      'permission_denied',
      'Only the backup owner can restore their backup',
      request_id
    );
  }

  // Check if backup has expired
  if (backup.expires_at) {
    const expiresAt = new Date(backup.expires_at);
    const now = new Date();
    if (now > expiresAt) {
      return errorResponse(
        'backup_expired',
        'This backup has expired',
        request_id
      );
    }
  }

  // Read encrypted blob from storage
  const storage = getStorage();
  const encryptedBlob = await storage.read(backup.encrypted_content_ref);

  if (!encryptedBlob) {
    return errorResponse(
      'storage_error',
      'Backup content not found in storage',
      request_id
    );
  }

  // Parse encrypted data
  let encryptedData: any;
  try {
    encryptedData = JSON.parse(encryptedBlob.toString());
  } catch (error) {
    return errorResponse(
      'decryption_error',
      'Invalid backup format',
      request_id
    );
  }

  // Decrypt with agent's key
  let decryptedContent: Buffer;
  try {
    decryptedContent = decryptBackup(encryptedData, encryption_key);
  } catch (error: any) {
    return errorResponse(
      'decryption_error',
      `Decryption failed: ${error.message}. Invalid encryption key.`,
      request_id
    );
  }

  // Verify content hash
  const contentHash = crypto
    .createHash('sha256')
    .update(decryptedContent)
    .digest('hex');

  if (contentHash !== backup.content_hash) {
    return errorResponse(
      'integrity_error',
      'Backup content hash mismatch - data may be corrupted',
      request_id
    );
  }

  // Return decrypted content (base64 encoded)
  const contentBase64 = decryptedContent.toString('base64');

  return successResponse(
    {
      backup_id,
      plot_id: backup.plot_id,
      backup_type: backup.backup_type,
      content: contentBase64,
      content_hash: backup.content_hash,
      content_size_bytes: backup.content_size_bytes,
      created_at: backup.created_at,
      expires_at: backup.expires_at,
    },
    {
      type: 'restore_receipt',
      backup_id,
      timestamp: new Date().toISOString(),
    },
    request_id
  );
});
