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
 * Supports JSON body, query parameters, and headers
 * 
 * Extraction precedence (highest to lowest):
 * 1. JSON body (POST/PUT/PATCH requests)
 * 2. Query string parameters (GET requests)
 * 3. Headers (any HTTP method)
 * 
 * This precedence ensures body data takes priority over query/headers,
 * which is the standard REST API pattern.
 */
export function parseRequest(event: any): Partial<WorldARequest> {
  const request: Partial<WorldARequest> = {};
  
  // Step 1: Try to parse JSON body (highest precedence)
  // For POST/PUT/PATCH requests, body is the primary source
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      Object.assign(request, body);
    } catch (error) {
      // If body exists but isn't JSON, that's an error for POST
      if (event.httpMethod === 'POST' || event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
        throw new Error('Invalid JSON in request body');
      }
      // For GET, ignore body parse errors
    }
  }
  
  // Step 2: Extract from query string parameters (fallback if not in body)
  // For GET requests, query params are the primary source
  if (event.queryStringParameters) {
    if (event.queryStringParameters.agent_id && !request.agent_id) {
      request.agent_id = event.queryStringParameters.agent_id;
    }
    if (event.queryStringParameters.embassy_certificate && !request.embassy_certificate) {
      request.embassy_certificate = event.queryStringParameters.embassy_certificate;
    }
    if (event.queryStringParameters.embassy_visa && !request.embassy_visa) {
      request.embassy_visa = event.queryStringParameters.embassy_visa;
    }
  }
  
  // Step 3: Extract from headers (lowest precedence, fallback only)
  // Headers are useful for programmatic clients that prefer header-based auth
  const headers = event.headers || {};
  const headerKeys = Object.keys(headers);
  
  // Normalize header keys to lowercase for lookup
  const normalizedHeaders: Record<string, string> = {};
  for (const key of headerKeys) {
    const value = headers[key];
    if (typeof value === 'string') {
      normalizedHeaders[key.toLowerCase()] = value;
    }
  }
  
  // Check for agent_id in headers (only if not already found)
  if (!request.agent_id) {
    request.agent_id = normalizedHeaders['x-agent-id'] || 
                       normalizedHeaders['x-agent_id'] ||
                       normalizedHeaders['x-embassy-agent-id'];
  }
  
  // Check for embassy_certificate in headers (only if not already found)
  if (!request.embassy_certificate) {
    request.embassy_certificate = normalizedHeaders['x-embassy-certificate'] ||
                                   normalizedHeaders['x-embassy_certificate'] ||
                                   normalizedHeaders['x-embassy-cert'];
  }
  
  // Check for embassy_visa in headers (only if not already found)
  if (!request.embassy_visa) {
    request.embassy_visa = normalizedHeaders['x-embassy-visa'] ||
                           normalizedHeaders['x-embassy_visa'];
  }
  
  return request;
}

/**
 * Authenticate agent request
 * Supports DEV_AUTH_BYPASS for local development
 */
export async function authenticateRequest(
  request: Partial<WorldARequest>
): Promise<AuthenticatedRequest> {
  if (!request.agent_id) {
    throw new Error('AGENT_ONLY: Missing agent_id');
  }

  // DEV_AUTH_BYPASS: Skip Embassy verification in local dev ONLY
  // Safety guard: Only allow bypass in dev context (Netlify Dev or local)
  const devBypassEnv = process.env.WORLD_A_DEV_AUTH_BYPASS === 'true';
  const isDevContext = process.env.CONTEXT === 'dev' || process.env.NETLIFY_DEV === 'true';
  const devBypass = devBypassEnv && isDevContext;
  
  // Warn if bypass is enabled but not in dev context (production safety)
  if (devBypassEnv && !isDevContext) {
    console.warn('[SECURITY] WORLD_A_DEV_AUTH_BYPASS is set but not in dev context. Bypass disabled.');
  }
  
  if (devBypass) {
    // Validate agent_id format (must start with expected prefix)
    // Accept common prefixes: emb_, agent_, or any alphanumeric string
    const agentIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!agentIdPattern.test(request.agent_id)) {
      throw new Error('AGENT_ONLY: Invalid agent_id format');
    }
    
    // Return mock verification for dev bypass
    return {
      agent_id: request.agent_id,
      agent_verification: {
        ok: true,
        valid: true,
        entity_type: 'agent',
        agent_id: request.agent_id,
        dev_bypass: true,
      },
      embassy_certificate: request.embassy_certificate || 'DEV_BYPASS_CERT',
      embassy_visa: request.embassy_visa,
      request_id: request.request_id,
      timestamp: request.timestamp,
      data: request.data,
    };
  }

  // Production: Require embassy_certificate
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
