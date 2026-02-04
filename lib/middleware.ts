/**
 * Middleware for Netlify Functions
 * Handles authentication and request parsing
 */

import { Handler } from '@netlify/functions';
import { verifyAgentCertificate, getRegistryStatus } from './embassy-client';
import { enforceAgentOnly } from './permissions';
import { WorldARequest, WorldAResponse } from './types';

export interface AuthenticatedRequest {
  agent_id: string;
  agent_verification: any;
  embassy_certificate: string;
  embassy_visa?: string;
  request_id?: string;
  timestamp?: string;
  data?: any;
}

/**
 * Parse and validate request body
 */
export function parseRequest(event: any): WorldARequest {
  try {
    const body = JSON.parse(event.body || '{}');
    return body;
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }
}

/**
 * Authenticate agent request
 */
export async function authenticateRequest(
  request: WorldARequest
): Promise<AuthenticatedRequest> {
  if (!request.agent_id) {
    throw new Error('AGENT_ONLY: Missing agent_id');
  }

  if (!request.embassy_certificate) {
    throw new Error('AGENT_ONLY: Missing embassy_certificate');
  }

  // Verify certificate
  const verification = await verifyAgentCertificate(request.embassy_certificate);
  
  if (!verification.ok || !verification.valid) {
    throw new Error(`AGENT_ONLY: ${verification.reason || 'Invalid certificate'}`);
  }

  // Enforce agent-only
  enforceAgentOnly(verification);

  // Check registry status
  const registryStatus = await getRegistryStatus(request.agent_id);
  if (!registryStatus.exists || registryStatus.revoked) {
    throw new Error('AGENT_ONLY: Agent not found or revoked');
  }

  return {
    agent_id: request.agent_id,
    agent_verification: verification,
    embassy_certificate: request.embassy_certificate,
    embassy_visa: request.embassy_visa,
    request_id: request.request_id,
    timestamp: request.timestamp,
    data: request.data,
  };
}

/**
 * Create success response
 */
export function successResponse(
  data: any,
  receipt?: any,
  requestId?: string
): WorldAResponse {
  return {
    ok: true,
    request_id: requestId,
    data,
    receipt,
  };
}

/**
 * Create error response
 */
export function errorResponse(
  error: string,
  reason?: string,
  requestId?: string,
  extra?: Record<string, any>
): WorldAResponse {
  return {
    ok: false,
    request_id: requestId,
    error,
    reason,
    ...extra,
  };
}

/**
 * Wrapper for authenticated endpoints
 */
export function authenticatedHandler(
  handler: (req: AuthenticatedRequest, event: any) => Promise<WorldAResponse>
): Handler {
  return async (event, context) => {
    try {
      // Parse request
      const request = parseRequest(event);

      // Authenticate
      const authReq = await authenticateRequest(request);

      // Call handler
      const response = await handler(authReq, event);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
      };
    } catch (error: any) {
      return {
        statusCode: error.message?.startsWith('AGENT_ONLY') ? 403 : 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ok: false,
          error: error.message || 'Internal server error',
        }),
      };
    }
  };
}
