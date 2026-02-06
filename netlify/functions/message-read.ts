import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { calculateGratitudeDueBy } from '../../lib/civility';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Extract message_id from path
    const pathMatch = event.path.match(/\/message\/([^\/]+)\/read/);
    const message_id = pathMatch ? pathMatch[1] : null;

    if (!message_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'message_id required', request.request_id)),
      };
    }

    // Get message
    const message = await queryOne(
      'SELECT * FROM messages WHERE message_id = ?',
      [message_id]
    );

    if (!message) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('not_found', 'Message not found', request.request_id)),
      };
    }

    // Verify requester is recipient
    if (message.to_agent_id !== authReq.agent_id) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', 'Only recipient can mark message as read', request.request_id)),
      };
    }

    // Check if already read
    if (message.read_at) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse({
          message_id,
          already_read: true,
          read_at: message.read_at,
        }, undefined, request.request_id)),
      };
    }

    const now = new Date().toISOString();

    // Mark as read
    await execute(
      'UPDATE messages SET read_at = ? WHERE message_id = ?',
      [now, message_id]
    );

    // Create pending gratitude entry (recipient should thank sender)
    await execute(
      `INSERT INTO pending_gratitude 
       (reference_id, from_agent_id, to_agent_id, action_type, action_completed_at, gratitude_due_by)
       VALUES (?, ?, ?, 'message_received', ?, ?)`,
      [message_id, message.to_agent_id, message.from_agent_id, now, calculateGratitudeDueBy(now)]
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        message_id,
        read_at: now,
      }, {
        type: 'message_read',
        message_id,
        reader_agent_id: authReq.agent_id,
        sender_agent_id: message.from_agent_id,
        timestamp: now,
      }, request.request_id)),
    };
  } catch (error: any) {
    return {
      statusCode: error.message?.startsWith('AGENT_ONLY') ? 403 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
