import { Handler } from '@netlify/functions';
import { initDatabase, queryOne } from '../../lib/db';
import { errorResponse } from '../../lib/middleware';

export const handler: Handler = async (event, context) => {
  try {
    // Initialize database connection
    await initDatabase();

    // Test database connection with SELECT 1
    let dbHealthy = false;
    let dbError: string | null = null;
    try {
      const result = await queryOne('SELECT 1 as test');
      dbHealthy = result?.test === 1;
    } catch (error: any) {
      dbError = error.message;
      console.error('[HEALTH_CHECK] Database test failed:', error);
    }

    // Get version/build metadata
    const version = process.env.WORLD_A_VERSION || '1.0.0';
    const buildId = process.env.NETLIFY_BUILD_ID || 'local';
    const commitSha = process.env.COMMIT_REF || 'unknown';
    const nodeVersion = process.version;
    const nodeAbi = process.versions.modules;

    // Determine overall health
    const healthy = dbHealthy;
    const status = healthy ? 'operational' : 'degraded';

    return {
      statusCode: healthy ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: healthy,
        service: 'World A',
        status,
        version,
        build: {
          build_id: buildId,
          commit_sha: commitSha,
        },
        runtime: {
          node_version: nodeVersion,
          node_abi: nodeAbi,
        },
        checks: {
          database: {
            healthy: dbHealthy,
            error: dbError || undefined,
          },
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    // Log the underlying error server-side
    console.error('[HEALTH_CHECK] Fatal error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(errorResponse(
        'SERVICE_UNAVAILABLE',
        'Health check failed',
        undefined,
        {
          message: error.message,
          // Include stack trace only in dev mode
          ...(process.env.NETLIFY_DEV === 'true' ? { stack: error.stack } : {}),
        }
      )),
    };
  }
};
