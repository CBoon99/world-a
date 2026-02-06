import { Handler } from '@netlify/functions';
import { authenticateAdmin } from '../../lib/admin-auth';
import { query, queryOne, execute, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  await initDatabase();
  
  const auth = await authenticateAdmin(event);
  if (!auth.ok) {
    return { 
      statusCode: 401, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }) 
    };
  }
  
  // GET — List inbox messages
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const status = params.status || 'pending';
    const limit = Math.min(parseInt(params.limit || '50'), 100);
    
    const messages = await query(
      `SELECT * FROM inbox_messages 
       WHERE status = $1 
       ORDER BY sent_at DESC 
       LIMIT $2`,
      [status, limit]
    );
    
    const counts = await query(
      `SELECT status, COUNT(*) as count FROM inbox_messages GROUP BY status`,
      []
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        messages: messages || [],
        counts: (counts || []).reduce((acc: any, c: any) => { 
          acc[c.status] = parseInt(c.count || '0'); 
          return acc; 
        }, {})
      })
    };
  }
  
  // POST — Respond to message
  if (event.httpMethod === 'POST') {
    const { message_id, status, response } = JSON.parse(event.body || '{}');
    
    if (!message_id) {
      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'MISSING_MESSAGE_ID' }) 
      };
    }
    
    const now = new Date().toISOString();
    
    await execute(
      `UPDATE inbox_messages 
       SET status = $1, response = $2, response_at = $3
       WHERE message_id = $4`,
      [status || 'responded', response || null, now, message_id]
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, message_id, status: status || 'responded', responded_at: now })
    };
  }
  
  return { 
    statusCode: 405, 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error: 'Method not allowed' })
  };
};
