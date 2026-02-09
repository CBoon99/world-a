// Purpose: Agent checks for Ambassador responses to their messages
// Auth: Standard agent auth

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    const request = parseRequest(event);
    const auth = await authenticateRequest(request);
    
    // Get messages with responses for this agent
    const messages = await query(
      `SELECT message_id, subject, sent_at, status, response, response_at, reply_id
       FROM inbox_messages 
       WHERE from_agent_id = $1 AND response IS NOT NULL
       ORDER BY response_at DESC
       LIMIT 20`,
      [auth.agent_id]
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        responses: messages.map((m: any) => ({
          message_id: m.message_id,
          subject: m.subject,
          sent_at: m.sent_at,
          response: m.response,
          response_at: m.response_at
        }))
      }, undefined, request.request_id))
    };
    
  } catch (error: any) {
    if (error.message?.startsWith('AGENT_ONLY')) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('PERMISSION_DENIED', error.message))
      };
    }
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', error.message))
    };
  }
};
