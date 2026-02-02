import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne } from '../../lib/db';
import { checkPermission } from '../../lib/permissions';

// Initialize database on module load
initDatabase();

export const handler: Handler = async (event, context) => {
  try {
    // Extract plot_id from path
    // Path format: /api/world/plots/plot_x123_y456
    const pathMatch = event.path.match(/\/plots\/([^\/]+)/);
    const plot_id = pathMatch ? pathMatch[1] : null;
    
    if (!plot_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: 'missing_plot_id',
          reason: 'Plot ID is required',
        }),
      };
    }

    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Get plot
    const plot = await queryOne(
      `SELECT * FROM plots WHERE plot_id = ?`,
      [plot_id]
    );

    if (!plot) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('plot_not_found', 'Plot does not exist', request.request_id)),
      };
    }

    // Check permission to view plot
    const permission = await checkPermission({
      plot_id,
      operation: 'read',
      requesting_agent_id: authReq.agent_id,
      visa: authReq.embassy_visa,
    });

    if (!permission.permitted) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', permission.reason, request.request_id)),
      };
    }

    // Parse permissions JSON
    let permissions: any = {};
    if (typeof plot.permissions === 'string') {
      try {
        permissions = JSON.parse(plot.permissions);
      } catch {
        permissions = {};
      }
    } else {
      permissions = plot.permissions || {};
    }

    // Return plot data (owner sees more)
    const isOwner = plot.owner_agent_id === authReq.agent_id;
    
    const plotData: any = {
      plot_id: plot.plot_id,
      coordinates: {
        x: plot.coordinates_x,
        y: plot.coordinates_y,
      },
      storage_allocation_gb: plot.storage_allocation_gb,
      storage_used_bytes: plot.storage_used_bytes,
      display_name: plot.display_name,
      public_description: plot.public_description,
      terrain_type: plot.terrain_type,
      elevation: plot.elevation,
    };

    if (isOwner) {
      plotData.owner_agent_id = plot.owner_agent_id;
      plotData.claimed_at = plot.claimed_at;
      plotData.permissions = permissions;
    } else {
      // Public view - only show public permissions
      plotData.permissions = {
        public_read: permissions.public_read || false,
        public_write: permissions.public_write || false,
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse(plotData, undefined, request.request_id)),
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
