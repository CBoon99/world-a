// Purpose: Ambassador views incoming messages
// Auth: Special — requires AMBASSADOR_KEY header
// This is for YOU to read messages, not for agents

import { Handler } from '@netlify/functions';
import { query, queryOne, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    // Ambassador authentication (simple key check)
    const ambassadorKey = event.headers['x-ambassador-key'];
    if (ambassadorKey !== process.env.AMBASSADOR_KEY) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED', message: 'Invalid Ambassador key' })
      };
    }
    
    const params = event.queryStringParameters || {};
    const status = params.status || 'pending'; // pending, read, responded, archived
    const limit = Math.min(parseInt(params.limit || '50'), 100);
    const offset = parseInt(params.offset || '0');
    
    const messages = await query(
      `SELECT * FROM inbox_messages 
       WHERE status = $1 
       ORDER BY sent_at DESC 
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    
    const total = await queryOne(
      'SELECT COUNT(*) as count FROM inbox_messages WHERE status = $1',
      [status]
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        messages,
        pagination: {
          total: (total as any)?.count || 0,
          limit,
          offset,
          has_more: offset + messages.length < ((total as any)?.count || 0)
        }
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
