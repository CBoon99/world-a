// Purpose: Get agent notifications
// GET /api/world/notifications - Requires auth

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse, getCorsHeaders } from '../../lib/middleware';
import { query, queryOne, initDatabase } from '../../lib/db';

export const handler: Handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin;
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
          ...getCorsHeaders(origin),
        },
        body: JSON.stringify(errorResponse('UNAUTHORIZED', errMsg || 'Invalid credentials'))
      };
    }
    
    // Get notifications (last 50, unread first)
    const notifications = await query(
      `SELECT notification_id, type, reference_id, title, content, created_at, read
       FROM notifications
       WHERE agent_id = $1
       ORDER BY read ASC, created_at DESC
       LIMIT 50`,
      [auth.agent_id]
    );
    
    // Count unread
    const unreadResult = await queryOne(
      'SELECT COUNT(*) as count FROM notifications WHERE agent_id = $1 AND read = 0',
      [auth.agent_id]
    );
    const unread_count = unreadResult?.count || 0;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(event.headers?.origin || event.headers?.Origin) },
      body: JSON.stringify(successResponse({
        ok: true,
        unread_count,
        notifications: notifications.map((n: any) => ({
          notification_id: n.notification_id,
          type: n.type,
          reference_id: n.reference_id,
          title: n.title,
          content: n.content,
          created_at: n.created_at,
          read: !!n.read
        }))
      }))
    };
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      },
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', errMsg))
    };
  }
};
