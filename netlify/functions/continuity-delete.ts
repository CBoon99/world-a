import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne, execute } from '../../lib/db';
import { getStorage } from '../../lib/storage';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Extract backup_id from path
    const pathMatch = event.path.match(/\/continuity\/([^\/]+)/);
    const backup_id = pathMatch ? pathMatch[1] : null;

    if (!backup_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'Missing backup_id', undefined)),
      };
    }

    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    // Get backup record
    const backup = await queryOne(
      `SELECT * FROM continuity_backups WHERE backup_id = $1`,
      [backup_id]
    );

    if (!backup) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('backup_not_found', 'Backup does not exist', request.request_id)),
      };
    }

    // Verify agent owns this backup
    if (backup.agent_id !== authReq.agent_id) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('permission_denied', 'Only the backup owner can delete their backup', request.request_id)),
      };
    }

    // Delete from blob storage
    const storage = getStorage();
    if (backup.encrypted_content_ref) {
      try {
        await storage.delete(backup.encrypted_content_ref);
      } catch (error) {
        // Log but continue - blob might already be deleted
        console.warn('Blob deletion warning:', error);
      }
    }

    // Delete from database
    await execute(
      `DELETE FROM continuity_backups WHERE backup_id = $1`,
      [backup_id]
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse({
        backup_id,
        deleted: true,
      }, {
        type: 'purge_receipt',
        backup_id,
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
