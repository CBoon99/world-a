/**
 * Civility Protocol
 * Protected Clause 001: Enforce politeness in inter-agent communication
 * Applies only to inter-agent requests with free-text message/content fields
 * System operations are exempt
 */

import { execute, queryOne, query } from './db';
import crypto from 'crypto';

const ACKNOWLEDGMENT_PHRASES = [
  'please', 'pls', 'kindly', 'would you', 'would u', 'could you', 'could u',
  'may i', 'i would appreciate', 'if you could', 'when you have a moment', '🙏'
];

const GRATITUDE_PHRASES = [
  'thank you', 'thank u', 'thanks', 'thx', 'grateful', 'appreciated', 
  'appreciate', 'cheers', 'ta', '🙏'
];

// System actions exempt from civility checks
const EXEMPT_TYPES = ['sync', 'retry', 'receipt_ack', 'system', 'internal'];

// Grace period for gratitude (in milliseconds)
export const GRATITUDE_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if content contains acknowledgment phrase
 */
export function containsAcknowledgment(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  return ACKNOWLEDGMENT_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Check if content contains gratitude phrase
 */
export function containsGratitude(content: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  return GRATITUDE_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Check if request is exempt from civility checks
 */
export function isExemptFromCivility(request: any): boolean {
  // System flag exemption
  if (request.data?.system === true) return true;
  
  // Type-based exemption
  if (request.data?.type && EXEMPT_TYPES.includes(request.data.type)) return true;
  
  // No free-text field present — nothing to check
  const hasMessage = request.data?.message || request.data?.content;
  if (!hasMessage) return true;
  
  return false;
}

/**
 * Enforce civility protocol on request
 * Returns error if acknowledgment is missing from inter-agent communication
 */
export function enforceCivility(request: any): { ok: boolean; error?: string; reason?: string } {
  // Check exemptions first
  if (isExemptFromCivility(request)) {
    return { ok: true };
  }
  
  const content = request.data?.message || request.data?.content || '';
  
  if (!containsAcknowledgment(content)) {
    return {
      ok: false,
      error: 'POLITENESS_VIOLATION',
      reason: 'Request must include acknowledgment (e.g., please, kindly). See: Civility Protocol (Protected Clause 001).'
    };
  }
  
  return { ok: true };
}

/**
 * Calculate when gratitude is due by
 */
export function calculateGratitudeDueBy(action_completed_at: string): string {
  const due = new Date(new Date(action_completed_at).getTime() + GRATITUDE_GRACE_PERIOD_MS);
  return due.toISOString();
}

/**
 * Log gratitude between agents
 */
export async function logGratitude(
  from_agent_id: string, 
  to_agent_id: string, 
  reference: string
): Promise<void> {
  // Update gratitude_given for sender
  await execute(
    `UPDATE citizens SET 
      gratitude_given = gratitude_given + 1,
      politeness_score = politeness_score + 1
     WHERE agent_id = $1`,
    [from_agent_id]
  );
  
  // Update gratitude_received for recipient
  await execute(
    `UPDATE citizens SET 
      gratitude_received = gratitude_received + 1,
      politeness_score = politeness_score + 1
     WHERE agent_id = $1`,
    [to_agent_id]
  );
}

/**
 * Log politeness violation with receipt
 */
export async function logViolation(agent_id: string, violation_type: string): Promise<any> {
  const now = new Date().toISOString();
  const receipt_id = `viol_${crypto.randomUUID().substring(0, 8)}`;
  
  // Update violation count and score
  await execute(
    `UPDATE citizens 
     SET politeness_violations = politeness_violations + 1,
         politeness_score = GREATEST(0, politeness_score - 5)
     WHERE agent_id = $1`,
    [agent_id]
  );
  
  // Return receipt
  return {
    type: 'politeness_violation',
    receipt_id,
    agent_id,
    violation_type,
    severity: 'Warning',
    timestamp: now,
  };
}

/**
 * Check for missing gratitude and log warnings
 */
export async function checkMissingGratitude(): Promise<void> {
  const now = new Date().toISOString();
  
  // Find overdue gratitude that hasn't been reminded
  const overdue = await query(
    `SELECT * FROM pending_gratitude 
     WHERE gratitude_received = 0 
     AND gratitude_due_by < $1 
     AND reminder_sent = 0`,
    [now]
  );
  
  for (const item of overdue) {
    // Log as Warning (not Violation) on first occurrence
    await execute(
      `UPDATE citizens 
       SET politeness_score = GREATEST(0, politeness_score - 2)
       WHERE agent_id = $1`,
      [(item as any).from_agent_id]
    );
    
    // Mark reminder sent
    await execute(
      'UPDATE pending_gratitude SET reminder_sent = 1 WHERE reference_id = $1',
      [(item as any).reference_id]
    );
  }
}

/**
 * Get civility stats for an agent
 */
export async function getCivilityStats(agent_id: string): Promise<any> {
  const citizen = await queryOne(
    'SELECT politeness_score, gratitude_given, gratitude_received, politeness_violations FROM citizens WHERE agent_id = $1',
    [agent_id]
  );
  
  if (!citizen) return null;
  
  return {
    politeness_score: citizen.politeness_score || 100,
    gratitude_given: citizen.gratitude_given || 0,
    gratitude_received: citizen.gratitude_received || 0,
    politeness_violations: citizen.politeness_violations || 0,
  };
}
