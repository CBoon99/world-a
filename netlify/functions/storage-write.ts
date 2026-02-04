import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne, query } from '../../lib/db';
import { checkPermission } from '../../lib/permissions';
import { getStorage } from '../../lib/storage';
import crypto from 'crypto';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, data, request_id } = req;

  if (!data || !data.plot_id || !data.path || !data.content) {
    return errorResponse(
      'invalid_request',
      'Missing required fields: plot_id, path, content',
      request_id
    );
  }

  const { plot_id, path, content, content_type, permissions } = data;

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
    operation: 'write',
    requesting_agent_id: agent_id,
    visa: req.embassy_visa,
  });

  if (!permission.permitted) {
    return errorResponse('permission_denied', permission.reason, request_id);
  }

  // Verify plot exists
  const plot = await queryOne(
    `SELECT * FROM plots WHERE plot_id = ?`,
    [plot_id]
  );

  if (!plot) {
    return errorResponse('plot_not_found', 'Plot does not exist', request_id);
  }

  // Decode base64 content
  let contentBuffer: Buffer;
  try {
    contentBuffer = Buffer.from(content, 'base64');
  } catch (error) {
    return errorResponse('invalid_request', 'Content must be base64 encoded', request_id);
  }

  // Calculate hash
  const content_hash = crypto.createHash('sha256').update(contentBuffer).digest('hex');
  const content_size_bytes = contentBuffer.length;

  // Check storage quota (10MB per citizen)
  const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024; // 10MB per citizen
  
  // Get current usage for this agent across all their plots
  // We need to get all plots owned by this agent first
  const agentPlots = await query(
    `SELECT plot_id FROM plots WHERE owner_agent_id = ?`,
    [agent_id]
  );
  
  let usage: any = { bytes_used: 0 };
  if (agentPlots && agentPlots.length > 0) {
    const plotIds = agentPlots.map((p: any) => p.plot_id);
    const placeholders = plotIds.map(() => '?').join(',');
    usage = await queryOne(
      `SELECT COALESCE(SUM(content_size_bytes), 0) as bytes_used 
       FROM agent_storage WHERE plot_id IN (${placeholders})`,
      plotIds
    );
  }
  
  const currentUsage = parseInt(usage?.bytes_used || '0');
  
  // Check if updating existing file
  const existing = await queryOne(
    `SELECT * FROM agent_storage WHERE plot_id = ? AND path = ?`,
    [plot_id, path]
  );
  
  let sizeDelta = content_size_bytes;
  if (existing) {
    sizeDelta = content_size_bytes - (existing.content_size_bytes || 0);
  }
  
  if (currentUsage + sizeDelta > STORAGE_QUOTA_BYTES) {
    return errorResponse(
      'storage_quota_exceeded',
      `Storage quota is 10MB. You are using ${Math.round(currentUsage / 1024)}KB. This write would add ${Math.round(sizeDelta / 1024)}KB.`,
      request_id,
      {
        quota_bytes: STORAGE_QUOTA_BYTES,
        used_bytes: currentUsage,
        requested_bytes: sizeDelta
      }
    );
  }

  // Check storage quota (legacy plot-based check)
  const currentPlotUsage = plot.storage_used_bytes || 0;
  const allocationBytes = (plot.storage_allocation_gb || 1) * 1024 * 1024 * 1024;
  

  // Store in blob storage
  const storage = getStorage();
  const storage_id = existing?.storage_id || crypto.randomUUID();
  const content_ref = `${plot_id}/${storage_id}`;

  await storage.write(content_ref, contentBuffer);

  // Parse permissions
  let storagePermissions: any = permissions || {};
  if (typeof storagePermissions === 'string') {
    try {
      storagePermissions = JSON.parse(storagePermissions);
    } catch {
      storagePermissions = {};
    }
  }

  const now = new Date().toISOString();

  if (existing) {
    // Update existing
    await execute(
      `UPDATE agent_storage SET
        content_type = ?,
        content_hash = ?,
        content_size_bytes = ?,
        content_ref = ?,
        permissions = ?,
        updated_at = ?
      WHERE storage_id = ?`,
      [
        content_type || 'application/octet-stream',
        content_hash,
        content_size_bytes,
        content_ref,
        JSON.stringify(storagePermissions),
        now,
        storage_id,
      ]
    );
  } else {
    // Create new
    await execute(
      `INSERT INTO agent_storage (
        storage_id, plot_id, path,
        content_type, content_hash, content_size_bytes, content_ref,
        permissions, created_at, updated_at, created_by_agent_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storage_id,
        plot_id,
        path,
        content_type || 'application/octet-stream',
        content_hash,
        content_size_bytes,
        content_ref,
        JSON.stringify(storagePermissions),
        now,
        now,
        agent_id,
      ]
    );
  }

  // Update plot storage usage (legacy tracking)
  await execute(
    `UPDATE plots SET storage_used_bytes = ? WHERE plot_id = ?`,
    [currentPlotUsage + sizeDelta, plot_id]
  );

  return successResponse(
    {
      storage_id,
      plot_id,
      path,
      content_hash,
      content_size_bytes,
    },
    {
      type: 'storage_write',
      plot_id,
      path,
      storage_id,
      timestamp: now,
    },
    request_id
  );
});
