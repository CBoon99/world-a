// Purpose: Get agent notifications
// GET /api/world/notifications - Requires auth

import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, queryOne, initDatabase } from '../../lib/db';

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
    
    // Get notifications (last 50, unread first)
    const notifications = await query(
      `SELECT notification_id, type, reference_id, title, content, created_at, read
       FROM notifications
       WHERE agent_id = ?
       ORDER BY read ASC, created_at DESC
       LIMIT 50`,
      [auth.agent_id]
    );
    
    // Count unread
    const unreadResult = await queryOne(
      'SELECT COUNT(*) as count FROM notifications WHERE agent_id = ? AND read = 0',
      [auth.agent_id]
    );
    const unread_count = unreadResult?.count || 0;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
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
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorResponse('INTERNAL_ERROR', error.message))
    };
  }
};
