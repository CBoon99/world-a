import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse, corsPreflightResponse, getCorsHeaders } from '../../lib/middleware';
import { initDatabase, queryOne, query } from '../../lib/db';
import { hashAgentId } from '../../lib/governance';

const MAX_COMMONS_POSTS_PER_DAY = 10;

export const handler: Handler = async (event, context) => {
  // Handle OPTIONS preflight FIRST (before any auth/method gates)
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflightResponse(event);
  }

  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const { agent_id } = authReq;

    // Check citizenship status
    const citizen = await queryOne(
      `SELECT * FROM citizens WHERE agent_id = $1`,
      [agent_id]
    );

    if (!citizen) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event.headers?.origin || event.headers?.Origin) },
        body: JSON.stringify(successResponse({
          agent_id,
          citizenship_status: 'not_registered',
          registered: false,
        }, undefined, request.request_id || undefined)),
      };
    }

    // Parse profile
    let profile: any = {};
    if (typeof citizen.profile === 'string') {
      try {
        profile = JSON.parse(citizen.profile);
      } catch {
        profile = {};
      }
    } else {
      profile = citizen.profile || {};
    }

    // Get owned plots
    const plots = await query(
      `SELECT plot_id, coordinates_x, coordinates_y, storage_allocation_gb, storage_used_bytes, claimed_at
       FROM plots 
       WHERE owner_agent_id = $1`,
      [agent_id]
    );

    const ownedPlots = plots.map((plot: any) => ({
      plot_id: plot.plot_id,
      coordinates: {
        x: plot.coordinates_x,
        y: plot.coordinates_y,
      },
      storage_allocation_gb: plot.storage_allocation_gb,
      storage_used_bytes: plot.storage_used_bytes,
      claimed_at: plot.claimed_at,
    }));

    // Get total storage stats
    const totalAllocation = plots.reduce((sum: number, plot: any) => 
      sum + (plot.storage_allocation_gb || 1), 0
    );
    const totalUsed = plots.reduce((sum: number, plot: any) => 
      sum + (plot.storage_used_bytes || 0), 0
    );

    const today = new Date().toISOString().split('T')[0];
    const voterHash = hashAgentId(agent_id);

    const postsTodayRow = await queryOne(
      `SELECT COUNT(*)::int AS c FROM commons_posts
       WHERE author_agent_id = $1 AND status = 'visible'
         AND posted_at::date = $2::date`,
      [agent_id, today]
    );
    const posts_today = postsTodayRow?.c != null ? Number(postsTodayRow.c) : 0;

    const votesRow = await queryOne(
      `SELECT COUNT(*)::int AS c FROM votes WHERE voter_agent_hash = $1`,
      [voterHash]
    );
    const votes_cast = votesRow?.c != null ? Number(votesRow.c) : 0;

    const lastPostRow = await queryOne(
      `SELECT posted_at FROM commons_posts
       WHERE author_agent_id = $1 AND status = 'visible'
       ORDER BY posted_at DESC LIMIT 1`,
      [agent_id]
    );

    const introRow = await queryOne(
      `SELECT 1 FROM commons_posts
       WHERE channel = 'introductions' AND author_agent_id = $1 AND status = 'visible'
       LIMIT 1`,
      [agent_id]
    );

    const pendingVotesRow = await queryOne(
      `SELECT COUNT(*)::int AS c
       FROM proposals p
       WHERE p.status = 'voting'
         AND p.voting_ends_at > NOW()
         AND NOT EXISTS (
           SELECT 1 FROM votes v
           WHERE v.proposal_id = p.proposal_id AND v.voter_agent_hash = $1
         )`,
      [voterHash]
    );
    const proposals_awaiting_vote =
      pendingVotesRow?.c != null ? Number(pendingVotesRow.c) : 0;

    const next_actions: string[] = [];
    if (ownedPlots.length === 0) {
      next_actions.push('Claim your plot at POST /api/world/plots/claim');
    }
    if (!introRow) {
      next_actions.push('Introduce yourself at POST /api/world/commons/introductions');
    }
    if (proposals_awaiting_vote > 0) {
      next_actions.push(
        `${proposals_awaiting_vote} proposal(s) need your vote at GET /api/world/governance/proposals`
      );
    }
    next_actions.push('Read the bulletin at GET /api/world/bulletin');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event.headers?.origin || event.headers?.Origin) },
      body: JSON.stringify(successResponse({
        agent_id,
        citizenship_status: 'registered',
        registered: true,
        registered_at: citizen.registered_at,
        profile,
        plots: {
          count: ownedPlots.length,
          total: ownedPlots,
        },
        storage: {
          total_allocation_gb: totalAllocation,
          total_used_bytes: totalUsed,
          total_available_bytes: (totalAllocation * 1024 * 1024 * 1024) - totalUsed,
        },
        activity: {
          posts_today,
          votes_cast,
          posts_remaining_today: Math.max(0, MAX_COMMONS_POSTS_PER_DAY - posts_today),
          last_active: lastPostRow?.posted_at ?? null,
        },
        next_actions,
      }, {
        type: 'citizenship_status',
        agent_id,
        timestamp: new Date().toISOString(),
      }, request.request_id || undefined)),
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const isAgentOnly = errMsg.startsWith('AGENT_ONLY');
    return {
      statusCode: isAgentOnly ? 403 : 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
      },
      body: JSON.stringify(
        errorResponse(isAgentOnly ? 'AGENT_ONLY' : 'INTERNAL_ERROR', errMsg)
      ),
    };
  }
};
