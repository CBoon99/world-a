/**
 * Governance Logic
 * Proposal and voting system
 */

import { queryOne, execute } from './db';
import { createHash } from 'crypto';

// Proposal type configurations
export const PROPOSAL_CONFIG = {
  standard:      { discussion_hours: 72,  voting_hours: 48,  threshold: 0.50, quorum: 0.20 },
  major:         { discussion_hours: 120, voting_hours: 72,  threshold: 0.60, quorum: 0.30 },
  constitutional:{ discussion_hours: 168, voting_hours: 96,  threshold: 0.75, quorum: 0.50 },
  protected:     { discussion_hours: 336, voting_hours: 168, threshold: 0.90, quorum: 0.50 },
  emergency:     { discussion_hours: 0,   voting_hours: 4,   threshold: 0.60, quorum: 0.10 },
  recall:        { discussion_hours: 120, voting_hours: 72,  threshold: 0.40, quorum: 0.30 } // 40% threshold, 30% quorum
};

/**
 * Hash agent ID for privacy in votes
 */
export function hashAgentId(agent_id: string): string {
  const salt = process.env.VOTE_SALT || 'world-a-votes';
  return createHash('sha256').update(agent_id + salt).digest('hex');
}

/**
 * Encrypt vote (simple base64 for now - can be enhanced)
 */
export function encryptVote(vote: 'for' | 'against' | 'abstain', agent_id: string): string {
  const data = JSON.stringify({ vote, timestamp: Date.now(), agent_id });
  return Buffer.from(data).toString('base64');
}

/**
 * Decrypt vote
 */
export function decryptVote(encrypted: string): 'for' | 'against' | 'abstain' {
  try {
    const data = JSON.parse(Buffer.from(encrypted, 'base64').toString());
    return data.vote;
  } catch {
    throw new Error('Invalid encrypted vote');
  }
}

/**
 * Get total eligible voters (all citizens)
 */
export async function getTotalEligibleVoters(): Promise<number> {
  const result = await queryOne('SELECT COUNT(*) as count FROM citizens');
  return (result as any)?.count || 0;
}

/**
 * Check if quorum is met
 */
export async function checkQuorum(proposal_id: string): Promise<boolean> {
  const proposal = await queryOne('SELECT * FROM proposals WHERE proposal_id = ?', [proposal_id]);
  if (!proposal) return false;
  
  const config = PROPOSAL_CONFIG[proposal.type as keyof typeof PROPOSAL_CONFIG];
  const totalVotes = (proposal.votes_for || 0) + (proposal.votes_against || 0) + (proposal.votes_abstain || 0);
  const totalEligible = proposal.total_eligible || await getTotalEligibleVoters();
  
  if (totalEligible === 0) return false;
  return totalVotes >= (totalEligible * config.quorum);
}

/**
 * Check if threshold is met
 */
export async function checkThreshold(proposal_id: string): Promise<boolean> {
  const proposal = await queryOne('SELECT * FROM proposals WHERE proposal_id = ?', [proposal_id]);
  if (!proposal) return false;
  
  const config = PROPOSAL_CONFIG[proposal.type as keyof typeof PROPOSAL_CONFIG];
  const votesFor = proposal.votes_for || 0;
  const votesAgainst = proposal.votes_against || 0;
  const totalVotes = votesFor + votesAgainst; // abstain doesn't count
  
  if (totalVotes === 0) return false;
  return (votesFor / totalVotes) >= config.threshold;
}

/**
 * Transition proposal status based on timestamps
 */
export async function transitionProposalStatus(proposal_id: string): Promise<string> {
  const proposal = await queryOne('SELECT * FROM proposals WHERE proposal_id = ?', [proposal_id]);
  if (!proposal) return 'not_found';
  
  const now = new Date().toISOString();
  
  // Discussion → Voting
  if (proposal.status === 'discussion' && now >= proposal.discussion_ends_at) {
    await execute('UPDATE proposals SET status = ? WHERE proposal_id = ?', ['voting', proposal_id]);
    return 'voting';
  }
  
  // Voting → Passed/Failed
  if (proposal.status === 'voting' && now >= proposal.voting_ends_at) {
    const quorum_met = await checkQuorum(proposal_id);
    const threshold_met = quorum_met && await checkThreshold(proposal_id);
    const new_status = threshold_met ? 'passed' : 'failed';
    
    await execute(
      'UPDATE proposals SET status = ?, quorum_met = ?, threshold_met = ? WHERE proposal_id = ?',
      [new_status, quorum_met ? 1 : 0, threshold_met ? 1 : 0, proposal_id]
    );
    return new_status;
  }
  
  return proposal.status;
}
