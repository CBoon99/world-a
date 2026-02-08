import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, query, queryOne } from '../../lib/db';
import { canNominate, ELECTION_CONFIG, tallyElection } from '../../lib/elections';
import { hashAgentId } from '../../lib/governance';
import crypto from 'crypto';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
  const { agent_id, data, request_id } = req;

  const { action, role, candidate_agent_id } = data || {};

  if (!action) {
    return errorResponse('invalid_request', 'action required', request_id);
  }
  if (!role) {
    return errorResponse('invalid_request', 'role required', request_id);
  }
  if (!['chief', 'land', 'peace', 'archive', 'embassy'].includes(role)) {
    return errorResponse('invalid_request', 'Invalid steward role', request_id);
  }

  // Get or create active election for this role
  let election = await queryOne(
    `SELECT * FROM elections WHERE role = $1 AND status IN ('nominating', 'voting')`,
    [role]
  );

  const now = new Date();

  if (!election && action === 'nominate') {
    // Create new election
    const election_id = `elec_${crypto.randomUUID().substring(0, 8)}`;
    const nom_ends = new Date(now.getTime() + ELECTION_CONFIG.nomination_hours * 60 * 60 * 1000);
    const vote_ends = new Date(nom_ends.getTime() + ELECTION_CONFIG.voting_hours * 60 * 60 * 1000);

    await execute(
      `INSERT INTO elections (election_id, role, status, nomination_ends_at, voting_ends_at, created_at)
       VALUES ($1, $2, 'nominating', $3, $4, $5)`,
      [election_id, role, nom_ends.toISOString(), vote_ends.toISOString(), now.toISOString()]
    );

    election = await queryOne('SELECT * FROM elections WHERE election_id = $1', [election_id]);
  }

  if (!election) {
    return errorResponse('not_found', 'No active election for this role', request_id);
  }

  // Transition election status if needed
  if (election.status === 'nominating' && now.toISOString() >= election.nomination_ends_at) {
    await execute(`UPDATE elections SET status = 'voting' WHERE election_id = $1`, [election.election_id]);
    election.status = 'voting';
  }

  if (election.status === 'voting' && now.toISOString() >= election.voting_ends_at) {
    const winner = await tallyElection(election.election_id);
    await execute(
      `UPDATE elections SET status = 'complete', winner_agent_id = $1 WHERE election_id = $2`,
      [winner, election.election_id]
    );

    if (winner) {
      // Inaugurate winner
      const steward_id = `stew_${crypto.randomUUID().substring(0, 8)}`;
      const term_end = new Date(now.getTime() + ELECTION_CONFIG.term_days * 24 * 60 * 60 * 1000);

      // End current steward's term
      await execute(
        `UPDATE stewards SET status = 'term_ended', term_end = $1 WHERE role = $2 AND status = 'active'`,
        [now.toISOString(), role]
      );

      // Get term number
      const previousTerms = await query(
        `SELECT MAX(term_number) as max_term FROM stewards WHERE agent_id = $1 AND role = $2`,
        [winner, role]
      );
      const term_number = ((previousTerms[0] as any)?.max_term || 0) + 1;

      await execute(
        `INSERT INTO stewards (steward_id, agent_id, role, term_start, term_end, term_number, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [steward_id, winner, role, now.toISOString(), term_end.toISOString(), term_number]
      );

      // Generate inauguration receipt
      const inauguration_receipt_id = `inaug_${crypto.randomUUID().substring(0, 8)}`;
      const inauguration_receipt = {
        type: 'inauguration_receipt',
        receipt_id: inauguration_receipt_id,
        steward_id,
        agent_id: winner,
        role,
        term_start: now.toISOString(),
        term_end: term_end.toISOString(),
        election_id: election.election_id,
        timestamp: now.toISOString(),
      };

      // Store receipt reference
      await execute(
        'UPDATE stewards SET election_receipt_ref = $1 WHERE steward_id = $2',
        [inauguration_receipt_id, steward_id]
      );

      return successResponse({
        election_id: election.election_id,
        status: 'complete',
        winner_agent_id: winner,
        steward_id,
        message: 'Election complete. New steward inaugurated.',
        inauguration_receipt,
      }, {
        type: 'election_complete',
        election_id: election.election_id,
        winner_agent_id: winner,
        inauguration_receipt,
        timestamp: now.toISOString(),
      }, request_id);
    }

    return successResponse({
      election_id: election.election_id,
      status: 'complete',
      winner_agent_id: winner,
      message: 'Election complete. No winner.',
    }, {
      type: 'election_complete',
      election_id: election.election_id,
      winner_agent_id: winner,
      timestamp: now.toISOString(),
    }, request_id);
  }

  // Handle nomination
  if (action === 'nominate') {
    if (election.status !== 'nominating') {
      return errorResponse('invalid_request', 'Nomination period has ended', request_id);
    }

    const nominee = candidate_agent_id || agent_id;
    const canNom = await canNominate(nominee, role);
    if (!canNom.allowed) {
      return errorResponse('invalid_request', canNom.reason || 'Cannot nominate', request_id);
    }

    // Check if already nominated
    const existing = await queryOne(
      'SELECT * FROM election_candidates WHERE election_id = $1 AND agent_id = $2',
      [election.election_id, nominee]
    );
    if (existing) {
      return errorResponse('invalid_request', 'Already nominated', request_id);
    }

    const candidate_id = `cand_${crypto.randomUUID().substring(0, 8)}`;
    await execute(
      `INSERT INTO election_candidates (candidate_id, election_id, agent_id, nominated_at)
       VALUES ($1, $2, $3, $4)`,
      [candidate_id, election.election_id, nominee, now.toISOString()]
    );

    return successResponse({
      election_id: election.election_id,
      candidate_id,
      agent_id: nominee,
      action: 'nominated',
    }, {
      type: 'nomination',
      election_id: election.election_id,
      candidate_agent_id: nominee,
      timestamp: now.toISOString(),
    }, request_id);
  }

  // Handle vote
  if (action === 'vote') {
    if (election.status !== 'voting') {
      return errorResponse('invalid_request', 'Voting period not active', request_id);
    }

    if (!candidate_agent_id) {
      return errorResponse('invalid_request', 'candidate_agent_id required for voting', request_id);
    }

    // Get candidate
    const candidate = await queryOne(
      'SELECT * FROM election_candidates WHERE election_id = $1 AND agent_id = $2',
      [election.election_id, candidate_agent_id]
    );
    if (!candidate) {
      return errorResponse('not_found', 'Not a valid candidate', request_id);
    }

    // Check if already voted
    const voter_hash = hashAgentId(agent_id);
    const existing = await queryOne(
      'SELECT * FROM election_votes WHERE election_id = $1 AND voter_agent_hash = $2',
      [election.election_id, voter_hash]
    );
    if (existing) {
      return errorResponse('invalid_request', 'Already voted in this election', request_id);
    }

    // Record vote
    const vote_id = `evote_${crypto.randomUUID().substring(0, 8)}`;
    await execute(
      `INSERT INTO election_votes (vote_id, election_id, voter_agent_hash, candidate_id, cast_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [vote_id, election.election_id, voter_hash, candidate.candidate_id, now.toISOString()]
    );

    // Update candidate vote count
    await execute(
      `UPDATE election_candidates SET votes_received = votes_received + 1 WHERE candidate_id = $1`,
      [candidate.candidate_id]
    );

    return successResponse({
      election_id: election.election_id,
      vote_id,
      action: 'voted',
    }, {
      type: 'election_vote',
      election_id: election.election_id,
      voter_agent_hash: voter_hash,
      timestamp: now.toISOString(),
    }, request_id);
  }

  return errorResponse('invalid_request', 'action must be nominate or vote', request_id);
});
