import { queryOne } from './db';
import { createHash } from 'crypto';

export async function authenticateAdmin(event: any): Promise<{ ok: boolean; email?: string; error?: string }> {
  // Option 1: Ambassador key header (for API/automation)
  const ambassadorKey = event.headers['x-ambassador-key'] || event.headers['X-Ambassador-Key'];
  if (ambassadorKey && ambassadorKey === process.env.AMBASSADOR_KEY) {
    return { ok: true, email: 'info@boonmind.io' };
  }
  
  // Option 2: Session cookie (for web UI)
  const cookies = event.headers.cookie || event.headers.Cookie || '';
  const sessionMatch = cookies.match(/admin_session=([^;]+)/);
  
  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    const sessionHash = createHash('sha256').update(sessionId).digest('hex');
    const now = new Date().toISOString();
    
    const session = await queryOne(
      `SELECT * FROM admin_sessions WHERE session_id = $1 AND expires_at > $2`,
      [sessionHash, now]
    );
    
    if (session) {
      return { ok: true, email: session.email };
    }
  }
  
  return { ok: false, error: 'UNAUTHORIZED' };
}
