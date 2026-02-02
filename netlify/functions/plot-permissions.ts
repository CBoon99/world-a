import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne, execute } from '../../lib/db';

// Initialize database on module load
initDatabase();

export const handler: Handler = async (event, context) => {
  try {
    // Extract plot_id from path
    const pathMatch = event.path.match(/\/plots\/([^\/]+)\/permissions/);
    const plot_id = pathMatch ? pathMatch[1] : null;

    if (!plot_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'Missing plot_id', undefined)),
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

    // Only owner can manage permissions
    if (plot.owner_agent_id !== authReq.agent_id) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', 'Only plot owner can manage permissions', request.request_id)),
      };
    }

    // Handle GET request
    if (event.httpMethod === 'GET') {
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

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse({
          plot_id,
          permissions,
        }, undefined, request.request_id)),
      };
    }

    // Handle PUT request
    if (event.httpMethod === 'PUT') {
      if (!request.data || !request.data.permissions) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorResponse('invalid_request', 'Missing permissions in request data', request.request_id)),
        };
      }

      const newPermissions = request.data.permissions;

      // Validate permissions structure
      const validKeys = ['public_read', 'public_write', 'allowed_agents', 'banned_agents', 'governance_override'];
      const permissionsToSave: any = {};

      for (const key of validKeys) {
        if (newPermissions.hasOwnProperty(key)) {
          if (key === 'public_read' || key === 'public_write' || key === 'governance_override') {
            permissionsToSave[key] = Boolean(newPermissions[key]);
          } else if (key === 'allowed_agents' || key === 'banned_agents') {
            // Ensure it's an array of strings
            if (Array.isArray(newPermissions[key])) {
              permissionsToSave[key] = newPermissions[key].filter((id: any) => 
                typeof id === 'string' && id.startsWith('emb_')
              );
            }
          }
        }
      }

      // Update plot permissions
      await execute(
        `UPDATE plots SET permissions = ? WHERE plot_id = ?`,
        [JSON.stringify(permissionsToSave), plot_id]
      );

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse({
          plot_id,
          permissions: permissionsToSave,
        }, {
          type: 'permissions_update',
          plot_id,
          timestamp: new Date().toISOString(),
        }, request.request_id)),
      };
    }

    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('method_not_allowed', 'Only GET and PUT methods allowed', request.request_id)),
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
