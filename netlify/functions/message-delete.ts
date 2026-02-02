import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';

// Initialize database on module load
initDatabase();

export const handler: Handler = async (event, context) => {
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Extract message_id from path
    const pathMatch = event.path.match(/\/message\/([^\/]+)/);
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

    // Verify requester is sender or recipient
    const isSender = message.from_agent_id === authReq.agent_id;
    const isRecipient = message.to_agent_id === authReq.agent_id;

    if (!isSender && !isRecipient) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', 'Only sender or recipient can delete message', request.request_id)),
      };
    }

    const now = new Date().toISOString();
    let updateField: string;
    let deletedBy: string;

    if (isSender) {
      updateField = 'deleted_by_sender';
      deletedBy = 'sender';
    } else {
      updateField = 'deleted_by_recipient';
      deletedBy = 'recipient';
    }

    // Soft delete
    await execute(
      `UPDATE messages SET ${updateField} = 1 WHERE message_id = ?`,
      [message_id]
    );

    // Check if both deleted (can optionally hard delete here)
    const updated = await queryOne(
      'SELECT * FROM messages WHERE message_id = ?',
      [message_id]
    );

    const updatedMessage = updated as any;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        message_id,
        deleted_by: deletedBy,
        deleted_at: now,
        both_deleted: updatedMessage.deleted_by_sender && updatedMessage.deleted_by_recipient,
      }, {
        type: 'message_deleted',
        message_id,
        deleted_by: deletedBy,
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
