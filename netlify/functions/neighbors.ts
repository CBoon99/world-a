import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { getNeighbors } from '../../lib/social';
import { queryOne, initDatabase } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const plot_id = event.queryStringParameters?.plot_id;
    if (!plot_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'plot_id required', request.request_id)),
      };
    }

    // Verify requester owns the plot
    const plot = await queryOne('SELECT * FROM plots WHERE plot_id = $1', [plot_id]);
    if (!plot) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('plot_not_found', 'Plot not found', request.request_id)),
      };
    }

    if (plot.owner_agent_id !== authReq.agent_id) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', 'Not your plot', request.request_id)),
      };
    }

    const neighbors = await getNeighbors(plot_id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        plot_id,
        neighbors: neighbors.map((n: any) => ({
          plot_id: n.plot_id,
          coordinates: { x: n.coordinates_x, y: n.coordinates_y },
          owner_agent_id: n.owner_agent_id,
          display_name: n.display_name,
          public_description: n.public_description,
        })),
      }, {
        type: 'neighbors_list',
        plot_id,
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
