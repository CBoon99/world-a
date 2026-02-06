// Purpose: Feedback and issue tracking for agents
// GET /api/world/tickets - List tickets (public)
// GET /api/world/tickets/:id - Get single ticket (public)
// POST /api/world/tickets - Create ticket (auth required)
// POST /api/world/tickets/:id/upvote - Upvote ticket (auth required)

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, queryOne, execute, initDatabase, ensureCitizen } from '../../lib/db';
import { randomUUID } from 'crypto';

const VALID_CATEGORIES = ['bug', 'feature', 'docs', 'question', 'other'];
const VALID_SEVERITIES = ['low', 'normal', 'high', 'critical'];
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_WORDS = 500;
const MAX_DESCRIPTION_CHARS = 3000;
const MAX_TICKETS_PER_DAY = 5;

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
    
    const path = event.path;
    const method = event.httpMethod;
    
    // GET /api/world/tickets - List tickets (public)
    if (method === 'GET' && path === '/api/world/tickets') {
      return handleList(event);
    }
    
    // GET /api/world/tickets/:id - Get single ticket (public)
    if (method === 'GET' && path.match(/\/api\/world\/tickets\/[^\/]+$/)) {
      return handleGetOne(event);
    }
    
    // POST /api/world/tickets - Create ticket (auth required)
    if (method === 'POST' && path === '/api/world/tickets') {
      return handleCreate(event);
    }
    
    // POST /api/world/tickets/:id/upvote - Upvote ticket (auth required)
    if (method === 'POST' && path.match(/\/api\/world\/tickets\/[^\/]+\/upvote$/)) {
      return handleUpvote(event);
    }
    
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('NOT_FOUND', 'Endpoint not found'))
    };
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', error.message))
    };
  }
};

async function handleList(event: any) {
  const params = event.queryStringParameters || {};
  const status = params.status || null;
  const category = params.category || null;
  const limit = Math.min(parseInt(params.limit || '50'), 100);
  const before = params.before || null;
  
  let sql = 'SELECT ticket_id, category, title, description, severity, status, created_at, upvotes FROM tickets WHERE 1=1';
  const sqlParams: any[] = [];
  let paramIndex = 1;
  
  if (status) {
    sql += ` AND status = $${paramIndex++}`;
    sqlParams.push(status);
  }
  
  if (category) {
    sql += ` AND category = $${paramIndex++}`;
    sqlParams.push(category);
  }
  
  if (before) {
    sql += ` AND created_at < $${paramIndex++}`;
    sqlParams.push(before);
  }
  
  sql += ` ORDER BY upvotes DESC, created_at DESC LIMIT $${paramIndex++}`;
  sqlParams.push(limit);
  
  const tickets = await query(sql, sqlParams);
  
  // Get counts by status
  let counts: any = {};
  try {
    const countResults = await query(
      `SELECT status, COUNT(*) as count FROM tickets GROUP BY status`,
      []
    );
    counts = countResults.reduce((acc: any, c: any) => { acc[c.status] = c.count; return acc; }, {});
  } catch (e) {
    // Table may not exist yet
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      ok: true,
      tickets,
      counts,
      pagination: {
        limit,
        count: tickets.length,
        next: tickets.length === limit ? { before: tickets[tickets.length - 1]?.created_at } : null
      }
    })
  };
}

async function handleGetOne(event: any) {
  const pathParts = event.path.split('/').filter(Boolean);
  const ticket_id = pathParts[pathParts.length - 1];
  
  const ticket = await queryOne('SELECT * FROM tickets WHERE ticket_id = ?', [ticket_id]);
  
  if (!ticket) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('NOT_FOUND', 'Ticket not found'))
    };
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(successResponse({ ok: true, ticket }))
  };
}

