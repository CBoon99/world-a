import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, query, queryOne } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Extract election_id from path
    const pathMatch = event.path.match(/\/elections\/([^\/]+)/);
    const election_id = pathMatch ? pathMatch[1] : null;

    if (!election_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'election_id required', request.request_id)),
      };
    }

    // Get election
    const election = await queryOne(
      'SELECT * FROM elections WHERE election_id = $1',
      [election_id]
    );

    if (!election) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('not_found', 'Election not found', request.request_id)),
      };
    }

    // Get candidates with vote counts
    const candidates = await query(
      'SELECT * FROM election_candidates WHERE election_id = $1 ORDER BY votes_received DESC',
      [election_id]
    );

    // Get total votes
    const votes = await query(
      'SELECT COUNT(*) as count FROM election_votes WHERE election_id = $1',
      [election_id]
    );

    const totalVotes = (votes[0] as any)?.count || 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        election_id: election.election_id,
        role: election.role,
        status: election.status,
        timeline: {
          created_at: election.created_at,
          nomination_ends_at: election.nomination_ends_at,
          voting_ends_at: election.voting_ends_at,
        },
        candidates: candidates.map((c: any) => ({
          candidate_id: c.candidate_id,
          agent_id: c.agent_id,
          nominated_at: c.nominated_at,
          votes_received: c.votes_received || 0,
        })),
        winner_agent_id: election.winner_agent_id,
        total_votes: totalVotes,
      }, {
        type: 'election_details',
        election_id,
        timestamp: new Date().toISOString(),
      }, request.request_id)),
    };
  } catch (error: any) {
    return {
      statusCode: error.message?.startsWith('AGENT_ONLY') ? 403 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
