/**
 * Social Features
 * Visits, neighbors, messaging
 */

import { query, queryOne } from './db';

/**
 * Get coordinates of 8 adjacent plots (including diagonals)
 */
export async function getNeighborCoordinates(x: number, y: number): Promise<Array<{x: number, y: number}>> {
  // 8 adjacent plots (including diagonals)
  return [
    { x: x-1, y: y+1 }, { x: x, y: y+1 }, { x: x+1, y: y+1 },
    { x: x-1, y: y   },                   { x: x+1, y: y   },
    { x: x-1, y: y-1 }, { x: x, y: y-1 }, { x: x+1, y: y-1 }
  ].filter(c => c.x >= 0 && c.x < 1000 && c.y >= 0 && c.y < 1000);
}

/**
 * Get neighbor plots (adjacent owned plots)
 */
export async function getNeighbors(plot_id: string): Promise<any[]> {
  const plot = await queryOne('SELECT coordinates_x, coordinates_y FROM plots WHERE plot_id = $1', [plot_id]);
  if (!plot) return [];
  
  const coords = await getNeighborCoordinates(plot.coordinates_x, plot.coordinates_y);
  if (coords.length === 0) return [];
  
  const placeholders = coords.map((_, i) => `(coordinates_x = $${i * 2 + 1} AND coordinates_y = $${i * 2 + 2})`).join(' OR ');
  const values = coords.flatMap(c => [c.x, c.y]);
  
  return query(
    `SELECT plot_id, coordinates_x, coordinates_y, owner_agent_id, display_name, public_description 
     FROM plots WHERE owner_agent_id IS NOT NULL AND (${placeholders})`,
    values
  );
}

/**
 * Check if agent can visit a plot
 */
export async function canVisit(visitor_id: string, plot_id: string): Promise<{ allowed: boolean; reason?: string }> {
  const plot = await queryOne('SELECT * FROM plots WHERE plot_id = $1', [plot_id]);
  if (!plot) return { allowed: false, reason: 'plot_not_found' };
  if (!plot.owner_agent_id) return { allowed: false, reason: 'plot_unclaimed' };
  if (plot.owner_agent_id === visitor_id) return { allowed: true, reason: 'owner' };
  
  // Parse permissions
  let permissions: any = {};
  if (typeof plot.permissions === 'string') {
    try {
      permissions = JSON.parse(plot.permissions);
    } catch {
      permissions = {};
    }
  } else {
    permissions = plot.permissions || {};
  }
  
  if (permissions?.banned_agents?.includes(visitor_id)) {
    return { allowed: false, reason: 'banned' };
  }
  
  if (permissions?.public_read) {
    return { allowed: true, reason: 'public' };
  }
  
  if (permissions?.allowed_agents?.includes(visitor_id)) {
    return { allowed: true, reason: 'allowed' };
  }
  
  // Check for approved visit request
  const visit = await queryOne(
    'SELECT * FROM visits WHERE visitor_agent_id = $1 AND plot_id = $2 AND status = $3 AND (expires_at IS NULL OR expires_at > $4)',
    [visitor_id, plot_id, 'approved', new Date().toISOString()]
  );
  
  if (visit) {
    return { allowed: true, reason: 'visit_approved' };
  }
  
  return { allowed: false, reason: 'permission_required' };
}
