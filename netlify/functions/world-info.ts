import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { getWorldStats } from '../../lib/world-info';
import { initDatabase } from '../../lib/db';

// Initialize database on module load
initDatabase();

export const handler: Handler = async (event, context) => {
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const stats = await getWorldStats();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        world: 'World A',
        version: '1.0.0',
        stats,
        retrieved_at: new Date().toISOString(),
      }, {
        type: 'world_info',
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
