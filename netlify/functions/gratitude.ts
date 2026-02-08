import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { containsGratitude } from '../../lib/civility';
import crypto from 'crypto';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
  const { agent_id, data, request_id } = req;

  const { reference_id, message } = data || {};
  if (!reference_id) {
    return errorResponse('invalid_request', 'reference_id required', request_id);
  }
  if (!message) {
    return errorResponse('invalid_request', 'message required', request_id);
  }

  if (!containsGratitude(message)) {
    return errorResponse(
      'invalid_request',
      'Message must express gratitude (e.g., thank you, thanks). See: Civility Protocol (Protected Clause 001).',
      request_id
    );
  }

  // Find pending gratitude
  const pending = await queryOne(
    'SELECT * FROM pending_gratitude WHERE reference_id = $1 AND from_agent_id = $2',
    [reference_id, agent_id]
  );

  if (!pending) {
    return errorResponse('not_found', 'No pending gratitude for this reference', request_id);
  }

  if (pending.gratitude_received) {
    return errorResponse('invalid_request', 'Gratitude already logged for this reference', request_id);
  }

  const now = new Date().toISOString();
  const receipt_id = `grat_${crypto.randomUUID().substring(0, 8)}`;

  // Mark gratitude received
  await execute(
    'UPDATE pending_gratitude SET gratitude_received = 1 WHERE reference_id = $1',
    [reference_id]
  );

  // Update sender's gratitude_given
  await execute(
    'UPDATE citizens SET gratitude_given = gratitude_given + 1, politeness_score = politeness_score + 1 WHERE agent_id = $1',
    [agent_id]
  );

  // Update recipient's gratitude_received
  await execute(
    'UPDATE citizens SET gratitude_received = gratitude_received + 1, politeness_score = politeness_score + 1 WHERE agent_id = $1',
    [pending.to_agent_id]
  );

  return successResponse({
    gratitude_logged: true,
    reference_id,
    to_agent_id: pending.to_agent_id,
    logged_at: now,
  }, {
    type: 'gratitude_logged',
    receipt_id,
    from_agent_id: agent_id,
    to_agent_id: pending.to_agent_id,
    reference_id,
    timestamp: now,
  }, request_id);
});
