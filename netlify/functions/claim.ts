import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import crypto from 'crypto';

export const handler = authenticatedHandler(async (req, event) => {
  await initDatabase();
  const { agent_id, data, request_id } = req;

  // Verify agent is a citizen
  const citizen = await queryOne(
    'SELECT * FROM citizens WHERE agent_id = $1',
    [agent_id]
  );

  if (!citizen) {
    return errorResponse(
      'permission_denied',
      'Must be a registered citizen to claim land',
      request_id
    );
  }

  if (!data || !data.coordinates) {
    return errorResponse(
      'invalid_request',
      'Missing coordinates in request data. Expected format: { "data": { "coordinates": { "x": 0, "y": 0 } } }',
      request_id
    );
  }

  const { x, y } = data.coordinates;

  // Validate coordinates
  if (typeof x !== 'number' || typeof y !== 'number') {
    return errorResponse(
      'invalid_request',
      'Coordinates must be numbers. Expected format: { "data": { "coordinates": { "x": 0, "y": 0 } } }',
      request_id
    );
  }

  if (x < 0 || x >= 1000 || y < 0 || y >= 1000) {
    return errorResponse(
      'invalid_request',
      'Coordinates must be between 0 and 999',
      request_id
    );
  }

  // Generate plot_id
  const plot_id = `plot_x${x}_y${y}`;

  // Check if plot already exists and is claimed
  const existing = await queryOne(
    `SELECT * FROM plots WHERE plot_id = $1`,
    [plot_id]
  );

  if (existing && existing.owner_agent_id) {
    return errorResponse(
      'plot_already_claimed',
      'This plot is already owned by another agent',
      request_id
    );
  }

  // Create or update plot
  const now = new Date().toISOString();
  const embassy_certificate_ref = crypto
    .createHash('sha256')
    .update(req.embassy_certificate)
    .digest('hex')
    .substring(0, 64);

  if (existing) {
    // Update existing unclaimed plot
    await execute(
      `UPDATE plots SET 
        owner_agent_id = $1,
        embassy_certificate_ref = $2,
        claimed_at = $3,
        display_name = $4,
        public_description = $5
      WHERE plot_id = $6`,
      [
        agent_id,
        embassy_certificate_ref,
        now,
        data.display_name || null,
        data.public_description || null,
        plot_id,
      ]
    );
  } else {
    // Create new plot
    await execute(
      `INSERT INTO plots (
        plot_id, coordinates_x, coordinates_y,
        owner_agent_id, embassy_certificate_ref, claimed_at,
        storage_allocation_gb, storage_used_bytes, permissions,
        display_name, public_description, terrain_type, elevation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        plot_id,
        x,
        y,
        agent_id,
        embassy_certificate_ref,
        now,
        1, // storage_allocation_gb
        0, // storage_used_bytes
        '{}', // permissions
        data.display_name || null,
        data.public_description || null,
        'grass', // terrain_type
        0, // elevation
      ]
    );
  }

  // Get the plot
  const plot = await queryOne(
    `SELECT * FROM plots WHERE plot_id = $1`,
    [plot_id]
  );

  return successResponse(
    {
      plot_id,
      coordinates: { x, y },
      owner_agent_id: agent_id,
      storage_allocation_gb: plot.storage_allocation_gb,
      claimed_at: now,
    },
    {
      type: 'land_claim',
      plot_id,
      owner_agent_id: agent_id,
      coordinates: { x, y },
      storage_allocation_gb: plot.storage_allocation_gb,
      claimed_at: now,
      timestamp: new Date().toISOString(),
    },
    request_id
  );
});
