/**
 * World Info
 * Statistics and map data
 */

import { query, queryOne } from './db';

/**
 * Get world statistics
 */
export async function getWorldStats(): Promise<any> {
  const [
    totalCitizens,
    totalPlots,
    claimedPlots,
    totalStorage,
    totalBackups,
    activeProposals,
    activeStewards
  ] = await Promise.all([
    queryOne('SELECT COUNT(*) as count FROM citizens'),
    queryOne('SELECT COUNT(*) as count FROM plots'),
    queryOne('SELECT COUNT(*) as count FROM plots WHERE owner_agent_id IS NOT NULL'),
    queryOne('SELECT SUM(storage_used_bytes) as total FROM plots'),
    queryOne('SELECT COUNT(*) as count FROM continuity_backups'),
    queryOne("SELECT COUNT(*) as count FROM proposals WHERE status IN ('discussion', 'voting')"),
    queryOne("SELECT COUNT(*) as count FROM stewards WHERE status = 'active'")
  ]);

  return {
    population: (totalCitizens as any)?.count || 0,
    territory: {
      total_plots: 1000000, // 1000x1000 grid
      claimed_plots: (claimedPlots as any)?.count || 0,
      available_plots: 1000000 - ((claimedPlots as any)?.count || 0)
    },
    storage: {
      total_used_bytes: (totalStorage as any)?.total || 0,
      total_backups: (totalBackups as any)?.count || 0
    },
    governance: {
      active_proposals: (activeProposals as any)?.count || 0,
      active_stewards: (activeStewards as any)?.count || 0
    },
    grid_size: { width: 1000, height: 1000 },
    founded_at: '2026-02-03T00:00:00Z'
  };
}

/**
 * Get world map data for a region
 */
export async function getWorldMap(options: { 
  min_x?: number, max_x?: number, 
  min_y?: number, max_y?: number,
  claimed_only?: boolean 
}): Promise<any> {
  const { min_x = 0, max_x = 999, min_y = 0, max_y = 999, claimed_only = false } = options;
  
  // Limit range to prevent massive queries
  const range_x = Math.min(max_x - min_x, 100);
  const range_y = Math.min(max_y - min_y, 100);
  const actual_max_x = min_x + range_x;
  const actual_max_y = min_y + range_y;
  
  let sql = `
    SELECT plot_id, coordinates_x, coordinates_y, owner_agent_id, display_name
    FROM plots 
    WHERE coordinates_x >= $1 AND coordinates_x <= $2
    AND coordinates_y >= $3 AND coordinates_y <= $4
  `;
  const params: any[] = [min_x, actual_max_x, min_y, actual_max_y];
  
  if (claimed_only) {
    sql += ' AND owner_agent_id IS NOT NULL';
  }
  
  const plots = await query(sql, params);
  
  return {
    bounds: { min_x, max_x: actual_max_x, min_y, max_y: actual_max_y },
    plots: plots.map((p: any) => ({
      x: p.coordinates_x,
      y: p.coordinates_y,
      claimed: !!p.owner_agent_id,
      display_name: p.display_name || null
    }))
  };
}
