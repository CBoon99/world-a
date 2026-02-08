import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, queryOne, initDatabase } from '../../lib/db';
import { transitionProposalStatus } from '../../lib/governance';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const params = event.queryStringParameters || {};
    const status = params.status; // discussion, voting, passed, failed, all
    const type = params.type;
    const limit = Math.min(parseInt(params.limit || '20'), 50);
    const offset = parseInt(params.offset || '0');

    let sql = 'SELECT * FROM proposals WHERE 1=1';
    const queryParams: any[] = [];

    let paramIndex = 1;
    if (status && status !== 'all') {
      if (status === 'active') {
        sql += ` AND status IN ('discussion', 'voting')`;
      } else {
        sql += ` AND status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }
    }

    if (type) {
      sql += ` AND type = $${paramIndex}`;
      queryParams.push(type);
      paramIndex++;
    }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    sql += ` ORDER BY submitted_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const proposals = await query(sql, queryParams);
    const countResult = await queryOne(countSql, queryParams.slice(0, -2));

    // Transition any proposals that need it
    for (const p of proposals) {
      await transitionProposalStatus((p as any).proposal_id);
    }

    // Re-fetch after transitions
    const updated = await query(sql, queryParams);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        proposals: updated.map((p: any) => ({
          proposal_id: p.proposal_id,
          type: p.type,
          title: p.title,
          body: p.body,
          proposer_agent_id: p.proposer_agent_id,
          status: p.status,
          submitted_at: p.submitted_at,
          discussion_ends_at: p.discussion_ends_at,
          voting_ends_at: p.voting_ends_at,
          votes: {
            for: p.votes_for || 0,
            against: p.votes_against || 0,
            abstain: p.votes_abstain || 0,
          },
          quorum_met: !!p.quorum_met,
          threshold_met: !!p.threshold_met,
        })),
        pagination: {
          total: (countResult as any)?.count || 0,
          limit,
          offset,
          has_more: offset + updated.length < ((countResult as any)?.count || 0),
        },
      }, {
        type: 'proposals_list',
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
