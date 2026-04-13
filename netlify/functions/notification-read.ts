// Purpose: Mark notification as read
// POST /api/world/notifications/:id/read - Requires auth

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse, corsPreflightResponse, getCorsHeaders } from '../../lib/middleware';
import { queryOne, execute, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflightResponse(event);
  }

  try {
    await initDatabase();
    
    // Authenticate
    const request = parseRequest(event);
    let auth;
    try {
      auth = await authenticateRequest(request);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
        },
        body: JSON.stringify(errorResponse('UNAUTHORIZED', errMsg || 'Invalid credentials'))
      };
    }
    
    // Extract notification ID from path
    const pathParts = event.path.split('/').filter(Boolean);
    const notification_id = pathParts[pathParts.length - 2]; // .../notifications/:id/read
    
    if (!notification_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('MISSING_PARAM', 'notification_id required'))
      };
    }
    
    // Verify notification belongs to authenticated agent
    const notification = await queryOne(
      'SELECT * FROM notifications WHERE notification_id = $1 AND agent_id = $2',
      [notification_id, auth.agent_id]
    );
    
    if (!notification) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('NOT_FOUND', 'Notification not found'))
      };
    }
    
    // Mark as read
    await execute(
      'UPDATE notifications SET read = 1 WHERE notification_id = $1',
      [notification_id]
    );
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event.headers?.origin || event.headers?.Origin) },
      body: JSON.stringify(successResponse({
        notification_id,
        read: true
      }))
    };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
      },
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', errMsg))
    };
  }
};
