import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { checkPermission } from '../../lib/permissions';
import { getStorage } from '../../lib/storage';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, data, request_id } = req;

  if (!data || !data.plot_id || !data.path) {
    return errorResponse(
      'invalid_request',
      'Missing required fields: plot_id, path',
      request_id
    );
  }

  const { plot_id, path } = data;

  // Validate path
  if (!path.startsWith('/')) {
    return errorResponse(
      'invalid_request',
      'Path must start with /',
      request_id
    );
  }

  // Check permission
  const permission = await checkPermission({
    plot_id,
    path,
    operation: 'delete',
    requesting_agent_id: agent_id,
    visa: req.embassy_visa,
  });

  if (!permission.permitted) {
    return errorResponse('permission_denied', permission.reason, request_id);
  }

  // Get storage record
  const storage = await queryOne(
    `SELECT * FROM agent_storage WHERE plot_id = ? AND path = ?`,
    [plot_id, path]
  );

  if (!storage) {
    return errorResponse('not_found', 'Storage item not found', request_id);
  }

  // Verify plot exists
  const plot = await queryOne(
    `SELECT * FROM plots WHERE plot_id = ?`,
    [plot_id]
  );

  if (!plot) {
    return errorResponse('plot_not_found', 'Plot does not exist', request_id);
  }

  // Delete from blob storage
  const blobStorage = getStorage();
  if (storage.content_ref) {
    try {
      await blobStorage.delete(storage.content_ref);
    } catch (error) {
      // Log but continue - blob might already be deleted
      console.warn('Blob deletion warning:', error);
    }
  }

  // Delete from database
  await execute(
    `DELETE FROM agent_storage WHERE storage_id = ?`,
    [storage.storage_id]
  );

  // Update plot storage usage
  const sizeDelta = storage.content_size_bytes || 0;
  const newUsage = Math.max(0, (plot.storage_used_bytes || 0) - sizeDelta);
  
  await execute(
    `UPDATE plots SET storage_used_bytes = ? WHERE plot_id = ?`,
    [newUsage, plot_id]
  );

  return successResponse(
    {
      plot_id,
      path,
      deleted: true,
      storage_id: storage.storage_id,
      freed_bytes: sizeDelta,
    },
    {
      type: 'storage_delete',
      plot_id,
      path,
      storage_id: storage.storage_id,
      timestamp: new Date().toISOString(),
    },
    request_id
  );
});
