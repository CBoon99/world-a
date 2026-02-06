import { Handler } from '@netlify/functions';
import { execute, queryOne, initDatabase } from '../../lib/db';
import { randomBytes, createHash } from 'crypto';

const AMBASSADOR_EMAIL = 'info@boonmind.io';
const TOKEN_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_HOURS = 24;

export const handler: Handler = async (event) => {
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
    
    // In production, send email. For now, log it.
    const loginUrl = `https://world-a.netlify.app/api/admin/login/verify?token=${token}`;
    console.log(`Magic link for ${email}: ${loginUrl}`);
    
    // TODO: Send actual email via SendGrid/Resend/etc
    // For now, also return in response (REMOVE IN PRODUCTION)
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ok: true, 
        message: 'Magic link sent to your email',
        // REMOVE THIS IN PRODUCTION:
        _dev_link: loginUrl
      })
    };
  }
  
  // GET /api/admin/login/verify — Verify magic link
  if (event.httpMethod === 'GET' && event.path.includes('/verify')) {
    const token = event.queryStringParameters?.token;
    
    if (!token) {
      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'text/html' } as Record<string, string>,
        body: '<h1>Missing token</h1><p><a href="/admin">Try again</a></p>'
      };
    }
    
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    
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
        'Location': '/admin',
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
