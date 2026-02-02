import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, query } from '../../lib/db';
import { checkPermission } from '../../lib/permissions';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, data, request_id } = req;

  if (!data || !data.plot_id) {
    return errorResponse(
      'invalid_request',
      'Missing required field: plot_id',
      request_id
    );
  }

  const { plot_id, path } = data;
  const listPath = path || '/';

  // Validate path
  if (!listPath.startsWith('/')) {
    return errorResponse(
      'invalid_request',
      'Path must start with /',
      request_id
    );
  }

  // Check permission to list (read permission)
  const permission = await checkPermission({
    plot_id,
    path: listPath,
    operation: 'read',
    requesting_agent_id: agent_id,
    visa: req.embassy_visa,
  });

  if (!permission.permitted) {
    return errorResponse('permission_denied', permission.reason, request_id);
  }

  // Query storage items
  let items: any[];
  if (listPath === '/') {
    items = await query(
      `SELECT * FROM agent_storage 
       WHERE plot_id = ? 
       AND path LIKE '/%' 
       AND path NOT LIKE '/%/%'
       ORDER BY path`,
      [plot_id]
    );
  } else {
    // List direct children of the path
    // e.g., if path is '/home', list '/home/room1', '/home/room2' but not '/home/room1/file'
    const childPath = `${listPath}/`;
    items = await query(
      `SELECT * FROM agent_storage 
       WHERE plot_id = ? 
       AND path LIKE ? 
       AND path NOT LIKE ?
       ORDER BY path`,
      [plot_id, `${childPath}%`, `${childPath}%/%`]
    );
  }

  // Format response
  const formatted = items.map((item: any) => {
    // Parse permissions
    let permissions: any = {};
    if (typeof item.permissions === 'string') {
      try {
        permissions = JSON.parse(item.permissions);
      } catch {
        permissions = {};
      }
    } else {
      permissions = item.permissions || {};
    }

    return {
      path: item.path,
      content_type: item.content_type,
      content_size_bytes: item.content_size_bytes,
      content_hash: item.content_hash,
      created_at: item.created_at,
      updated_at: item.updated_at,
      permissions: permissions,
      // Only show full permissions to owner
      ...(item.created_by_agent_id === agent_id ? {
        created_by_agent_id: item.created_by_agent_id,
      } : {}),
    };
  });

  // Also check for subdirectories (paths that are children but not direct files)
  const subdirs: string[] = [];
  if (listPath === '/') {
    const allItems = await query(
      `SELECT DISTINCT path FROM agent_storage 
       WHERE plot_id = ? 
       AND path LIKE '/%/%'
       ORDER BY path`,
      [plot_id]
    );
    
    // Extract first-level directories
    const seen = new Set<string>();
    for (const item of allItems) {
      const parts = (item as any).path.split('/').filter((p: string) => p);
      if (parts.length > 0) {
        const firstDir = `/${parts[0]}`;
        if (!seen.has(firstDir)) {
          seen.add(firstDir);
          subdirs.push(firstDir);
        }
      }
    }
  } else {
    const allItems = await query(
      `SELECT DISTINCT path FROM agent_storage 
       WHERE plot_id = ? 
       AND path LIKE ?
       ORDER BY path`,
      [plot_id, `${listPath}/%`]
    );
    
    // Extract immediate subdirectories
    const prefix = listPath.endsWith('/') ? listPath : `${listPath}/`;
    const seen = new Set<string>();
    for (const item of allItems) {
      const path = (item as any).path;
      if (path.startsWith(prefix)) {
        const relative = path.substring(prefix.length);
        const parts = relative.split('/');
        if (parts.length > 1) {
          const subdir = `${prefix}${parts[0]}`;
          if (!seen.has(subdir)) {
            seen.add(subdir);
            subdirs.push(subdir);
          }
        }
      }
    }
  }

  return successResponse(
    {
      plot_id,
      path: listPath,
      items: formatted,
      subdirectories: subdirs,
      count: formatted.length,
    },
    {
      type: 'storage_list',
      plot_id,
      path: listPath,
      timestamp: new Date().toISOString(),
    },
    request_id
  );
});
