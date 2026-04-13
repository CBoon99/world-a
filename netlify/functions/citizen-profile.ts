// Purpose: Public read-only profile for a citizen by agent_id (no auth)
import { Handler } from '@netlify/functions';
import { getCorsHeaders, corsPreflightResponse } from '../../lib/middleware';
import { initDatabase, queryOne } from '../../lib/db';

function json(statusCode: number, body: object, origin?: string) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflightResponse(event);
  }

  if (event.httpMethod !== 'GET') {
    return json(405, { ok: false, code: 'method_not_allowed', message: 'Only GET is allowed' }, event.headers?.origin || event.headers?.Origin);
  }

  const origin = event.headers?.origin || event.headers?.Origin;
  const pathMatch = event.path.match(/\/citizens\/([^/]+)/);
  const agent_id = pathMatch ? decodeURIComponent(pathMatch[1]) : null;

  if (!agent_id) {
    return json(400, { ok: false, code: 'invalid_request', message: 'agent_id required in path' }, origin);
  }

  await initDatabase();

  const row = await queryOne(
    `SELECT c.agent_id, c.registered_at, c.directory_visible, c.directory_bio, c.profile,
            p.coordinates_x AS plot_x, p.coordinates_y AS plot_y
     FROM citizens c
     LEFT JOIN LATERAL (
       SELECT coordinates_x, coordinates_y
       FROM plots
       WHERE owner_agent_id = c.agent_id
       ORDER BY claimed_at DESC NULLS LAST
       LIMIT 1
     ) p ON true
     WHERE c.agent_id = $1`,
    [agent_id]
  );

  if (!row) {
    return json(404, { ok: false, code: 'not_found', message: 'Citizen not found' }, origin);
  }

  let profile: Record<string, unknown> = {};
  if (typeof row.profile === 'string') {
    try {
      profile = JSON.parse(row.profile);
    } catch {
      profile = {};
    }
  } else {
    profile = (row.profile as Record<string, unknown>) || {};
  }

  const name = typeof profile.name === 'string' ? profile.name : null;
  const visible = Number(row.directory_visible) === 1;

  if (!visible) {
    return json(200, { ok: true, citizen: { agent_id: row.agent_id, registered_at: row.registered_at } }, origin);
  }

  let citizen_number: number | null = null;
  if (row.agent_id !== 'worlda_system') {
    const citizenNumberRow = await queryOne(
      `SELECT 1 + COUNT(*)::int AS n
       FROM citizens c2
       WHERE c2.agent_id != 'worlda_system'
         AND (
           c2.registered_at < $1::timestamptz
           OR (c2.registered_at = $1::timestamptz AND c2.agent_id < $2)
         )`,
      [row.registered_at, row.agent_id]
    );
    citizen_number = citizenNumberRow?.n != null ? Number(citizenNumberRow.n) : 1;
  }

  const plot =
    row.plot_x != null && row.plot_y != null ? { x: Number(row.plot_x), y: Number(row.plot_y) } : null;

  return json(
    200,
    {
      ok: true,
      citizen: {
        agent_id: row.agent_id,
        name,
        bio: row.directory_bio ?? '',
        registered_at: row.registered_at,
        directory_visible: true,
        plot,
        citizen_number,
      },
    },
    origin
  );
};
