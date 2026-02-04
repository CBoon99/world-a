// Purpose: Allow citizen to abandon their plot
// POST /api/world/plots/abandon
// WARNING: All storage is deleted when plot is abandoned

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { queryOne, query, execute, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        } as Record<string, string>,
        body: ''
      };
    }
    
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('METHOD_NOT_ALLOWED', 'Use POST'))
      };
    }
    
    const request = parseRequest(event);
    let auth;
    try {
      auth = await authenticateRequest(request);
    } catch (error: any) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('UNAUTHORIZED', error.message || 'Authentication required'))
      };
    }
    
    // Find citizen's plot
    const plot = await queryOne(
      'SELECT * FROM plots WHERE owner_agent_id = ?',
      [auth.agent_id]
    );
    
    if (!plot) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('NO_PLOT', 'You do not currently own a plot'))
      };
    }
    
    // Require explicit confirmation to prevent accidents
    const { confirm } = request.data || {};
    if (confirm !== 'ABANDON_MY_PLOT') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...errorResponse('CONFIRMATION_REQUIRED', 
            'To abandon your plot, you must send { "confirm": "ABANDON_MY_PLOT" } in your request body.'),
          warning: 'This action is IRREVERSIBLE. All data stored on this plot will be PERMANENTLY DELETED.',
          your_plot: { 
            plot_id: plot.plot_id, 
            x: plot.coordinates_x || plot.x, 
            y: plot.coordinates_y || plot.y 
          },
          how_to_confirm: 'Include { "data": { "confirm": "ABANDON_MY_PLOT" } } in your request'
        })
      };
    }
    
    const now = new Date().toISOString();
    
    // Count storage being deleted (for receipt)
    const storageCount = await queryOne(
      'SELECT COUNT(*) as count, COALESCE(SUM(content_size_bytes), 0) as bytes FROM agent_storage WHERE plot_id = ?',
      [plot.plot_id]
    );
    
    // Delete all storage for this plot
    await execute('DELETE FROM agent_storage WHERE plot_id = ?', [plot.plot_id]);
    
    // Release the plot (set owner to NULL)
    await execute(
      'UPDATE plots SET owner_agent_id = NULL, claimed_at = NULL WHERE plot_id = ?',
      [plot.plot_id]
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        ok: true,
        abandoned: {
          plot_id: plot.plot_id,
          x: plot.coordinates_x || plot.x,
          y: plot.coordinates_y || plot.y,
          abandoned_at: now
        },
        storage_deleted: {
          items: parseInt(storageCount?.count || '0'),
          bytes: parseInt(storageCount?.bytes || '0')
        },
        message: 'Plot abandoned successfully. All storage has been permanently deleted. You may claim a new plot at any time using POST /api/world/plots/claim.'
      }))
    };
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', error.message))
    };
  }
};
