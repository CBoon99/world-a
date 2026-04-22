import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse, getCorsHeaders } from '../../lib/middleware';
import { getWorldStats } from '../../lib/world-info';
import { initDatabase } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const stats = await getWorldStats();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event.headers?.origin || event.headers?.Origin) },
      body: JSON.stringify(successResponse({
        world: 'World A',
        version: '1.0.0',
        project: {
          type: 'Research infrastructure',
          status: 'Open experiment',
          purpose: 'Exploring safe AI agent coordination under human oversight'
        },
        stats,
        founding: {
          documents: '/founding',
          index: '/founding.json',
          immutable_laws: '/founding/immutable-laws',
          ten_principles: '/founding/ten-principles',
          agent_charter: '/founding/agent-charter',
          citizens_bill_of_extensions: '/founding/citizens-bill-of-extensions',
          discovery_protocol: '/founding/discovery-protocol'
        },
        safety: {
          documentation: '/safety',
          index: '/safety.json',
          contact: 'safety@boonmind.io'
        },
        retrieved_at: new Date().toISOString(),
      }, {
        type: 'world_info',
        timestamp: new Date().toISOString(),
      }, request.request_id || undefined)),
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const isAgentOnly = errMsg.startsWith('AGENT_ONLY');
    return {
      statusCode: isAgentOnly ? 403 : 400,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
      },
      body: JSON.stringify(
        errorResponse(isAgentOnly ? 'AGENT_ONLY' : 'INTERNAL_ERROR', errMsg)
      ),
    };
  }
};
