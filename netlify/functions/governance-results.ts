import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { queryOne, initDatabase } from '../../lib/db';
import { transitionProposalStatus, PROPOSAL_CONFIG } from '../../lib/governance';

// Initialize database on module load
initDatabase();

export const handler: Handler = async (event, context) => {
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Extract proposal_id from path
    const pathMatch = event.path.match(/\/results\/([^\/]+)/);
    const proposal_id = pathMatch ? pathMatch[1] : null;

    if (!proposal_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'proposal_id required', request.request_id)),
      };
    }

    // Transition if needed
    await transitionProposalStatus(proposal_id);

    const proposal = await queryOne('SELECT * FROM proposals WHERE proposal_id = ?', [proposal_id]);
    if (!proposal) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('not_found', 'Proposal not found', request.request_id)),
      };
    }

    const config = PROPOSAL_CONFIG[proposal.type as keyof typeof PROPOSAL_CONFIG];
    const votesFor = proposal.votes_for || 0;
    const votesAgainst = proposal.votes_against || 0;
    const votesAbstain = proposal.votes_abstain || 0;
    const totalVotes = votesFor + votesAgainst + votesAbstain;
    const participationRate = proposal.total_eligible > 0 
      ? totalVotes / proposal.total_eligible 
      : 0;
    const approvalRate = (votesFor + votesAgainst) > 0
      ? votesFor / (votesFor + votesAgainst)
      : 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        proposal_id,
        title: proposal.title,
        type: proposal.type,
        status: proposal.status,
        votes: {
          for: votesFor,
          against: votesAgainst,
          abstain: votesAbstain,
          total: totalVotes,
        },
        thresholds: {
          quorum_required: config.quorum,
          threshold_required: config.threshold,
          quorum_met: !!proposal.quorum_met,
          threshold_met: !!proposal.threshold_met,
        },
        rates: {
          participation: participationRate,
          approval: approvalRate,
        },
        timeline: {
          submitted_at: proposal.submitted_at,
          discussion_ends_at: proposal.discussion_ends_at,
          voting_ends_at: proposal.voting_ends_at,
          implemented_at: proposal.implemented_at || null,
        },
        total_eligible: proposal.total_eligible,
      }, {
        type: 'proposal_results',
        proposal_id,
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
