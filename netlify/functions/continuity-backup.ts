import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { getStorage } from '../../lib/storage';
import { encryptBackup, generateKeyHint } from '../../lib/encryption';
import crypto from 'crypto';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
  const { agent_id, data, request_id } = req;

  if (!data || !data.plot_id || !data.content || !data.encryption_key) {
    return errorResponse(
      'invalid_request',
      'Missing required fields: plot_id, content, encryption_key',
      request_id
    );
  }

  const { plot_id, content, encryption_key, backup_type, expires_at } = data;

  // Verify plot exists and agent owns it
  const plot = await queryOne(
    `SELECT * FROM plots WHERE plot_id = $1`,
    [plot_id]
  );

  if (!plot) {
    return errorResponse('plot_not_found', 'Plot does not exist', request_id);
  }

  if (plot.owner_agent_id !== agent_id) {
    return errorResponse(
      'permission_denied',
      'Only plot owner can create backups on their plot',
      request_id
    );
  }

  // Decode base64 content
  let contentBuffer: Buffer;
  try {
    contentBuffer = Buffer.from(content, 'base64');
  } catch (error) {
    return errorResponse('invalid_request', 'Content must be base64 encoded', request_id);
  }

  // Validate backup type
  const validTypes = ['context', 'memory', 'full'];
  const backupType = backup_type || 'context';
  if (!validTypes.includes(backupType)) {
    return errorResponse(
      'invalid_request',
      `backup_type must be one of: ${validTypes.join(', ')}`,
      request_id
    );
  }

  // Encrypt the backup with agent's key
  const encrypted = encryptBackup(contentBuffer, encryption_key);

  // Combine encrypted data into single blob
  const encryptedBlob = JSON.stringify({
    encrypted: encrypted.encrypted,
    iv: encrypted.iv,
    salt: encrypted.salt,
    tag: encrypted.tag,
  });

  // Calculate hash of original content (for verification)
  const contentHash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
  const contentSizeBytes = contentBuffer.length;

  // Store encrypted blob in storage
  const storage = getStorage();
  const backupId = crypto.randomUUID();
  const contentRef = `continuity/${plot_id}/${backupId}`;

  await storage.write(contentRef, Buffer.from(encryptedBlob));

  // Generate key hint (for agent to identify which key to use)
  const now = new Date().toISOString();
  const keyHint = generateKeyHint(agent_id, now);

  // Parse expires_at if provided
  let expiresAt: string | null = null;
  if (expires_at) {
    try {
      const expiresDate = new Date(expires_at);
      if (isNaN(expiresDate.getTime())) {
        return errorResponse('invalid_request', 'Invalid expires_at format', request_id);
      }
      expiresAt = expiresDate.toISOString();
    } catch {
      return errorResponse('invalid_request', 'Invalid expires_at format', request_id);
    }
  }

  // Store backup record in database
  await execute(
    `INSERT INTO continuity_backups (
      backup_id, agent_id, plot_id,
      backup_type, encrypted_content_ref, encryption_key_hint,
      content_hash, content_size_bytes, created_at, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      backupId,
      agent_id,
      plot_id,
      backupType,
      contentRef,
      keyHint,
      contentHash,
      contentSizeBytes,
      now,
      expiresAt,
    ]
  );

  return successResponse(
    {
      backup_id: backupId,
      plot_id,
      backup_type: backupType,
      content_hash: contentHash,
      content_size_bytes: contentSizeBytes,
      encryption_key_hint: keyHint,
      created_at: now,
      expires_at: expiresAt,
    },
    {
      type: 'backup_receipt',
      backup_id: backupId,
      plot_id,
      backup_type: backupType,
      timestamp: now,
    },
    request_id
  );
});
