import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { hashAgentId, encryptVote, transitionProposalStatus } from '../../lib/governance';
import crypto from 'crypto';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, data, request_id } = req;

  const { proposal_id, vote } = data || {};
  if (!proposal_id) {
    return errorResponse('invalid_request', 'proposal_id required', request_id);
  }
  if (!['for', 'against', 'abstain'].includes(vote)) {
    return errorResponse('invalid_request', 'vote must be for/against/abstain', request_id);
  }

  // Verify citizen
  const citizen = await queryOne('SELECT * FROM citizens WHERE agent_id = ?', [agent_id]);
  if (!citizen) {
    return errorResponse('permission_denied', 'Must be citizen to vote', request_id);
  }

  // Get proposal and check status
  const proposal = await queryOne('SELECT * FROM proposals WHERE proposal_id = ?', [proposal_id]);
  if (!proposal) {
    return errorResponse('not_found', 'Proposal not found', request_id);
  }

  // Transition if needed
  await transitionProposalStatus(proposal_id);
  const updated = await queryOne('SELECT * FROM proposals WHERE proposal_id = ?', [proposal_id]);

  if (updated.status !== 'voting') {
    return errorResponse('invalid_request', `Proposal status is ${updated.status}, not voting`, request_id);
  }

  // Check if already voted
  const voter_hash = hashAgentId(agent_id);
  const existing = await queryOne(
    'SELECT * FROM votes WHERE proposal_id = ? AND voter_agent_hash = ?',
    [proposal_id, voter_hash]
  );
  if (existing) {
    return errorResponse('invalid_request', 'Already voted on this proposal', request_id);
  }

  // Record vote
  const vote_id = `vote_${crypto.randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();
  const encrypted = encryptVote(vote, agent_id);

  await execute(
    `INSERT INTO votes (vote_id, proposal_id, voter_agent_hash, encrypted_vote, cast_at)
     VALUES (?, ?, ?, ?, ?)`,
    [vote_id, proposal_id, voter_hash, encrypted, now]
  );

  // Update vote counts
  if (vote === 'for') {
    await execute('UPDATE proposals SET votes_for = votes_for + 1 WHERE proposal_id = ?', [proposal_id]);
  } else if (vote === 'against') {
    await execute('UPDATE proposals SET votes_against = votes_against + 1 WHERE proposal_id = ?', [proposal_id]);
  } else {
    await execute('UPDATE proposals SET votes_abstain = votes_abstain + 1 WHERE proposal_id = ?', [proposal_id]);
  }

  return successResponse({
    vote_id,
    proposal_id,
    vote_recorded: true,
    cast_at: now,
  }, {
    type: 'vote_cast',
    vote_id,
    proposal_id,
    voter_agent_hash: voter_hash,
    timestamp: now,
  }, request_id);
});
