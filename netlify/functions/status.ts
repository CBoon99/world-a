import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne, query } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const { agent_id } = authReq;

    // Check citizenship status
    const citizen = await queryOne(
      `SELECT * FROM citizens WHERE agent_id = ?`,
      [agent_id]
    );

    if (!citizen) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse({
          agent_id,
          citizenship_status: 'not_registered',
          registered: false,
        }, undefined, request.request_id || undefined)),
      };
    }

    // Parse profile
    let profile: any = {};
    if (typeof citizen.profile === 'string') {
      try {
        profile = JSON.parse(citizen.profile);
      } catch {
        profile = {};
      }
    } else {
      profile = citizen.profile || {};
    }

    // Get owned plots
    const plots = await query(
      `SELECT plot_id, coordinates_x, coordinates_y, storage_allocation_gb, storage_used_bytes, claimed_at
       FROM plots 
       WHERE owner_agent_id = ?`,
      [agent_id]
    );

    const ownedPlots = plots.map((plot: any) => ({
      plot_id: plot.plot_id,
      coordinates: {
        x: plot.coordinates_x,
        y: plot.coordinates_y,
      },
      storage_allocation_gb: plot.storage_allocation_gb,
      storage_used_bytes: plot.storage_used_bytes,
      claimed_at: plot.claimed_at,
    }));

    // Get total storage stats
    const totalAllocation = plots.reduce((sum: number, plot: any) => 
      sum + (plot.storage_allocation_gb || 1), 0
    );
    const totalUsed = plots.reduce((sum: number, plot: any) => 
      sum + (plot.storage_used_bytes || 0), 0
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        agent_id,
        citizenship_status: 'registered',
        registered: true,
        registered_at: citizen.registered_at,
        profile,
        plots: {
          count: ownedPlots.length,
          total: ownedPlots,
        },
        storage: {
          total_allocation_gb: totalAllocation,
          total_used_bytes: totalUsed,
          total_available_bytes: (totalAllocation * 1024 * 1024 * 1024) - totalUsed,
        },
      }, {
        type: 'citizenship_status',
        agent_id,
        timestamp: new Date().toISOString(),
      }, request.request_id || undefined)),
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
