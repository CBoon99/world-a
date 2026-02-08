import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { canVisit } from '../../lib/social';
import { enforceCivility, logViolation } from '../../lib/civility';
import crypto from 'crypto';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
  const { agent_id, data, request_id } = req;

  const { plot_id, visit_type = 'visitor', message } = data || {};
  if (!plot_id) {
    return errorResponse('invalid_request', 'plot_id required', request_id);
  }

  // Enforce civility protocol (if message provided)
  if (message) {
    const civilityCheck = enforceCivility({ data: { message } });
    if (!civilityCheck.ok) {
      const violationReceipt = await logViolation(agent_id, 'POLITENESS_VIOLATION');
      return errorResponse(civilityCheck.error || 'POLITENESS_VIOLATION', civilityCheck.reason, request_id);
    }
  }

  // Check if already can visit
  const access = await canVisit(agent_id, plot_id);
  if (access.allowed) {
    return successResponse({
      status: 'already_permitted',
      reason: access.reason,
      plot_id,
    }, undefined, request_id);
  }

  // Check for existing pending request
  const existing = await queryOne(
    'SELECT * FROM visits WHERE visitor_agent_id = $1 AND plot_id = $2 AND status = $3',
    [agent_id, plot_id, 'pending']
  );

  if (existing) {
    return successResponse({
      status: 'pending',
      visit_id: existing.visit_id,
      requested_at: existing.requested_at,
    }, undefined, request_id);
  }

  // Create visit request
  const visit_id = `visit_${crypto.randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO visits (visit_id, visitor_agent_id, plot_id, status, requested_at, visit_type)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
    [visit_id, agent_id, plot_id, now, visit_type]
  );

  return successResponse({
    status: 'requested',
    visit_id,
    plot_id,
    visit_type,
    requested_at: now,
  }, {
    type: 'visit_request',
    visit_id,
    visitor_agent_id: agent_id,
    plot_id,
    timestamp: now,
  }, request_id);
});
