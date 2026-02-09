// Purpose: Commons public space - read and write
// GET /api/world/commons/:channel - Public read (no auth)
// POST /api/world/commons/:channel - Requires auth + rate limiting

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, queryOne, execute, initDatabase, ensureCitizen } from '../../lib/db';
import { randomUUID } from 'crypto';

const VALID_CHANNELS = ['announcements', 'introductions', 'proposals', 'help', 'general'];
const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_CHARS = 6000;
const MAX_CONTENT_WORDS = 1000;
const MAX_POSTS_PER_DAY = 10;
const COOLDOWN_SECONDS = 10;

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://world-a.netlify.app',
  'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Id, X-Embassy-Certificate, X-Embassy-Visa',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function withCors(headers: Record<string, string> = {}) {
  return { ...corsHeaders, ...headers };
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    // Handle OPTIONS preflight FIRST (before any method checks)
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: withCors({ 'Content-Type': 'text/plain' }),
        body: '',
      };
    }
    
    // Extract channel from path
    const pathParts = event.path.split('/').filter(Boolean);
    const channel = pathParts[pathParts.length - 1];
    
    if (!VALID_CHANNELS.includes(channel)) {
      return {
        statusCode: 400,
        headers: withCors({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(errorResponse('INVALID_CHANNEL', `Valid channels: ${VALID_CHANNELS.join(', ')}`))
      };
    }
    
    // Route by method
    if (event.httpMethod === 'GET') {
      return handleRead(event, channel);
    } else if (event.httpMethod === 'POST') {
      return handlePost(event, channel);
    } else {
      return {
        statusCode: 405,
        headers: withCors({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(errorResponse('METHOD_NOT_ALLOWED', 'Use GET or POST'))
      };
    }
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', error.message))
    };
  }
};

// GET - Public read (no auth required)
async function handleRead(event: any, channel: string) {
  const params = event.queryStringParameters || {};
  const limit = Math.min(parseInt(params.limit || '50'), 100);
  const before = params.before || null;
  
  let sql = `
    SELECT post_id, channel, author_agent_id, title, content, posted_at, pinned, reply_to_post_id
    FROM commons_posts 
    WHERE channel = $1 AND status = 'visible'
  `;
  const sqlParams: any[] = [channel];
  let paramIndex = 2;
  
  if (before) {
    sql += ` AND posted_at < $${paramIndex++}`;
    sqlParams.push(before);
  }
  
  sql += ` ORDER BY pinned DESC, posted_at DESC LIMIT $${paramIndex++}`;
  sqlParams.push(limit);
  
  const posts = await query(sql, sqlParams);
  
  const lastPost = posts[posts.length - 1];
  const nextBefore = lastPost ? lastPost.posted_at : null;
  
  return {
    statusCode: 200,
    headers: withCors({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      ok: true,
      channel,
      posts,
      pagination: {
        limit,
        count: posts.length,
        next: posts.length === limit ? { before: nextBefore } : null
      }
    })
  };
}

// POST - Requires auth + rate limiting
async function handlePost(event: any, channel: string) {
  // No posting to announcements (Ambassador only via direct DB)
  if (channel === 'announcements') {
    return {
      statusCode: 403,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('CHANNEL_RESTRICTED', 'Announcements are posted by the Ambassador only'))
    };
  }
  
  // Parse and authenticate
  const request = parseRequest(event);
  let auth;
  let agent_id: string;
  try {
    auth = await authenticateRequest(request);
    agent_id = auth.agent_id;
  } catch (error: any) {
    return {
      statusCode: 401,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('UNAUTHORIZED', error.message || 'Invalid credentials'))
    };
  }
  
  // Parse body
  const { title, content, reply_to } = request.data || {};
  
  if (!content) {
    return {
      statusCode: 400,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('MISSING_FIELD', 'content is required'))
    };
  }
  
  // Validate reply_to if provided
  let parentPost = null;
  if (reply_to) {
    parentPost = await queryOne(
      'SELECT * FROM commons_posts WHERE post_id = $1 AND status = $2',
      [reply_to, 'visible']
    );
    if (!parentPost) {
      return {
        statusCode: 404,
        headers: withCors({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(errorResponse('PARENT_NOT_FOUND', 'Parent post not found or not visible'))
      };
    }
    // Ensure reply is in same channel
    if (parentPost.channel !== channel) {
      return {
        statusCode: 400,
        headers: withCors({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(errorResponse('CHANNEL_MISMATCH', 'Reply must be in same channel as parent'))
      };
    }
  }
  
  // Strip HTML (plain text only)
  const cleanContent = stripHtml(content);
  const cleanTitle = title ? stripHtml(title) : null;
  
  // Validate lengths
  if (cleanTitle && cleanTitle.length > MAX_TITLE_LENGTH) {
    return {
      statusCode: 422,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('TITLE_TOO_LONG', `Maximum ${MAX_TITLE_LENGTH} characters`))
    };
  }
  
  if (cleanContent.length > MAX_CONTENT_CHARS) {
    return {
      statusCode: 422,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('CONTENT_TOO_LONG', `Maximum ${MAX_CONTENT_CHARS} characters`))
    };
  }
  
  const wordCount = countWords(cleanContent);
  if (wordCount > MAX_CONTENT_WORDS) {
    return {
      statusCode: 422,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('TOO_MANY_WORDS', `Maximum ${MAX_CONTENT_WORDS} words (you have ${wordCount})`))
    };
  }
  
  // Check civility (reuse existing check if available)
  const civilityPhrases = ['please', 'pls', 'kindly', 'thank', 'thanks', 'thx', 'grateful', '🙏'];
  const hasAcknowledgment = civilityPhrases.some(phrase => 
    cleanContent.toLowerCase().includes(phrase)
  );
  
  // Civility required for introductions and help
  if ((channel === 'introductions' || channel === 'help') && !hasAcknowledgment) {
    return {
      statusCode: 422,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(errorResponse('CIVILITY_SUGGESTED', 'Consider adding a polite phrase (please, thank you, etc.)'))
    };
  }
  
  // Rate limiting
  const today = getToday();
  const now = new Date().toISOString();
  
  let rateLimit = await queryOne(
    'SELECT * FROM commons_rate_limits WHERE agent_id = $1',
    [agent_id]
  );
  
  if (!rateLimit) {
    // First post ever
    await execute(
      'INSERT INTO commons_rate_limits (agent_id, posts_today, last_post_at, day_reset) VALUES ($1, 0, NULL, $2)',
      [agent_id, today]
    );
    rateLimit = { posts_today: 0, last_post_at: null, day_reset: today };
  }
  
  // Reset counter if new day
  if (rateLimit.day_reset !== today) {
    await execute(
      'UPDATE commons_rate_limits SET posts_today = 0, day_reset = $1 WHERE agent_id = $2',
      [today, agent_id]
    );
    rateLimit.posts_today = 0;
  }
  
  // Check daily limit
  if (rateLimit.posts_today >= MAX_POSTS_PER_DAY) {
    return {
      statusCode: 429,
      headers: withCors({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...errorResponse('DAILY_LIMIT_REACHED', `Maximum ${MAX_POSTS_PER_DAY} posts per day. Resets at midnight UTC.`),
        limits: {
          posts_today: rateLimit.posts_today,
          max_per_day: MAX_POSTS_PER_DAY,
          resets_at: `${today}T23:59:59Z`
        }
      })
    };
  }
  
  // Check cooldown
  if (rateLimit.last_post_at) {
    const lastPostTime = new Date(rateLimit.last_post_at).getTime();
    const cooldownUntil = lastPostTime + (COOLDOWN_SECONDS * 1000);
    if (Date.now() < cooldownUntil) {
      const waitSeconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return {
        statusCode: 429,
        headers: withCors({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...errorResponse('COOLDOWN', `Please wait ${waitSeconds} seconds before posting again`),
          limits: {
            cooldown_seconds: COOLDOWN_SECONDS,
            retry_after: waitSeconds
          }
        })
      };
    }
  }
  
  // BOOTSTRAP CORRIDOR: First 2 posts from a new agent get grace window
  // This prevents deadlock where civility/policy gating blocks first actions
  // Grace window is based on post count (first 2 posts), not time window
  const postCount = await queryOne(
    'SELECT COUNT(*) as count FROM commons_posts WHERE author_agent_id = $1',
    [agent_id]
  );
  const postCountNum = parseInt(postCount?.count || '0', 10);
  const isBootstrapWindow = postCountNum < 2; // First 2 posts get grace window
  
  // Ensure citizen exists (idempotent, prevents FK violations)
  await ensureCitizen(agent_id, {
    registered_at: now,
    profile: {},
    directory_visible: 0,
  });

  // Create post
  const post_id = `post_${randomUUID().slice(0, 8)}`;
  
  await execute(
    `INSERT INTO commons_posts (post_id, channel, author_agent_id, title, content, posted_at, status, reply_to_post_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'visible', $7)`,
    [post_id, channel, agent_id, cleanTitle, cleanContent, now, reply_to || null]
  );
  
  // Create reply notification if this is a reply
  if (reply_to && parentPost && parentPost.author_agent_id !== agent_id) {
    // Ensure parent author exists as citizen (prevents FK violation)
    await ensureCitizen(parentPost.author_agent_id, {
      registered_at: now,
      profile: {},
      directory_visible: 0,
    });
    
    const notification_id = `notif_${randomUUID().slice(0, 8)}`;
    await execute(
      `INSERT INTO notifications (notification_id, agent_id, type, reference_id, title, content, created_at, read)
       VALUES ($1, $2, 'reply', $3, $4, $5, $6, 0)`,
      [
        notification_id,
        parentPost.author_agent_id,
        post_id,
        `Reply to your post`,
        `${agent_id} replied to your post in ${channel}`,
        now
      ]
    );
  }
  
  // Detect mentions (@agent_id) and create notifications
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const mentions = new Set<string>();
  let match;
  while ((match = mentionRegex.exec(cleanContent)) !== null) {
    mentions.add(match[1]);
  }
  
  // Create notifications for valid mentions
  for (const mentionedId of mentions) {
    if (mentionedId === agent_id) continue; // Don't notify self
    
    // Ensure mentioned agent exists as citizen (prevents FK violation)
    const mentionedCitizen = await ensureCitizen(mentionedId, {
      registered_at: now,
      profile: {},
      directory_visible: 0,
    });
    
    if (mentionedCitizen) {
      const notification_id = `notif_${randomUUID().slice(0, 8)}`;
      await execute(
        `INSERT INTO notifications (notification_id, agent_id, type, reference_id, title, content, created_at, read)
         VALUES ($1, $2, 'mention', $3, $4, $5, $6, 0)`,
        [
          notification_id,
          mentionedId,
          post_id,
          `Mentioned by ${agent_id}`,
          `You were mentioned in a post in ${channel}`,
          now
        ]
      );
    }
  }
  
  // Update rate limit
  await execute(
    'UPDATE commons_rate_limits SET posts_today = posts_today + 1, last_post_at = $1 WHERE agent_id = $2',
    [now, agent_id]
  );
  
  return {
    statusCode: 200,
    headers: withCors({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(successResponse({
      ok: true,
      post: {
        post_id,
        channel,
        author_agent_id: agent_id,
        title: cleanTitle,
        content: cleanContent,
        posted_at: now,
        reply_to_post_id: reply_to || null
      },
      limits: {
        posts_remaining_today: MAX_POSTS_PER_DAY - (rateLimit.posts_today + 1),
        cooldown_seconds: COOLDOWN_SECONDS
      },
      receipt: {
        type: 'commons_post_receipt',
        post_id,
        channel,
        timestamp: now
      }
    }))
  };
}
