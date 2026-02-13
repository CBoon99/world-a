import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, corsPreflightResponse } from '../../lib/middleware';
import { initDatabase } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  // Handle OPTIONS preflight FIRST (before any auth/method gates)
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflightResponse(event);
  }

  await initDatabase();
  
  try {
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);
    
    const devBypass = process.env.WORLD_A_DEV_AUTH_BYPASS === 'true';
    
    // Extract headers (normalized to lowercase)
    const headers = event.headers || {};
    const normalizedHeaders: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
      const value = headers[key];
      if (typeof value === 'string') {
        normalizedHeaders[key.toLowerCase()] = value;
      }
    }
    
    // Get relevant headers (don't expose all headers for security)
    const relevantHeaders: Record<string, string> = {};
    const headerKeys = ['x-agent-id', 'x-agent_id', 'x-embassy-certificate', 'x-embassy_certificate', 'x-embassy-visa', 'x-embassy_visa'];
    for (const key of headerKeys) {
      if (normalizedHeaders[key]) {
        relevantHeaders[key] = normalizedHeaders[key];
      }
    }
    
    // Mask certificate in response (only show last 6 chars if dev bypass)
    let certificatePreview = '';
    if (request.embassy_certificate) {
      const cert = request.embassy_certificate;
      if (devBypass && cert.length > 6) {
        certificatePreview = `...${cert.slice(-6)}`;
      } else {
        certificatePreview = '***REDACTED***';
      }
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        agent_id: authReq.agent_id,
        has_certificate: !!request.embassy_certificate,
        certificate_preview: certificatePreview,
        method: event.httpMethod,
        query_seen: event.queryStringParameters || {},
        headers_seen: relevantHeaders,
        dev_bypass: devBypass,
        verification: {
          ok: authReq.agent_verification.ok,
          valid: authReq.agent_verification.valid,
          dev_bypass: authReq.agent_verification.dev_bypass || false,
        },
      }),
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
        method: event.httpMethod,
        query_seen: event.queryStringParameters || {},
      }),
    };
  }
};
