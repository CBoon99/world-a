import { Handler } from '@netlify/functions';
import { authenticateAdmin } from '../../lib/admin-auth';
import { execute, initDatabase } from '../../lib/db';
import { randomUUID } from 'crypto';

export const handler: Handler = async (event) => {
  await initDatabase();
  
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }
  
  const auth = await authenticateAdmin(event);
  if (!auth.ok) {
    return { 
      statusCode: 401, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }) 
    };
  }
  
  const { title, content, pinned } = JSON.parse(event.body || '{}');
  
  if (!title || !content) {
    return { 
      statusCode: 400, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'MISSING_FIELDS' }) 
    };
  }
  
  const post_id = `ann_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  
  await execute(
    `INSERT INTO commons_posts 
     (post_id, channel, author_agent_id, title, content, posted_at, pinned, status)
     VALUES (?, 'announcements', 'system', ?, ?, ?, ?, 'visible')`,
    [post_id, title, content, now, pinned ? 1 : 0]
  );
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      announcement: { post_id, title, posted_at: now, pinned: !!pinned }
    })
  };
};
