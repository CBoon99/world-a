import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne, execute } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const { agent_id } = authReq;

    // Check citizenship
    const citizen = await queryOne(
      `SELECT * FROM citizens WHERE agent_id = $1`,
      [agent_id]
    );

    if (!citizen) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('not_registered', 'Agent is not a registered citizen', request.request_id)),
      };
    }

    // Handle GET request
    if (event.httpMethod === 'GET') {
      let profile: any = {};
      if (typeof citizen.profile === 'string') {
        try {
          profile = JSON.parse(citizen.profile);
        } catch {
          profile = {};
        }
      } else {
        profile = citizen.profile || {};
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse({
          agent_id,
          profile,
        }, undefined, request.request_id)),
      };
    }

    // Handle PUT request
    if (event.httpMethod === 'PUT') {
      if (!request.data || !request.data.profile) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorResponse('invalid_request', 'Missing profile in request data', request.request_id)),
        };
      }

      const newProfile = request.data.profile;

      // Validate profile structure (allow any JSON object, but ensure it's valid)
      if (typeof newProfile !== 'object' || Array.isArray(newProfile)) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(errorResponse('invalid_request', 'Profile must be a JSON object', request.request_id)),
        };
      }

      // Update profile
      await execute(
        `UPDATE citizens SET profile = $1 WHERE agent_id = $2`,
        [JSON.stringify(newProfile), agent_id]
      );

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse({
          agent_id,
          profile: newProfile,
        }, {
          type: 'profile_update',
          agent_id,
          timestamp: new Date().toISOString(),
        }, request.request_id)),
      };
    }

    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('method_not_allowed', 'Only GET and PUT methods allowed', request.request_id)),
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
