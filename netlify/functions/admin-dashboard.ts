import { Handler } from '@netlify/functions';
import { authenticateAdmin } from '../../lib/admin-auth';
import { query, queryOne, initDatabase } from '../../lib/db';

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
  
  // Gather metrics
  const [
    citizenCount,
    plotCount,
    postCount,
    inboxCount,
    ticketCount,
    proposalCount,
    recentCitizens,
    recentInbox,
    recentTickets
  ] = await Promise.all([
    queryOne('SELECT COUNT(*) as count FROM citizens'),
    queryOne('SELECT COUNT(*) as count FROM plots WHERE owner_agent_id IS NOT NULL'),
    queryOne('SELECT COUNT(*) as count FROM commons_posts'),
    queryOne('SELECT COUNT(*) as count FROM inbox_messages WHERE status = ?', ['pending']),
    queryOne('SELECT COUNT(*) as count FROM tickets WHERE status = ?', ['open']),
    queryOne('SELECT COUNT(*) as count FROM proposals WHERE status = ?', ['active']),
    query('SELECT agent_id, profile, registered_at FROM citizens ORDER BY registered_at DESC LIMIT 10'),
    query('SELECT * FROM inbox_messages ORDER BY sent_at DESC LIMIT 10'),
    query('SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC LIMIT 10', ['open'])
  ]);
  
  // Parse profile JSON for citizens
  const citizensWithNames = (recentCitizens || []).map((c: any) => {
    let name = null;
    if (c.profile) {
      try {
        const profile = typeof c.profile === 'string' ? JSON.parse(c.profile) : c.profile;
        name = profile.name || null;
      } catch (e) {
        // Invalid JSON, ignore
      }
    }
    return {
      agent_id: c.agent_id,
      name: name,
      registered_at: c.registered_at
    };
  });
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      metrics: {
        citizens: parseInt(citizenCount?.count || '0'),
        plots_claimed: parseInt(plotCount?.count || '0'),
        commons_posts: parseInt(postCount?.count || '0'),
        pending_inbox: parseInt(inboxCount?.count || '0'),
        open_tickets: parseInt(ticketCount?.count || '0'),
        active_proposals: parseInt(proposalCount?.count || '0')
      },
      recent: {
        citizens: citizensWithNames,
        inbox: recentInbox || [],
        tickets: recentTickets || []
      },
      timestamp: new Date().toISOString()
    })
  };
};
