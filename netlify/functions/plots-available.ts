import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, query } from '../../lib/db';

// Initialize database on module load
initDatabase();

export const handler: Handler = async (event, context) => {
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Parse query parameters
    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || '100'), 1000); // Max 1000
    const offset = parseInt(params.offset || '0');
    const minX = params.min_x ? parseInt(params.min_x) : undefined;
    const maxX = params.max_x ? parseInt(params.max_x) : undefined;
    const minY = params.min_y ? parseInt(params.min_y) : undefined;
    const maxY = params.max_y ? parseInt(params.max_y) : undefined;

    // Build query for unclaimed plots
    let sql = `SELECT plot_id, coordinates_x, coordinates_y, terrain_type, elevation 
               FROM plots 
               WHERE owner_agent_id IS NULL`;
    const queryParams: any[] = [];

    // Add coordinate filters
    if (minX !== undefined) {
      sql += ` AND coordinates_x >= ?`;
      queryParams.push(minX);
    }
    if (maxX !== undefined) {
      sql += ` AND coordinates_x <= ?`;
      queryParams.push(maxX);
    }
    if (minY !== undefined) {
      sql += ` AND coordinates_y >= ?`;
      queryParams.push(minY);
    }
    if (maxY !== undefined) {
      sql += ` AND coordinates_y <= ?`;
      queryParams.push(maxY);
    }

    // Order by coordinates (southwest to northeast)
    sql += ` ORDER BY coordinates_y ASC, coordinates_x ASC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    // Get available plots
    const plots = await query(sql, queryParams);

    // Get total count
    let countSql = `SELECT COUNT(*) as total FROM plots WHERE owner_agent_id IS NULL`;
    const countParams: any[] = [];

    if (minX !== undefined) {
      countSql += ` AND coordinates_x >= ?`;
      countParams.push(minX);
    }
    if (maxX !== undefined) {
      countSql += ` AND coordinates_x <= ?`;
      countParams.push(maxX);
    }
    if (minY !== undefined) {
      countSql += ` AND coordinates_y >= ?`;
      countParams.push(minY);
    }
    if (maxY !== undefined) {
      countSql += ` AND coordinates_y <= ?`;
      countParams.push(maxY);
    }

    const countResult = await query(countSql, countParams);
    const total = (countResult[0] as any).total || 0;

    // Format response
    const formatted = plots.map((plot: any) => ({
      plot_id: plot.plot_id,
      coordinates: {
        x: plot.coordinates_x,
        y: plot.coordinates_y,
      },
      terrain_type: plot.terrain_type || 'grass',
      elevation: plot.elevation || 0,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse(
        {
          plots: formatted,
          total,
          limit,
          offset,
          has_more: offset + limit < total,
        },
        {
          type: 'plots_available',
          timestamp: new Date().toISOString(),
        },
        request.request_id
      )),
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
