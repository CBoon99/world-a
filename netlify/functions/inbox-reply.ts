// Purpose: Ambassador replies to an agent message
// Auth: Requires AMBASSADOR_KEY
// Creates a response the agent can retrieve

import { Handler } from '@netlify/functions';
import { queryOne, execute, initDatabase } from '../../lib/db';
import { randomUUID } from 'crypto';

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    // Ambassador authentication
    const ambassadorKey = event.headers['x-ambassador-key'];
    if (ambassadorKey !== process.env.AMBASSADOR_KEY) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED' })
      };
    }
    
    // Get message ID from path
    const pathMatch = event.path.match(/\/inbox\/([^\/]+)\/reply/);
    const message_id = pathMatch ? pathMatch[1] : null;
    if (!message_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'MISSING_MESSAGE_ID' })
      };
    }
    
    // Get original message
    const original = await queryOne(
      'SELECT * FROM inbox_messages WHERE message_id = ?',
      [message_id]
    );
    if (!original) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'NOT_FOUND' })
      };
    }
    
    // Parse reply
    const body = JSON.parse(event.body || '{}');
    const { response } = body;
    if (!response) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'MISSING_RESPONSE' })
      };
    }
    
    const now = new Date().toISOString();
    const reply_id = `reply_${randomUUID().slice(0, 8)}`;
    
    // Store reply and mark original as responded
    await execute(
      `UPDATE inbox_messages 
       SET status = 'responded', response = ?, response_at = ?, reply_id = ?
       WHERE message_id = ?`,
      [response, now, reply_id, message_id]
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        reply_id,
        message_id,
        to_agent_id: original.from_agent_id,
        responded_at: now,
        status: 'sent'
      })
    };
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'INTERNAL_ERROR', message: error.message })
    };
  }
};
