/**
 * Netlify Functions API v2 adapter: Web Request/Response + Blobs context,
 * reusing v1 parseRequest / authenticateRequest without modifying middleware.ts.
 */

import {
  parseRequest,
  authenticateRequest,
  corsPreflightResponse,
  getCorsHeaders,
  errorResponse,
  type AuthenticatedRequest,
} from './middleware';

async function requestToEventLike(req: Request): Promise<any> {
  const url = new URL(req.url);

  let queryStringParameters: Record<string, string> | null = null;
  if (url.search) {
    queryStringParameters = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (queryStringParameters[key] === undefined) {
        queryStringParameters[key] = value;
      }
    }
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const method = req.method.toUpperCase();
  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await req.text();
  }

  return {
    httpMethod: method,
    headers,
    queryStringParameters,
    body,
    path: url.pathname,
    rawUrl: req.url,
    isBase64Encoded: false,
  };
}

export function authenticatedHandlerV2(
  handler: (req: AuthenticatedRequest, event: any) => Promise<any>
) {
  return async (req: Request, _context: any): Promise<Response> => {
    const eventLike = await requestToEventLike(req);

    if (req.method === 'OPTIONS') {
      const preflight = corsPreflightResponse(eventLike);
      return new Response(preflight.body, {
        status: preflight.statusCode,
        headers: preflight.headers as HeadersInit,
      });
    }

    const cors = getCorsHeaders(
      (eventLike.headers['origin'] || eventLike.headers['Origin']) as string | undefined
    );

    try {
      const request = parseRequest(eventLike);
      const authReq = await authenticateRequest(request);
      const response = await handler(authReq, eventLike);

      const isLambdaShape =
        response &&
        typeof response === 'object' &&
        typeof (response as { statusCode?: unknown }).statusCode === 'number' &&
        typeof (response as { body?: unknown }).body === 'string';

      if (isLambdaShape) {
        const r = response as { statusCode: number; headers?: Record<string, string>; body: string };
        return new Response(r.body, {
          status: r.statusCode,
          headers: {
            ...(r.headers || {}),
            ...cors,
          },
        });
      }

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...cors,
        },
      });
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

      return new Response(JSON.stringify(errorResp), {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          ...cors,
        },
      });
    }
  };
}
