import { Handler } from '@netlify/functions';
import { corsPreflightResponse, getCorsHeaders } from '../../lib/middleware';
import { execute, queryOne, initDatabase } from '../../lib/db';
import { randomBytes, createHash } from 'crypto';

const AMBASSADOR_EMAIL = 'info@boonmind.io';
const TOKEN_EXPIRY_MINUTES = 60;
const SESSION_EXPIRY_HOURS = 24;

function getCookieFromHeader(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  const raw = headers?.cookie ?? headers?.Cookie;
  if (!raw || typeof raw !== 'string') return undefined;
  const prefix = `${name}=`;
  for (const part of raw.split(';')) {
    const s = part.trim();
    if (s.startsWith(prefix)) return s.slice(prefix.length);
  }
  return undefined;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflightResponse(event);
  }

  await initDatabase();
  
  // POST /api/admin/login — Request magic link
  if (event.httpMethod === 'POST' && event.path === '/api/admin/login') {
    const { email } = JSON.parse(event.body || '{}');
    
    if (email !== AMBASSADOR_EMAIL) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED_EMAIL' })
      };
    }
    
    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
    
    // Store token
    await execute(
      `INSERT INTO admin_tokens (token_hash, email, expires_at, used)
       VALUES ($1, $2, $3, 0)`,
      [createHash('sha256').update(token).digest('hex'), email, expires]
    );
    
    // In production, send email. For now, log only in local Netlify dev.
    const loginUrl = `https://world-a.netlify.app/api/admin/login/verify?token=${token}`;
    if (process.env.NETLIFY_DEV === 'true') {
      console.log(`Magic link for ${email}: ${loginUrl}`);
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'World A <noreply@boonmind.io>',
            to: [email],
            subject: 'Your World A admin login link',
            html: `
        <p>Your magic login link for 
        World A admin:</p>
        <p><a href="${loginUrl}">
        Click here to log in</a></p>
        <p>This link expires in 
        ${TOKEN_EXPIRY_MINUTES} minutes.</p>
        <p>If you did not request this,
        ignore this email.</p>
      `,
          }),
        });
        if (!response.ok) {
          const errBody = await response.text();
          console.error('[admin-login] Resend failed', response.status, errBody);
        }
      } catch (err) {
        console.error('[admin-login] Resend error', err);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event.headers?.origin || event.headers?.Origin) },
      body: JSON.stringify({
        ok: true,
        message: 'Magic link sent to your email',
      }),
    };
  }
  
  // GET /api/admin/login/verify — Verify magic link
  if (event.httpMethod === 'GET' && event.path.includes('/verify')) {
    const now = new Date().toISOString();

    // Already logged in: idempotent verify (avoids "invalid" when revisiting used one-time link)
    const sessionCookie = getCookieFromHeader(event.headers as Record<string, string | undefined>, 'admin_session');
    if (sessionCookie) {
      const sessionHash = createHash('sha256').update(sessionCookie).digest('hex');
      const existingSession = await queryOne(
        `SELECT * FROM admin_sessions WHERE session_id = $1 AND expires_at > $2`,
        [sessionHash, now]
      );
      if (existingSession) {
        return {
          statusCode: 302,
          headers: {
            Location: '/admin/',
          } as Record<string, string>,
          body: '',
        };
      }
    }

    const token = event.queryStringParameters?.token;

    if (!token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' } as Record<string, string>,
        body: '<h1>Missing token</h1><p><a href="/admin">Try again</a></p>',
      };
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    
    const valid = await queryOne(
      `SELECT * FROM admin_tokens 
       WHERE token_hash = $1 AND expires_at > $2 AND used = 0`,
      [tokenHash, now]
    );
    
    if (!valid) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'text/html' },
        body: '<h1>Invalid or expired link</h1><p><a href="/admin">Try again</a></p>'
      };
    }
    
    // Mark token as used
    await execute(
      'UPDATE admin_tokens SET used = 1 WHERE token_hash = $1',
      [tokenHash]
    );
    
    // Create session
    const sessionId = randomBytes(32).toString('hex');
    const sessionExpires = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    
    await execute(
      `INSERT INTO admin_sessions (session_id, email, expires_at)
       VALUES ($1, $2, $3)`,
      [createHash('sha256').update(sessionId).digest('hex'), valid.email, sessionExpires]
    );
    
    // Redirect to admin with session cookie
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin/',
        'Set-Cookie': `admin_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_EXPIRY_HOURS * 3600}`
      } as Record<string, string>,
      body: ''
    };
  }
  
  return { 
    statusCode: 404, 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error: 'Not found' })
  };
};
