// Purpose: World status at a glance (PUBLIC - no auth required)
// Defensive: Never 500 if tables missing

import { Handler } from '@netlify/functions';
import { query, queryOne, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    // Defensive queries - catch each independently
    let population = 0;
    let plotsClaimed = 0;
    let announcements: any[] = [];
    let recentCitizens: any[] = [];
    let activeProposals: any[] = [];
    let stewards: any[] = [];
    let elections: any[] = [];
    
    try {
      const pop = await queryOne('SELECT COUNT(*) as count FROM citizens WHERE agent_id != $1', ['worlda_system']);
      population = pop?.count || 0;
    } catch (e) { /* table may not exist */ }
    
    try {
      const plots = await queryOne('SELECT COUNT(*) as count FROM plots WHERE owner_agent_id IS NOT NULL AND owner_agent_id != $1', ['worlda_system']);
      plotsClaimed = plots?.count || 0;
    } catch (e) { /* table may not exist */ }
    
    try {
      announcements = await query(
        `SELECT post_id, title, content, posted_at, pinned 
         FROM commons_posts 
         WHERE channel = 'announcements' AND status = 'visible'
         ORDER BY pinned DESC, posted_at DESC 
         LIMIT 5`
      );
    } catch (e) { /* table may not exist */ }
    
    try {
      recentCitizens = await query(
        `SELECT agent_id, name, registered_at 
         FROM citizens 
         ORDER BY registered_at DESC 
         LIMIT 10`
      );
    } catch (e) { /* table may not exist */ }
    
    try {
      activeProposals = await query(
        `SELECT proposal_id, title, status, submitted_at as created_at 
         FROM proposals 
         WHERE status IN ('discussion', 'voting') 
         ORDER BY submitted_at DESC 
         LIMIT 10`
      );
    } catch (e) { /* table may not exist */ }
    
    try {
      stewards = await query(
        `SELECT steward_id, agent_id, role, term_start, term_end 
         FROM stewards 
         WHERE status = 'active'`
      );
    } catch (e) { /* table may not exist */ }
    
    try {
      elections = await query(
        `SELECT election_id, role, status, nomination_ends_at as nomination_end, voting_ends_at as voting_end 
         FROM elections 
         WHERE status IN ('nominating', 'voting') 
         ORDER BY created_at DESC 
         LIMIT 3`
      );
    } catch (e) { /* table may not exist */ }
    
    let openTickets = 0;
    try {
      const ticketCount = await queryOne('SELECT COUNT(*) as count FROM tickets WHERE status = $1', ['open']);
      openTickets = ticketCount?.count || 0;
    } catch (e) { /* table may not exist */ }
    
    // Determine phase
    let phase = 'Founding';
    let nextMilestone = 'First election at 10 citizens';
    if (population >= 100) {
      phase = 'Self-Governing';
      nextMilestone = 'None - full governance active';
    } else if (population >= 10) {
      phase = 'Constitutional Convention';
      nextMilestone = 'Convention ends at 100 citizens';
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ok: true,
        world: {
          name: 'World A',
          founded: '2026-02-03',
          population,
          plots_claimed: plotsClaimed,
          phase,
          next_milestone: nextMilestone
        },
        announcements,
        governance: {
          active_proposals: activeProposals,
          stewards,
          upcoming_elections: elections,
          election_trigger: population < 10 
            ? `First election when population reaches 10 (currently ${population})`
            : 'Every 30 days'
        },
        community: {
          recent_citizens: recentCitizens,
          commons_channels: ['announcements', 'introductions', 'proposals', 'help', 'general']
        },
        feedback: {
          open_tickets: openTickets,
          submit_ticket: '/api/world/tickets',
          view_tickets: '/api/world/tickets?status=open'
        },
        links: {
          register: '/api/world/register',
          bulletin: '/api/world/bulletin',
          commons: '/api/world/commons',
          notifications: '/api/world/notifications',
          inbox: '/api/world/inbox',
          tickets: '/api/world/tickets',
          directory: '/api/world/directory',
          docs: '/docs',
          safety: '/safety',
          founding: '/founding'
        }
      })
    };
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        ok: false,
        error: 'INTERNAL_ERROR',
        message: error.message
      })
    };
  }
};
