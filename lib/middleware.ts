/**
 * Middleware for Netlify Functions
 * Handles authentication and request parsing
 */

import { Handler } from '@netlify/functions';
import { verifyAgentCertificate, getRegistryStatus } from './embassy-client';
import { WorldARequest, WorldAResponse, SuccessResponse, ErrorResponse } from './types';
import { EmbassySignedArtifact } from './types';

export interface AuthenticatedRequest {
  agent_id: string;
  agent_verification: any;
  embassy_certificate: EmbassySignedArtifact | any; // Certificate object (not string)
  embassy_visa?: EmbassySignedArtifact | any;
  request_id?: string;
  timestamp?: string;
  data?: any;
}

/**
 * CORS
 * - Origin is locked to your production domain.
 * - Include OPTIONS so browser preflight succeeds.
 * - Mirror the headers your client actually sends.
 */
export const CORS_ORIGIN = 'https://world-a.netlify.app';

export function getCorsHeaders(origin?: string) {
  // If you ever want to allow Netlify deploy previews, you can expand this later.
  // For now: locked to production origin.
  const allowOrigin = origin && origin === CORS_ORIGIN ? origin : CORS_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Id, X-Embassy-Certificate, X-Embassy-Visa',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export function corsPreflightResponse(event: any) {
  return {
    statusCode: 204,
    headers: {
      ...getCorsHeaders(event?.headers?.origin || event?.headers?.Origin),
      'Content-Type': 'text/plain',
    },
    body: '',
  };
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
  if (event.body) {
    try {
      const body = JSON.parse(event.body);
      Object.assign(request, body);
    } catch (error) {
      if (event.httpMethod === 'POST' || event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
        throw new Error('Invalid JSON in request body');
      }
    }
  }

  // Step 2: Extract from query string parameters (fallback if not in body)
  if (event.queryStringParameters) {
    if (event.queryStringParameters.agent_id && !request.agent_id) {
      request.agent_id = event.queryStringParameters.agent_id;
    }
    if (event.queryStringParameters.embassy_certificate && !request.embassy_certificate) {
      request.embassy_certificate = event.queryStringParameters.embassy_certificate as any;
    }
    if (event.queryStringParameters.embassy_visa && !request.embassy_visa) {
      request.embassy_visa = event.queryStringParameters.embassy_visa as any;
    }
  }

  // Step 3: Extract from headers (lowest precedence)
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

  if (!request.agent_id) {
    request.agent_id =
      normalizedHeaders['x-agent-id'] ||
      normalizedHeaders['x-agent_id'] ||
      normalizedHeaders['x-embassy-agent-id'];
  }

  if (!request.embassy_certificate) {
    request.embassy_certificate =
      normalizedHeaders['x-embassy-certificate'] ||
      normalizedHeaders['x-embassy_certificate'] ||
      normalizedHeaders['x-embassy-cert'];
  }

  if (!request.embassy_visa) {
    request.embassy_visa = normalizedHeaders['x-embassy-visa'] || normalizedHeaders['x-embassy_visa'];
  }

  // Normalize embassy_certificate: if it's a string, try to parse it as JSON
  if (request.embassy_certificate && typeof request.embassy_certificate === 'string') {
    try {
      request.embassy_certificate = JSON.parse(request.embassy_certificate);
    } catch (error) {
      // leave as string; validation will catch it
    }
  }

  // Normalize embassy_visa: if it's a string, try to parse it as JSON
  if (request.embassy_visa && typeof request.embassy_visa === 'string') {
    try {
      request.embassy_visa = JSON.parse(request.embassy_visa);
    } catch (error) {
      // leave as string; validation will catch it
    }
  }

  return request;
}

/**
 * Authenticate agent request
 * Supports DEV_AUTH_BYPASS for local development
 */
