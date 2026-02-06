import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { calculateGratitudeDueBy } from '../../lib/civility';
import crypto from 'crypto';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Extract visit_id from path
    const pathMatch = event.path.match(/\/visit\/([^\/]+)\/respond/);
    const visit_id = pathMatch ? pathMatch[1] : null;

    if (!visit_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'visit_id required', request.request_id)),
      };
    }

    const { action, expires_in_hours = 24 } = request.data || {};
    if (!action || !['approve', 'deny'].includes(action)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'action must be approve or deny', request.request_id)),
      };
    }

    // Get visit request
    const visit = await queryOne(
      'SELECT * FROM visits WHERE visit_id = ?',
      [visit_id]
    );

    if (!visit) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('not_found', 'Visit request not found', request.request_id)),
      };
    }

    // Verify requester owns the plot
    const plot = await queryOne(
      'SELECT * FROM plots WHERE plot_id = ?',
      [visit.plot_id]
    );

    if (!plot || plot.owner_agent_id !== authReq.agent_id) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', 'Only plot owner can respond to visit requests', request.request_id)),
      };
    }

    // Check visit is still pending
    if (visit.status !== 'pending') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', `Visit request is already ${visit.status}`, request.request_id)),
      };
    }

    const now = new Date().toISOString();
    let newStatus: string;
    let expires_at: string | null = null;

    if (action === 'approve') {
      newStatus = 'approved';
      const expiresDate = new Date();
      expiresDate.setHours(expiresDate.getHours() + expires_in_hours);
      expires_at = expiresDate.toISOString();

      // Create pending gratitude entry for visitor to thank host
      await execute(
        `INSERT INTO pending_gratitude 
         (reference_id, from_agent_id, to_agent_id, action_type, action_completed_at, gratitude_due_by)
         VALUES (?, ?, ?, 'visit_approved', ?, ?)`,
        [visit_id, visit.visitor_agent_id, authReq.agent_id, now, calculateGratitudeDueBy(now)]
      );
    } else {
      newStatus = 'denied';
    }

    // Update visit status
    await execute(
      `UPDATE visits SET status = ?, responded_at = ?, expires_at = ? WHERE visit_id = ?`,
      [newStatus, now, expires_at, visit_id]
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        visit_id,
        status: newStatus,
        responded_at: now,
        expires_at,
      }, {
        type: 'visit_response',
        visit_id,
        plot_id: visit.plot_id,
        visitor_agent_id: visit.visitor_agent_id,
        host_agent_id: authReq.agent_id,
        action,
        timestamp: now,
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
