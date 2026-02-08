// Purpose: Mark notification as read
// POST /api/world/notifications/:id/read - Requires auth

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { queryOne, execute, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    // Authenticate
    const request = parseRequest(event);
    let auth;
    try {
      auth = await authenticateRequest(request);
    } catch (error: any) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('UNAUTHORIZED', error.message || 'Invalid credentials'))
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        ok: true,
        notification_id,
        read: true
      }))
    };
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', error.message))
    };
  }
};
