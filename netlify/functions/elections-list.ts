import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, query, queryOne } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const params = event.queryStringParameters || {};
    const status = params.status || 'all'; // nominating, voting, complete, all
    const role = params.role;
    const limit = Math.min(parseInt(params.limit || '20'), 50);
    const offset = parseInt(params.offset || '0');

    let sql = 'SELECT * FROM elections WHERE 1=1';
    const queryParams: any[] = [];

    if (status !== 'all') {
      sql += ` AND status = ?`;
      queryParams.push(status);
    }

    if (role) {
      sql += ` AND role = ?`;
      queryParams.push(role);
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const elections = await query(sql, queryParams);
    const countResult = await queryOne(countSql, queryParams.slice(0, -2));

    // Get candidate counts for each election
    const electionsWithCounts = await Promise.all(
      elections.map(async (election: any) => {
        const candidates = await query(
          'SELECT COUNT(*) as count FROM election_candidates WHERE election_id = $1',
          [election.election_id]
        );
        const votes = await query(
          'SELECT COUNT(*) as count FROM election_votes WHERE election_id = $1',
          [election.election_id]
        );

        return {
          election_id: election.election_id,
          role: election.role,
          status: election.status,
          nomination_ends_at: election.nomination_ends_at,
          voting_ends_at: election.voting_ends_at,
          winner_agent_id: election.winner_agent_id,
          created_at: election.created_at,
          candidate_count: (candidates[0] as any)?.count || 0,
          vote_count: (votes[0] as any)?.count || 0,
        };
      })
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        elections: electionsWithCounts,
        pagination: {
          total: (countResult as any)?.count || 0,
          limit,
          offset,
          has_more: offset + elections.length < ((countResult as any)?.count || 0),
        },
      }, {
        type: 'elections_list',
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
