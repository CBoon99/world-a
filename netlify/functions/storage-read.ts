import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne } from '../../lib/db';
import { checkPermission } from '../../lib/permissions';
import { getStorage } from '../../lib/storage';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
  const { agent_id, data, request_id } = req;

  if (!data || !data.plot_id || !data.path) {
    return errorResponse(
      'invalid_request',
      'Missing required fields: plot_id, path',
      request_id
    );
  }

  const { plot_id, path } = data;

  // Check permission
  const permission = await checkPermission({
    plot_id,
    path,
    operation: 'read',
    requesting_agent_id: agent_id,
    visa: req.embassy_visa,
  });

  if (!permission.permitted) {
    return errorResponse('permission_denied', permission.reason, request_id);
  }

  // Get storage record
  const storage = await queryOne(
    `SELECT * FROM agent_storage WHERE plot_id = $1 AND path = $2`,
    [plot_id, path]
  );

  if (!storage) {
    return errorResponse('not_found', 'Storage item not found', request_id);
  }

  // Read from blob storage
  const blobStorage = getStorage();
  const content = await blobStorage.read(storage.content_ref);

  if (!content) {
    return errorResponse('storage_error', 'Content not found in blob storage', request_id);
  }

  // Return base64 encoded content
  const contentBase64 = content.toString('base64');

  return successResponse(
    {
      plot_id,
      path,
      content: contentBase64,
      content_type: storage.content_type,
      content_hash: storage.content_hash,
      content_size_bytes: storage.content_size_bytes,
      permissions_used: permission.reason,
    },
    undefined,
    request_id
  );
});
