import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { getWorldMap } from '../../lib/world-info';
import { initDatabase } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const params = event.queryStringParameters || {};
    const map = await getWorldMap({
      min_x: parseInt(params.min_x || '0'),
      max_x: parseInt(params.max_x || '99'),
      min_y: parseInt(params.min_y || '0'),
      max_y: parseInt(params.max_y || '99'),
      claimed_only: params.claimed_only === 'true',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        map,
      }, {
        type: 'world_map',
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
