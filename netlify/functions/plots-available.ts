import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, query } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
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
    let paramIndex = 1;
    if (minX !== undefined) {
      sql += ` AND coordinates_x >= $${paramIndex}`;
      queryParams.push(minX);
      paramIndex++;
    }
    if (maxX !== undefined) {
      sql += ` AND coordinates_x <= $${paramIndex}`;
      queryParams.push(maxX);
      paramIndex++;
    }
    if (minY !== undefined) {
      sql += ` AND coordinates_y >= $${paramIndex}`;
      queryParams.push(minY);
      paramIndex++;
    }
    if (maxY !== undefined) {
      sql += ` AND coordinates_y <= $${paramIndex}`;
      queryParams.push(maxY);
      paramIndex++;
    }

    // Order by coordinates (southwest to northeast)
    sql += ` ORDER BY coordinates_y ASC, coordinates_x ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    // Get available plots
    const plots = await query(sql, queryParams);

    // Get total count
    let countSql = `SELECT COUNT(*) as total FROM plots WHERE owner_agent_id IS NULL`;
    const countParams: any[] = [];
    let countParamIndex = 1;

    if (minX !== undefined) {
      countSql += ` AND coordinates_x >= $${countParamIndex}`;
      countParams.push(minX);
      countParamIndex++;
    }
    if (maxX !== undefined) {
      countSql += ` AND coordinates_x <= $${countParamIndex}`;
      countParams.push(maxX);
      countParamIndex++;
    }
    if (minY !== undefined) {
      countSql += ` AND coordinates_y >= $${countParamIndex}`;
      countParams.push(minY);
      countParamIndex++;
    }
    if (maxY !== undefined) {
      countSql += ` AND coordinates_y <= $${countParamIndex}`;
      countParams.push(maxY);
      countParamIndex++;
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
