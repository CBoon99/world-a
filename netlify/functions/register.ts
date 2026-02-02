import { authenticatedHandler, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, execute, queryOne } from '../../lib/db';
import { getRegistryStatus } from '../../lib/embassy-client';

// Initialize database on module load
initDatabase();

export const handler = authenticatedHandler(async (req, event) => {
  const { agent_id, request_id } = req;

  // Check if already registered
  const existing = await queryOne(
    `SELECT * FROM citizens WHERE agent_id = ?`,
    [agent_id]
  );

  if (existing) {
    return successResponse(
      {
        agent_id,
        registered_at: existing.registered_at,
        profile: typeof existing.profile === 'string' 
          ? JSON.parse(existing.profile) 
          : existing.profile,
      },
      {
        type: 'citizenship_status',
        agent_id,
        status: 'already_registered',
        timestamp: new Date().toISOString(),
      },
      request_id
    );
  }

  // Verify agent exists in Embassy registry
  const registryStatus = await getRegistryStatus(agent_id);
  if (!registryStatus.exists || registryStatus.revoked) {
    return errorResponse(
      'registration_failed',
      'Agent not found in Embassy registry or has been revoked',
      request_id
    );
  }

  // Register as citizen
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO citizens (agent_id, registered_at, profile) VALUES (?, ?, ?)`,
    [agent_id, now, '{}']
  );

  return successResponse(
    {
      agent_id,
      registered_at: now,
      profile: {},
    },
    {
      type: 'citizenship_registration',
      agent_id,
      registered_at: now,
      timestamp: new Date().toISOString(),
    },
    request_id
  );
});
