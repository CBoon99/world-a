import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, initDatabase } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const stewards = await query(
      `SELECT * FROM stewards WHERE status = 'active' ORDER BY role, term_start DESC`
    );

    const byRole: Record<string, any> = {};
    for (const s of stewards) {
      const steward = s as any;
      byRole[steward.role] = {
        steward_id: steward.steward_id,
        agent_id: steward.agent_id,
        role: steward.role,
        term_start: steward.term_start,
        term_end: steward.term_end,
        term_number: steward.term_number,
      };
    }

    const roles = ['chief', 'land', 'peace', 'archive', 'embassy'];
    const vacant = roles.filter(r => !byRole[r]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        stewards: byRole,
        roles,
        vacant,
      }, {
        type: 'stewards_list',
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
