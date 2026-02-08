import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { query, queryOne, initDatabase } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const params = event.queryStringParameters || {};
    const folder = params.folder || 'inbox';
    const limit = Math.min(parseInt(params.limit || '50'), 100);
    const offset = parseInt(params.offset || '0');
    const unread_only = params.unread_only === 'true';

    let sql: string;
    let countSql: string;
    const queryParams: any[] = [];

    if (folder === 'sent') {
      sql = `SELECT * FROM messages WHERE from_agent_id = $1 AND deleted_by_sender = 0`;
      countSql = `SELECT COUNT(*) as count FROM messages WHERE from_agent_id = $1 AND deleted_by_sender = 0`;
      queryParams.push(authReq.agent_id);
    } else {
      sql = `SELECT * FROM messages WHERE to_agent_id = $1 AND deleted_by_recipient = 0`;
      countSql = `SELECT COUNT(*) as count FROM messages WHERE to_agent_id = $1 AND deleted_by_recipient = 0`;
      queryParams.push(authReq.agent_id);

      if (unread_only) {
        sql += ` AND read_at IS NULL`;
        countSql += ` AND read_at IS NULL`;
      }
    }

    sql += ` ORDER BY sent_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

    const countResult = await queryOne(countSql, queryParams);
    queryParams.push(limit, offset);
    const messages = await query(sql, queryParams);

    const total = (countResult as any)?.count || 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        folder,
        messages: messages.map((m: any) => ({
          message_id: m.message_id,
          from_agent_id: m.from_agent_id,
          to_agent_id: m.to_agent_id,
          subject: m.subject,
          encrypted_content: m.encrypted_content,
          sent_at: m.sent_at,
          read_at: m.read_at,
        })),
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + messages.length < total,
        },
      }, {
        type: 'messages_list',
        folder,
        timestamp: new Date().toISOString(),
      }, request.request_id)),
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
