import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { getTotalEligibleVoters } from '../../lib/governance';
import crypto from 'crypto';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
  const { agent_id, data, request_id } = req;

  const { steward_id, reason } = data || {};
  if (!steward_id) {
    return errorResponse('invalid_request', 'steward_id required', request_id);
  }
  if (!reason) {
    return errorResponse('invalid_request', 'reason required', request_id);
  }

  // Verify citizen
  const citizen = await queryOne('SELECT * FROM citizens WHERE agent_id = ?', [agent_id]);
  if (!citizen) {
    return errorResponse('permission_denied', 'Must be citizen to initiate recall', request_id);
  }

  // Get steward
  const steward = await queryOne(
    'SELECT * FROM stewards WHERE steward_id = ? AND status = ?',
    [steward_id, 'active']
  );

  if (!steward) {
    return errorResponse('not_found', 'Active steward not found', request_id);
  }

  // Check if recall proposal already exists for this steward
  const existing = await queryOne(
    "SELECT * FROM proposals WHERE proposer_agent_id = ? AND type = 'recall' AND status IN ('discussion', 'voting')",
    [agent_id]
  );

  if (existing) {
    return errorResponse('invalid_request', 'Recall proposal already exists for this steward', request_id);
  }

  // Create recall proposal (40% threshold, 30% quorum - similar to major proposal)
  const now = new Date();
  const discussion_ends = new Date(now.getTime() + 120 * 60 * 60 * 1000); // 120 hours discussion
  const voting_ends = new Date(discussion_ends.getTime() + 72 * 60 * 60 * 1000); // 72 hours voting

  const proposal_id = `recall_${crypto.randomUUID().substring(0, 8)}`;
  const total_eligible = await getTotalEligibleVoters();

  const embassy_certificate_ref = crypto
    .createHash('sha256')
    .update(req.embassy_certificate)
    .digest('hex')
    .substring(0, 64);

  await execute(
    `INSERT INTO proposals 
     (proposal_id, type, title, body, proposer_agent_id, proposer_certificate_ref, submitted_at, discussion_ends_at, voting_ends_at, total_eligible)
     VALUES (?, 'recall', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      proposal_id,
      `Recall Steward: ${steward.role}`,
      `Recall proposal for steward ${steward_id} (${steward.role}). Reason: ${reason}`,
      agent_id,
      embassy_certificate_ref,
      now.toISOString(),
      discussion_ends.toISOString(),
      voting_ends.toISOString(),
      total_eligible,
    ]
  );

  // Link proposal to steward (store steward_id in body or create separate table)
  // For now, steward_id is in the proposal body

  return successResponse({
    proposal_id,
    type: 'recall',
    steward_id,
    steward_role: steward.role,
    status: 'discussion',
    submitted_at: now.toISOString(),
    discussion_ends_at: discussion_ends.toISOString(),
    voting_ends_at: voting_ends.toISOString(),
    thresholds: {
      quorum: 0.30, // 30% quorum
      threshold: 0.40, // 40% threshold for recall
    },
  }, {
    type: 'recall_initiated',
    proposal_id,
    steward_id,
    proposer_agent_id: agent_id,
    timestamp: now.toISOString(),
  }, request_id);
});
