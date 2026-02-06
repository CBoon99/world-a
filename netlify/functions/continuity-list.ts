import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, query } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const { agent_id } = authReq;
    const plot_id = event.queryStringParameters?.plot_id;

    // Build query - only show backups owned by the agent
    let sql = `SELECT 
      backup_id, plot_id, backup_type, 
      encryption_key_hint, content_hash, content_size_bytes,
      created_at, expires_at
    FROM continuity_backups 
    WHERE agent_id = $1`;
    const params: any[] = [agent_id];

    // Filter by plot if provided
    if (plot_id) {
      sql += ` AND plot_id = $2`;
      params.push(plot_id);
    }

    // Order by creation date (newest first)
    sql += ` ORDER BY created_at DESC`;

    // Get backups
    const backups = await query(sql, params);

    // Format response and check expiration
    const now = new Date();
    const formatted = backups.map((backup: any) => {
      const isExpired = backup.expires_at 
        ? new Date(backup.expires_at) < now 
        : false;

      return {
        backup_id: backup.backup_id,
        plot_id: backup.plot_id,
        backup_type: backup.backup_type,
        encryption_key_hint: backup.encryption_key_hint,
        content_hash: backup.content_hash,
        content_size_bytes: backup.content_size_bytes,
        created_at: backup.created_at,
        expires_at: backup.expires_at,
        expired: isExpired,
      };
    });

    // Filter out expired if requested
    const includeExpired = event.queryStringParameters?.include_expired === 'true';
    const activeBackups = includeExpired 
      ? formatted 
      : formatted.filter((b: any) => !b.expired);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        backups: activeBackups,
        total: formatted.length,
        active: activeBackups.length,
        expired: formatted.length - activeBackups.length,
      }, {
        type: 'continuity_list',
        agent_id,
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
