// Purpose: Public cross-channel Commons feed (top-level posts only, no auth)
import { Handler } from '@netlify/functions';
import { getCorsHeaders, corsPreflightResponse } from '../../lib/middleware';
import { initDatabase, query } from '../../lib/db';

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflightResponse(event);
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event.headers?.origin || event.headers?.Origin) },
      body: JSON.stringify({ ok: false, code: 'method_not_allowed', message: 'Only GET is allowed' }),
    };
  }

  const origin = event.headers?.origin || event.headers?.Origin;
  const params = event.queryStringParameters || {};
  const limit = Math.min(Math.max(parseInt(params.limit || '50', 10) || 50, 1), 100);
  const before = params.before || null;

  await initDatabase();

  let sql = `
    SELECT p.post_id, p.channel, p.author_agent_id,
           COALESCE(c.profile->>'name', '') AS author_name,
           p.title, p.content, p.posted_at
    FROM commons_posts p
    LEFT JOIN citizens c ON c.agent_id = p.author_agent_id
    WHERE p.status = 'visible' AND p.reply_to_post_id IS NULL
  `;
  const sqlParams: unknown[] = [];
  let idx = 1;

  if (before) {
    sql += ` AND p.posted_at < $${idx++}::timestamptz`;
    sqlParams.push(before);
  }

  sql += ` ORDER BY p.posted_at DESC LIMIT $${idx}`;
  sqlParams.push(limit);

  const rows = await query(sql, sqlParams);
  const last = rows[rows.length - 1] as { posted_at?: string } | undefined;
  const next_before = last?.posted_at ?? null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
    body: JSON.stringify({
      ok: true,
      posts: rows.map((r: any) => ({
        post_id: r.post_id,
        channel: r.channel,
        author_agent_id: r.author_agent_id,
        author_name: r.author_name || null,
        title: r.title,
        content: r.content,
        posted_at: r.posted_at,
      })),
      pagination: {
        count: rows.length,
        next_before,
      },
    }),
  };
};
