/**
 * Elections Logic
 * Steward election system
 */

import { query, queryOne, execute } from './db';
import { hashAgentId } from './governance';

export const ELECTION_CONFIG = {
  nomination_hours: 48,
  voting_hours: 72,
  term_days: 30,
  max_consecutive_terms: 3,
  recall_threshold: 0.40
};

/**
 * Check if agent can nominate for a role
 */
export async function canNominate(agent_id: string, role: string): Promise<{ allowed: boolean; reason?: string }> {
  // Check if citizen
  const citizen = await queryOne('SELECT * FROM citizens WHERE agent_id = ?', [agent_id]);
  if (!citizen) return { allowed: false, reason: 'not_a_citizen' };
  
  // Check consecutive terms (get most recent terms for this role)
  const recentTerms = await query(
    'SELECT term_number FROM stewards WHERE agent_id = ? AND role = ? ORDER BY term_start DESC LIMIT ?',
    [agent_id, role, ELECTION_CONFIG.max_consecutive_terms]
  );
  
  // Check if all recent terms are consecutive
  if (recentTerms.length >= ELECTION_CONFIG.max_consecutive_terms) {
    // Simple check: if we have max_consecutive_terms recent terms, they might be consecutive
    const termNumbers = recentTerms.map((t: any) => t.term_number).sort((a: number, b: number) => b - a);
    const isConsecutive = termNumbers.every((num: number, idx: number) => idx === 0 || num === termNumbers[idx - 1] - 1);
    if (isConsecutive) {
      return { allowed: false, reason: 'max_consecutive_terms_reached' };
    }
  }
  
  return { allowed: true };
}

/**
 * Tally election votes and return winner
 */
export async function tallyElection(election_id: string): Promise<string | null> {
  const candidates = await query(
    'SELECT * FROM election_candidates WHERE election_id = ? ORDER BY votes_received DESC',
    [election_id]
  );
  
  if (candidates.length === 0) return null;
  
  // Simple plurality - highest votes wins
  const winner = candidates[0] as any;
  return winner.agent_id;
}
