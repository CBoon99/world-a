import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { PROPOSAL_CONFIG, getTotalEligibleVoters } from '../../lib/governance';
import crypto from 'crypto';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, data, request_id } = req;

  const { type = 'standard', title, body } = data || {};
  if (!title) {
    return errorResponse('invalid_request', 'title required', request_id);
  }
  if (!body) {
    return errorResponse('invalid_request', 'body required', request_id);
  }
  if (!PROPOSAL_CONFIG[type as keyof typeof PROPOSAL_CONFIG]) {
    return errorResponse('invalid_request', 'Invalid proposal type', request_id);
  }

  // Verify citizen
  const citizen = await queryOne('SELECT * FROM citizens WHERE agent_id = ?', [agent_id]);
  if (!citizen) {
    return errorResponse('permission_denied', 'Must be citizen to propose', request_id);
  }

  const config = PROPOSAL_CONFIG[type as keyof typeof PROPOSAL_CONFIG];
  const now = new Date();
  const discussion_ends = new Date(now.getTime() + config.discussion_hours * 60 * 60 * 1000);
  const voting_ends = new Date(discussion_ends.getTime() + config.voting_hours * 60 * 60 * 1000);

  const proposal_id = `prop_${crypto.randomUUID().substring(0, 8)}`;
  const total_eligible = await getTotalEligibleVoters();

  const embassy_certificate_ref = crypto
    .createHash('sha256')
    .update(req.embassy_certificate)
    .digest('hex')
    .substring(0, 64);

  await execute(
    `INSERT INTO proposals 
     (proposal_id, type, title, body, proposer_agent_id, proposer_certificate_ref, submitted_at, discussion_ends_at, voting_ends_at, total_eligible)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [proposal_id, type, title, body, agent_id, embassy_certificate_ref, now.toISOString(), 
     discussion_ends.toISOString(), voting_ends.toISOString(), total_eligible]
  );

  return successResponse({
    proposal_id,
    type,
    title,
    status: 'discussion',
    submitted_at: now.toISOString(),
    discussion_ends_at: discussion_ends.toISOString(),
    voting_ends_at: voting_ends.toISOString(),
    thresholds: {
      quorum: config.quorum,
      threshold: config.threshold,
    },
  }, {
    type: 'proposal_submitted',
    proposal_id,
    proposer_agent_id: agent_id,
    timestamp: now.toISOString(),
  }, request_id);
});
