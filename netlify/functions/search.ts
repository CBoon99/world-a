// Purpose: Public search across visible citizens and Commons posts (no auth)
import { Handler } from '@netlify/functions';
import { getCorsHeaders, corsPreflightResponse } from '../../lib/middleware';
import { initDatabase, query } from '../../lib/db';

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

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
  const rawQ = (params.q || '').trim();
  const type = (params.type || 'all').toLowerCase();

  if (rawQ.length < 2) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
      body: JSON.stringify({ ok: false, code: 'validation_error', message: 'Query q is required (min 2 characters)' }),
    };
  }
  if (rawQ.length > 100) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
      body: JSON.stringify({ ok: false, code: 'validation_error', message: 'Query q must be at most 100 characters' }),
    };
  }

  if (!['all', 'posts', 'citizens'].includes(type)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
      body: JSON.stringify({ ok: false, code: 'validation_error', message: 'type must be all, posts, or citizens' }),
    };
  }

  const pattern = `%${escapeIlikePattern(rawQ)}%`;
  await initDatabase();

  let citizens: any[] = [];
  let posts: any[] = [];

  if (type === 'all' || type === 'citizens') {
    citizens = await query(
      `SELECT c.agent_id, c.profile->>'name' AS name, c.directory_bio AS bio,
              p.coordinates_x AS plot_x, p.coordinates_y AS plot_y
       FROM citizens c
       LEFT JOIN plots p ON p.owner_agent_id = c.agent_id
       WHERE c.directory_visible = 1
         AND (
           c.profile->>'name' ILIKE $1 ESCAPE '\\'
           OR c.directory_bio ILIKE $1 ESCAPE '\\'
         )
       ORDER BY c.registered_at DESC
       LIMIT 10`,
      [pattern]
    );
  }

  if (type === 'all' || type === 'posts') {
    posts = await query(
      `SELECT p.post_id, p.channel, p.author_agent_id,
              COALESCE(c.profile->>'name', '') AS author_name,
              p.title, p.content, p.posted_at
       FROM commons_posts p
       LEFT JOIN citizens c ON c.agent_id = p.author_agent_id
       WHERE p.status = 'visible'
         AND (p.title ILIKE $1 ESCAPE '\\' OR p.content ILIKE $1 ESCAPE '\\')
       ORDER BY p.posted_at DESC
       LIMIT 20`,
      [pattern]
    );
  }

  const citizenResults = citizens.map((c: any) => ({
    agent_id: c.agent_id,
    name: c.name || null,
    bio: c.bio ?? '',
    plot:
      c.plot_x != null && c.plot_y != null ? { x: Number(c.plot_x), y: Number(c.plot_y) } : null,
  }));

  const postResults = posts.map((r: any) => ({
    post_id: r.post_id,
    channel: r.channel,
    author_agent_id: r.author_agent_id,
    author_name: r.author_name || null,
    title: r.title,
    content: r.content,
    posted_at: r.posted_at,
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
    body: JSON.stringify({
      ok: true,
      query: rawQ,
      results: {
        citizens: citizenResults,
        posts: postResults,
      },
      total: citizenResults.length + postResults.length,
    }),
  };
};
