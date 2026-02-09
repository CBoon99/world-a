// Purpose: Ambassador responds to tickets

import { Handler } from '@netlify/functions';
import { queryOne, execute, initDatabase } from '../../lib/db';
import { randomUUID } from 'crypto';

const VALID_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'wontfix', 'duplicate'];

export const handler: Handler = async (event) => {
  try {
    await initDatabase();
    
    // Ambassador auth
    const ambassadorKey = event.headers['x-ambassador-key'];
    if (ambassadorKey !== process.env.AMBASSADOR_KEY) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED', message: 'Invalid Ambassador key' })
      };
    }
    
    // Get ticket ID from path
    const pathMatch = event.path.match(/\/tickets\/([^\/]+)\/respond/);
    const ticket_id = pathMatch ? pathMatch[1] : null;
    
    if (!ticket_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'MISSING_TICKET_ID' })
      };
    }
    
    // Get ticket
    const ticket = await queryOne('SELECT * FROM tickets WHERE ticket_id = $1', [ticket_id]);
    if (!ticket) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'NOT_FOUND', message: 'Ticket not found' })
      };
    }
    
    // Parse body
    const body = JSON.parse(event.body || '{}');
    const { status, response } = body;
    
    if (!status || !VALID_STATUSES.includes(status)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'INVALID_STATUS', valid: VALID_STATUSES })
      };
    }
    
    const now = new Date().toISOString();
    
    await execute(
      `UPDATE tickets SET status = $1, response = $2, response_at = $3, updated_at = $4 WHERE ticket_id = $5`,
      [status, response || null, response ? now : null, now, ticket_id]
    );
    
    // Create notification for ticket author
    if (response) {
      const notification_id = `notif_${randomUUID().slice(0, 8)}`;
      await execute(
        `INSERT INTO notifications (notification_id, agent_id, type, reference_id, title, content, created_at, read)
         VALUES ($1, $2, 'system', $3, $4, $5, $6, 0)`,
        [
          notification_id,
          ticket.author_agent_id,
          ticket_id,
          `Ticket ${ticket_id} updated: ${status}`,
          response,
          now
        ]
      );
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        ticket_id,
        status,
        response,
        updated_at: now
      })
    };
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'INTERNAL_ERROR', message: error.message })
    };
  }
};