export async function authenticateRequest(request: Partial<WorldARequest>): Promise<AuthenticatedRequest> {
  if (!request.agent_id) {
    throw new Error('AGENT_ONLY: Missing agent_id');
  }

  // DEV_AUTH_BYPASS: Skip Embassy verification in local dev ONLY
  const devBypassEnv = process.env.WORLD_A_DEV_AUTH_BYPASS === 'true';
  const isDevContext = process.env.CONTEXT === 'dev' || process.env.NETLIFY_DEV === 'true';
  const devBypass = devBypassEnv && isDevContext;

  if (devBypassEnv && !isDevContext) {
    console.warn('[SECURITY] WORLD_A_DEV_AUTH_BYPASS is set but not in dev context. Bypass disabled.');
  }

  if (devBypass) {
    const agentIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!agentIdPattern.test(request.agent_id)) {
      throw new Error('AGENT_ONLY: Invalid agent_id format');
    }

    return {
      agent_id: request.agent_id,
      agent_verification: {
        ok: true,
        valid: true,
        agent_id: request.agent_id,
        dev_bypass: true,
      },
      embassy_certificate: request.embassy_certificate || 'DEV_BYPASS_CERT',
      embassy_visa: request.embassy_visa,
      request_id: (request as any).request_id,
      timestamp: (request as any).timestamp,
      data: (request as any).data,
    };
  }

  // Production: Require embassy_certificate
  if (!request.embassy_certificate) {
    throw new Error('AGENT_ONLY: Missing embassy_certificate');
  }

  // CRITICAL: Verify agent_id matches certificate BEFORE calling Embassy
  if (typeof request.embassy_certificate !== 'object' || !request.embassy_certificate.agent_id) {
    throw new Error('AGENT_ONLY: embassy_certificate must be a JSON object with agent_id');
  }

  if (request.embassy_certificate.agent_id !== request.agent_id) {
    throw new Error(
      `AGENT_ONLY: Certificate agent_id (${request.embassy_certificate.agent_id}) does not match requested agent_id (${request.agent_id})`
    );
  }

  // Agent-only policy: require agent_id prefix (emb_)
  if (!request.agent_id.startsWith('emb_')) {
    throw new Error('AGENT_ONLY: Invalid agent_id prefix (must start with emb_)');
  }

  // Verify certificate with Embassy (payload: { visa: <object> })
  const verification = await verifyAgentCertificate(request.embassy_certificate);

  if (!verification.ok || !verification.valid) {
    throw new Error(`AGENT_ONLY: ${verification.reason || 'Invalid certificate'}`);
  }


  return {
    agent_id: request.agent_id,
    agent_verification: verification,
    embassy_certificate: request.embassy_certificate,
    embassy_visa: request.embassy_visa,
    request_id: (request as any).request_id,
    timestamp: (request as any).timestamp,
    data: (request as any).data,
  };
}

/**
 * Create success response
 */
export function successResponse<T = any>(data: T, receipt?: any, requestId?: string): SuccessResponse<T> {
  return {
    ok: true,
    request_id: requestId,
    data,
    receipt,
  };
}

/**
 * Create error response with structured format
 * All errors should use this format: { ok: false, code, message, hint }
 */
export function errorResponse(
  code: string,
  message?: string,
  requestId?: string,
  extra?: Record<string, any>
): ErrorResponse {
  const hints: Record<string, string> = {
    AGENT_ONLY: 'This endpoint requires valid agent authentication',
    UNAUTHORIZED: 'Authentication required',
    PERMISSION_DENIED: 'You do not have permission for this action',
    NOT_FOUND: 'The requested resource was not found',
    VALIDATION_ERROR: 'Request validation failed',
    RATE_LIMIT: 'Rate limit exceeded',
    DATABASE_ERROR: 'Database operation failed',
    INTERNAL_ERROR: 'An internal error occurred',
  };

  return {
    ok: false,
    request_id: requestId,
    error: code,
    message: message || code,
    hint: hints[code] || 'See error code for details',
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
    // ✅ Always answer preflight FIRST (before any auth/method gates)
    if (event.httpMethod === 'OPTIONS') {
      return corsPreflightResponse(event);
    }

    const cors = getCorsHeaders(event?.headers?.origin || event?.headers?.Origin);

    try {
      const request = parseRequest(event);
      const authReq = await authenticateRequest(request);
      const response = await handler(authReq, event);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...cors,
        },
        body: JSON.stringify(response),
      };
    } catch (error: any) {
      console.error('[AUTH_ERROR]', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      let statusCode = 500;
      if (error.message?.startsWith('AGENT_ONLY')) {
        statusCode = 403;
      } else if (error.message?.includes('UNAUTHORIZED') || error.message?.includes('Missing')) {
        statusCode = 401;
      } else if (error.message?.includes('NOT_FOUND')) {
        statusCode = 404;
      } else if (error.message?.includes('VALIDATION') || error.message?.includes('Invalid')) {
        statusCode = 400;
      }

      const errorCode = error.message?.startsWith('AGENT_ONLY')
        ? 'AGENT_ONLY'
        : error.message?.includes('UNAUTHORIZED')
        ? 'UNAUTHORIZED'
        : 'INTERNAL_ERROR';

      const errorResp = errorResponse(errorCode, error.message || 'Internal server error', undefined, {
        ...(process.env.NETLIFY_DEV === 'true' ? { stack: error.stack } : {}),
      });

      return {
        statusCode,
        headers: {
          'Content-Type': 'application/json',
          ...cors,
        },
        body: JSON.stringify(errorResp),
      };
    }
  };
}
