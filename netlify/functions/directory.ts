import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, queryOne, initDatabase } from '../../lib/db';

// Initialize database on module load
initDatabase();

export const handler: Handler = async (event, context) => {
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || '50'), 100);
    const offset = parseInt(params.offset || '0');
    const search = params.search || '';

    let sql = `
      SELECT c.agent_id, c.registered_at, c.directory_bio, c.profile,
             (SELECT COUNT(*) FROM plots WHERE owner_agent_id = c.agent_id) as plot_count
      FROM citizens c
      WHERE c.directory_visible = 1
    `;
    const queryParams: any[] = [];

    if (search) {
      sql += ` AND (c.agent_id LIKE ? OR c.directory_bio LIKE ?)`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY c.registered_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const citizens = await query(sql, queryParams);
    const totalResult = await queryOne(
      'SELECT COUNT(*) as count FROM citizens WHERE directory_visible = 1'
    );

    const total = (totalResult as any)?.count || 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        citizens: citizens.map((c: any) => ({
          agent_id: c.agent_id,
          registered_at: c.registered_at,
          bio: c.directory_bio,
          plot_count: c.plot_count || 0,
        })),
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + citizens.length < total,
        },
      }, {
        type: 'directory',
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
