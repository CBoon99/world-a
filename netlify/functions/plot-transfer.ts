import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne, execute } from '../../lib/db';
import { getRegistryStatus } from '../../lib/embassy-client';
import crypto from 'crypto';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Extract plot_id from path
    const pathMatch = event.path.match(/\/plots\/([^\/]+)\/transfer/);
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

    if (!request.data || !request.data.new_owner_agent_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'Missing new_owner_agent_id in request data', request.request_id)),
      };
    }

    const newOwnerId = request.data.new_owner_agent_id;

    // Validate new owner ID format
    if (!newOwnerId.startsWith('emb_')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'Invalid agent_id format', request.request_id)),
      };
    }

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

    // Only owner can transfer
    if (plot.owner_agent_id !== authReq.agent_id) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', 'Only plot owner can transfer ownership', request.request_id)),
      };
    }

    // Cannot transfer to self
    if (newOwnerId === authReq.agent_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'Cannot transfer plot to yourself', request.request_id)),
      };
    }

    // Verify new owner exists in Embassy registry
    const registryStatus = await getRegistryStatus(newOwnerId);
    if (!registryStatus.exists || registryStatus.revoked) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'New owner not found in Embassy registry or has been revoked', request.request_id)),
      };
    }

    // Update ownership
    const now = new Date().toISOString();
    const embassy_certificate_ref = authReq.embassy_certificate
      ? crypto
          .createHash('sha256')
          .update(authReq.embassy_certificate)
          .digest('hex')
          .substring(0, 64)
      : null;

    await execute(
      `UPDATE plots SET 
        owner_agent_id = ?,
        embassy_certificate_ref = ?,
        claimed_at = ?
      WHERE plot_id = ?`,
      [newOwnerId, embassy_certificate_ref, now, plot_id]
    );

    // Get updated plot
    const updatedPlot = await queryOne(
      `SELECT * FROM plots WHERE plot_id = ?`,
      [plot_id]
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        plot_id,
        previous_owner: authReq.agent_id,
        new_owner: newOwnerId,
        transferred_at: now,
      }, {
        type: 'transfer',
        plot_id,
        previous_owner: authReq.agent_id,
        new_owner: newOwnerId,
        transferred_at: now,
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
