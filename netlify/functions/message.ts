import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { enforceCivility, logViolation, calculateGratitudeDueBy } from '../../lib/civility';
import crypto from 'crypto';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, data, request_id } = req;

  const { to_agent_id, subject, content, encryption_key } = data || {};
  if (!to_agent_id) {
    return errorResponse('invalid_request', 'to_agent_id required', request_id);
  }
  if (!content) {
    return errorResponse('invalid_request', 'content required', request_id);
  }
  if (!encryption_key) {
    return errorResponse('invalid_request', 'encryption_key required', request_id);
  }

  // Enforce civility protocol
  const civilityCheck = enforceCivility({ data: { content } });
  if (!civilityCheck.ok) {
    const violationReceipt = await logViolation(agent_id, 'POLITENESS_VIOLATION');
    return errorResponse(civilityCheck.error || 'POLITENESS_VIOLATION', civilityCheck.reason, request_id);
  }

  // Verify recipient exists
  const recipient = await queryOne('SELECT * FROM citizens WHERE agent_id = ?', [to_agent_id]);
  if (!recipient) {
    return errorResponse('not_found', 'Recipient not found', request_id);
  }

  // Encrypt content (simple encryption - sender's key)
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(encryption_key, 'base64').slice(0, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(content, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  const encrypted_content = JSON.stringify({
    iv: iv.toString('base64'),
    content: encrypted,
    tag: authTag.toString('base64'),
  });

  const message_id = `msg_${crypto.randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO messages (message_id, from_agent_id, to_agent_id, subject, encrypted_content, sent_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [message_id, agent_id, to_agent_id, subject || null, encrypted_content, now]
  );

  // Create pending gratitude entry (recipient should thank sender)
  await execute(
    `INSERT INTO pending_gratitude 
     (reference_id, from_agent_id, to_agent_id, action_type, action_completed_at, gratitude_due_by)
     VALUES (?, ?, ?, 'message_received', ?, ?)`,
    [message_id, to_agent_id, agent_id, now, calculateGratitudeDueBy(now)]
  );

  return successResponse({
    message_id,
    to_agent_id,
    sent_at: now,
  }, {
    type: 'message_sent',
    message_id,
    from_agent_id: agent_id,
    to_agent_id,
    timestamp: now,
  }, request_id);
});
