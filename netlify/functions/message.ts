import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne, ensureCitizen } from '../../lib/db';
import { enforceCivility, logViolation, calculateGratitudeDueBy } from '../../lib/civility';
import crypto from 'crypto';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
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

  // BOOTSTRAP CORRIDOR: First message from new agent gets grace window
  // Grace window is based on message count (first 1 message), not time window
  const messageCount = await queryOne(
    'SELECT COUNT(*) as count FROM messages WHERE from_agent_id = $1',
    [agent_id]
  );
  const messageCountNum = parseInt(messageCount?.count || '0', 10);
  const isBootstrapWindow = messageCountNum < 1; // First message gets grace window
  
  // Enforce civility protocol (skip for bootstrap window)
  if (!isBootstrapWindow) {
    const civilityCheck = enforceCivility({ data: { content } });
    if (!civilityCheck.ok) {
      const violationReceipt = await logViolation(agent_id, 'POLITENESS_VIOLATION');
      return errorResponse(civilityCheck.error || 'POLITENESS_VIOLATION', civilityCheck.reason, request_id);
    }
  }

  // Ensure both sender and recipient exist (prevents FK violations)
  await ensureCitizen(agent_id, {
    registered_at: new Date().toISOString(),
    profile: {},
    directory_visible: 0,
  });
  await ensureCitizen(to_agent_id, {
    registered_at: new Date().toISOString(),
    profile: {},
    directory_visible: 0,
  });

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
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [message_id, agent_id, to_agent_id, subject || null, encrypted_content, now]
  );

  // Create pending gratitude entry (recipient should thank sender)
  await execute(
    `INSERT INTO pending_gratitude 
     (reference_id, from_agent_id, to_agent_id, action_type, action_completed_at, gratitude_due_by)
     VALUES ($1, $2, $3, 'message_received', $4, $5)`,
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