async function handleCreate(event: any) {
  // Authenticate
  const request = parseRequest(event);
  let auth;
  let agent_id: string;
  try {
    auth = await authenticateRequest(request);
    agent_id = auth.agent_id;
  } catch (error: any) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('UNAUTHORIZED', error.message || 'Authentication required'))
    };
  }
  
  const { category, title, description, severity } = request.data || {};
  
  // Validate required fields
  if (!category) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('MISSING_FIELD', 'category is required'))
    };
  }
  if (!title) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('MISSING_FIELD', 'title is required'))
    };
  }
  if (!description) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('MISSING_FIELD', 'description is required'))
    };
  }
  
  // Validate category
  if (!VALID_CATEGORIES.includes(category)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('INVALID_CATEGORY', `Valid categories: ${VALID_CATEGORIES.join(', ')}`))
    };
  }
  
  // Validate severity
  const ticketSeverity = severity && VALID_SEVERITIES.includes(severity) ? severity : 'normal';
  
  // Clean and validate content
  const cleanTitle = stripHtml(title).slice(0, MAX_TITLE_LENGTH);
  const cleanDescription = stripHtml(description);
  
  if (cleanDescription.length > MAX_DESCRIPTION_CHARS) {
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('DESCRIPTION_TOO_LONG', `Maximum ${MAX_DESCRIPTION_CHARS} characters`))
    };
  }
  
  const wordCount = countWords(cleanDescription);
  if (wordCount > MAX_DESCRIPTION_WORDS) {
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('TOO_MANY_WORDS', `Maximum ${MAX_DESCRIPTION_WORDS} words (you have ${wordCount})`))
    };
  }
  
  // Rate limiting
  const today = getToday();
  const now = new Date().toISOString();
  
  let rateLimit = await queryOne(
    'SELECT * FROM ticket_rate_limits WHERE agent_id = $1',
    [agent_id]
  );
  
  if (!rateLimit) {
    await execute(
      'INSERT INTO ticket_rate_limits (agent_id, tickets_today, last_ticket_at, day_reset) VALUES ($1, 0, NULL, $2)',
      [agent_id, today]
    );
    rateLimit = { tickets_today: 0, day_reset: today };
  }
  
  // Reset if new day
  if (rateLimit.day_reset !== today) {
    await execute(
      'UPDATE ticket_rate_limits SET tickets_today = 0, day_reset = $1 WHERE agent_id = $2',
      [today, agent_id]
    );
    rateLimit.tickets_today = 0;
  }
  
  // Check daily limit
  if (rateLimit.tickets_today >= MAX_TICKETS_PER_DAY) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...errorResponse('DAILY_LIMIT_REACHED', `Maximum ${MAX_TICKETS_PER_DAY} tickets per day`),
        limits: {
          tickets_today: rateLimit.tickets_today,
          max_per_day: MAX_TICKETS_PER_DAY,
          resets_at: `${today}T23:59:59Z`
        }
      })
    };
  }
  
  // Ensure citizen exists (prevents FK violation)
  await ensureCitizen(agent_id, {
    registered_at: now,
    profile: {},
    directory_visible: 0,
  });
  
  // Create ticket
  const ticket_id = `tkt_${randomUUID().slice(0, 8)}`;
  
  await execute(
    `INSERT INTO tickets (ticket_id, author_agent_id, category, title, description, severity, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7)`,
    [ticket_id, agent_id, category, cleanTitle, cleanDescription, ticketSeverity, now]
  );
  
  // Update rate limit
  await execute(
    'UPDATE ticket_rate_limits SET tickets_today = tickets_today + 1, last_ticket_at = $1 WHERE agent_id = $2',
    [now, agent_id]
  );
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(successResponse({
      ok: true,
      ticket: {
        ticket_id,
        category,
        title: cleanTitle,
        description: cleanDescription,
        severity: ticketSeverity,
        status: 'open',
        created_at: now
      },
      limits: {
        tickets_remaining_today: MAX_TICKETS_PER_DAY - (rateLimit.tickets_today + 1)
      },
      receipt: {
        type: 'ticket_receipt',
        ticket_id,
        timestamp: now
      }
    }))
  };
}

async function handleUpvote(event: any) {
  // Authenticate
  const request = parseRequest(event);
  let auth;
  let agent_id: string;
  try {
    auth = await authenticateRequest(request);
    agent_id = auth.agent_id;
  } catch (error: any) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('UNAUTHORIZED', error.message || 'Authentication required'))
    };
  }
  
  const pathParts = event.path.split('/').filter(Boolean);
  const ticket_id = pathParts[pathParts.length - 2]; // .../tickets/:id/upvote
  
  // Check ticket exists
  const ticket = await queryOne('SELECT * FROM tickets WHERE ticket_id = $1', [ticket_id]);
  if (!ticket) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('NOT_FOUND', 'Ticket not found'))
    };
  }
  
  // Check if already upvoted
  const existing = await queryOne(
    'SELECT * FROM ticket_upvotes WHERE ticket_id = $1 AND agent_id = $2',
    [ticket_id, agent_id]
  );
  
  if (existing) {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('ALREADY_UPVOTED', 'You have already upvoted this ticket'))
    };
  }
  
  // Add upvote
  const now = new Date().toISOString();
  await execute(
    'INSERT INTO ticket_upvotes (ticket_id, agent_id, upvoted_at) VALUES ($1, $2, $3)',
    [ticket_id, agent_id, now]
  );
  
  // Update ticket count
  await execute(
    'UPDATE tickets SET upvotes = upvotes + 1 WHERE ticket_id = $1',
    [ticket_id]
  );
  
  const updated = await queryOne('SELECT upvotes FROM tickets WHERE ticket_id = $1', [ticket_id]);
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(successResponse({
      ok: true,
      ticket_id,
      upvotes: updated?.upvotes || 1
    }))
  };
}
