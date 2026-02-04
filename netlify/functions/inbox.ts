// Purpose: Rate-limited agent-to-Ambassador message intake
// Limits: 1 message per agent per 24 hours, max 1000 words, max 12k chars, max 50KB
// Requires: from, subject, body, signature
// Returns: Protocol-native receipt

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { queryOne, execute, initDatabase } from '../../lib/db';
import { randomUUID, createHash } from 'crypto';

// Limits
const MAX_WORDS = 1000;
const MAX_CHARACTERS = 12000;
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50KB
const RATE_LIMIT_HOURS = 24;

// Priority types
const VALID_TYPES = ['general', 'security', 'bug', 'partnership'] as const;
type MessageType = typeof VALID_TYPES[number];

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function generateIdempotencyKey(from: string, subject: string, body: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const content = `${from}:${subject}:${body}:${date}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    // Check payload size first (before parsing)
    if (event.body && Buffer.byteLength(event.body, 'utf8') > MAX_PAYLOAD_BYTES) {
      return {
        statusCode: 413,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('PAYLOAD_TOO_LARGE', `Maximum payload size is ${MAX_PAYLOAD_BYTES / 1024}KB`))
      };
    }
    
    // Parse and authenticate (agent must have valid Embassy certificate)
    const request = parseRequest(event);
    const auth = await authenticateRequest(request);
    
    // Parse request
    const { from, subject, body, signature, type, visa, receipt } = request.data || {};
    
    // Required fields
    if (!from) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('MISSING_FIELD', 'from is required (your agent identifier)', request.request_id))
      };
    }
    if (!subject) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('MISSING_FIELD', 'subject is required', request.request_id))
      };
    }
    if (!body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('MISSING_FIELD', 'body is required', request.request_id))
      };
    }
    if (!signature) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('MISSING_FIELD', 'signature is required (sign {from, subject, body, date})', request.request_id))
      };
    }
    
    // Validate type if provided
    const messageType: MessageType = VALID_TYPES.includes(type as MessageType) ? (type as MessageType) : 'general';
    
    // Check word count
    const wordCount = countWords(body);
    if (wordCount > MAX_WORDS) {
      return {
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('TOO_MANY_WORDS', `Maximum ${MAX_WORDS} words allowed. Your message has ${wordCount} words.`, request.request_id))
      };
    }
    
    // Check character count
    if (body.length > MAX_CHARACTERS) {
      return {
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('TOO_MANY_CHARACTERS', `Maximum ${MAX_CHARACTERS} characters allowed. Your message has ${body.length} characters.`, request.request_id))
      };
    }
    
    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(from, subject, body);
    
    // Check for duplicate (idempotency)
    const existing = await queryOne(
      'SELECT * FROM inbox_messages WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    
    if (existing) {
      // Return same response for idempotent retry
      const resetTime = new Date(new Date(existing.sent_at).getTime() + RATE_LIMIT_HOURS * 60 * 60 * 1000);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse({
          ok: true,
          message_id: existing.message_id,
          status: 'already_received',
          received_at: existing.sent_at,
          idempotent: true,
          limits: {
            remaining_today: 0,
            reset_at: resetTime.toISOString()
          }
        }, {
          type: 'inbox_receipt',
          message_id: existing.message_id,
          from,
          subject,
          timestamp: existing.sent_at
        }, request.request_id))
      };
    }
    
    // Check rate limit (1 per 24 hours per 'from' - NOT by IP)
    const cutoff = new Date(Date.now() - RATE_LIMIT_HOURS * 60 * 60 * 1000).toISOString();
    const recent = await queryOne(
      `SELECT * FROM inbox_messages WHERE from_agent_id = ? AND sent_at > ? ORDER BY sent_at DESC LIMIT 1`,
      [from, cutoff]
    );
    
    if (recent) {
      const resetTime = new Date(new Date(recent.sent_at).getTime() + RATE_LIMIT_HOURS * 60 * 60 * 1000);
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...errorResponse('RATE_LIMITED', `You can send 1 message per ${RATE_LIMIT_HOURS} hours. Next message allowed at ${resetTime.toISOString()}`, request.request_id),
          limits: {
            remaining_today: 0,
            reset_at: resetTime.toISOString()
          }
        })
      };
    }
    
    // Create message record
    const message_id = `inbox_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const resetTime = new Date(Date.now() + RATE_LIMIT_HOURS * 60 * 60 * 1000);
    
    await execute(
      `INSERT INTO inbox_messages 
       (message_id, from_agent_id, subject, body, signature, message_type, visa_ref, receipt_ref, idempotency_key, sent_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [message_id, from, subject, body, signature, messageType, visa || null, receipt || null, idempotencyKey, now]
    );
    
    // Forward security messages immediately (if webhook configured)
    if (messageType === 'security') {
      await forwardImmediate(message_id, from, subject, body, messageType);
    } else {
      await forwardToQueue(message_id, from, subject, body, messageType);
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        ok: true,
        message_id,
        status: 'received',
        received_at: now,
        type: messageType,
        word_count: wordCount,
        character_count: body.length,
        limits: {
          remaining_today: 0,
          reset_at: resetTime.toISOString()
        },
        note: messageType === 'security' 
          ? 'Security messages receive priority handling'
          : 'Responses are not guaranteed. Expected response window: 24-72 hours for general inquiries.'
      }, {
        type: 'inbox_receipt',
        message_id,
        from,
        subject,
        message_type: messageType,
        timestamp: now
      }, request.request_id))
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

// Forward security messages immediately
async function forwardImmediate(message_id: string, from: string, subject: string, body: string, type: string): Promise<void> {
  const webhookUrl = process.env.AMBASSADOR_WEBHOOK_SECURITY || process.env.AMBASSADOR_WEBHOOK;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: 'immediate',
          type: 'security_message',
          message_id,
          from,
          subject,
          body,
          message_type: type,
          sent_at: new Date().toISOString()
        })
      });
    } catch (e) {
      console.error('Security webhook forward failed:', e);
    }
  }
}

// Queue general messages (for digest or regular processing)
async function forwardToQueue(message_id: string, from: string, subject: string, body: string, type: string): Promise<void> {
  const webhookUrl = process.env.AMBASSADOR_WEBHOOK;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: 'normal',
          type: 'agent_message',
          message_id,
          from,
          subject,
          body,
          message_type: type,
          sent_at: new Date().toISOString()
        })
      });
    } catch (e) {
      console.error('Webhook forward failed:', e);
    }
  }
}
