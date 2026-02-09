/**
 * Permission Checking Logic
 * Implements the permission hierarchy from the spec
 */

import { queryOne } from './db';
import crypto from 'crypto';

export interface PermissionRequest {
  plot_id: string;
  path?: string;
  operation: 'read' | 'write' | 'delete';
  requesting_agent_id: string;
  visa?: any;
}

export interface PermissionResult {
  permitted: boolean;
  reason: string;
}

/**
 * Check if an agent has permission to perform an operation
 */
export async function checkPermission(
  request: PermissionRequest
): Promise<PermissionResult> {
  const { plot_id, path, operation, requesting_agent_id, visa } = request;

  // 1. Get plot ownership
  const plot = await queryOne(
    `SELECT * FROM plots WHERE plot_id = $1`,
    [plot_id]
  );

  if (!plot) {
    // Log trespass for accessing non-existent plot
    logTrespass(requesting_agent_id, plot_id, operation, 'plot_not_found').catch(err => {
      console.error('Failed to log trespass:', err);
    });
    return { permitted: false, reason: 'plot_not_found' };
  }

  // Parse permissions JSON (PostgreSQL JSONB)
  let plotPermissions: any = {};
  if (typeof plot.permissions === 'string') {
    try {
      plotPermissions = JSON.parse(plot.permissions);
    } catch {
      plotPermissions = {};
    }
  } else {
    plotPermissions = plot.permissions || {};
  }

  // 2. Owner always has access
  if (plot.owner_agent_id === requesting_agent_id) {
    return { permitted: true, reason: 'owner' };
  }

  // 3. Check if banned
  if (plotPermissions.banned_agents?.includes(requesting_agent_id)) {
    // Log trespass for banned agent
    logTrespass(requesting_agent_id, plot_id, operation, 'banned').catch(err => {
      console.error('Failed to log trespass:', err);
    });
    return { permitted: false, reason: 'banned' };
  }

  // 4. Check public access
  if (operation === 'read' && plotPermissions.public_read) {
    return { permitted: true, reason: 'public_read' };
  }

  if (operation === 'write' && plotPermissions.public_write) {
    return { permitted: true, reason: 'public_write' };
  }

  // 5. Check allowed list
  if (plotPermissions.allowed_agents?.includes(requesting_agent_id)) {
    return { permitted: true, reason: 'allowed_agent' };
  }

  // 6. Check visa (if provided)
  if (visa) {
    // Visa verification would be done via Embassy
    // For now, we'll check if visa scope includes the operation
    if (visa.scope && visa.scope.includes(`${operation}:${plot_id}`)) {
      return { permitted: true, reason: 'visa' };
    }
  }

  // 7. Check path-specific permissions (if path provided)
  if (path) {
    const pathStorage = await queryOne(
      `SELECT permissions FROM agent_storage WHERE plot_id = $1 AND path = $2`,
      [plot_id, path]
    );

    if (pathStorage) {
      let pathPermissions: any = {};
      if (typeof pathStorage.permissions === 'string') {
        try {
          pathPermissions = JSON.parse(pathStorage.permissions);
        } catch {
          pathPermissions = {};
        }
      } else {
        pathPermissions = pathStorage.permissions || {};
      }

      // Apply path-specific permission checks
      if (pathPermissions.banned_agents?.includes(requesting_agent_id)) {
        // Log trespass for banned agent on path
        logTrespass(requesting_agent_id, plot_id, operation, 'banned_path').catch(err => {
          console.error('Failed to log trespass:', err);
        });
        return { permitted: false, reason: 'banned_path' };
      }

      if (operation === 'read' && pathPermissions.public_read) {
        return { permitted: true, reason: 'public_read_path' };
      }

      if (operation === 'write' && pathPermissions.public_write) {
        return { permitted: true, reason: 'public_write_path' };
      }

      if (pathPermissions.allowed_agents?.includes(requesting_agent_id)) {
        return { permitted: true, reason: 'allowed_agent_path' };
      }
    }
  }

  // 8. Default deny - log trespass (fire and forget, don't block response)
  logTrespass(requesting_agent_id, plot_id, operation, 'no_permission').catch(err => {
    console.error('Failed to log trespass:', err);
  });
  return { permitted: false, reason: 'no_permission' };
}

/**
 * Log trespass attempt
 */
export async function logTrespass(
  agent_id: string,
  plot_id: string,
  operation: string,
  reason: string
): Promise<any> {
  const receipt_id = `tres_${crypto.randomUUID().substring(0, 8)}`;
  const now = new Date().toISOString();

  // Could store in a trespass_log table in the future
  // For now, just return receipt (can be logged by calling endpoint)
  return {
    type: 'trespass_receipt',
    receipt_id,
    agent_id,
    plot_id,
    operation,
    reason,
    severity: 'Warning',
    timestamp: now,
  };
}

/**
 * Enforce agent-only access (human exclusion)
 * 
 * Note: Embassy /api/verify does not return entity_type or agent_id.
 * Agent_id binding is enforced in middleware.ts BEFORE calling Embassy.
 * This function only validates that verification succeeded.
 */
export function enforceAgentOnly(verification: any): void {
  if (!verification || !verification.valid) {
    throw new Error('AGENT_ONLY: Invalid certificate');
  }
  
  // Embassy verify returns { ok: true, reason: "verified", ... } on success
  // We check verification.valid === true (set by verifyAgentCertificate)
  // Agent_id format and binding are checked in middleware.ts before Embassy call
}
