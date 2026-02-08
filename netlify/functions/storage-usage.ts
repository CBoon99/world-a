import { Handler } from '@netlify/functions';
import { parseRequest, authenticateRequest, successResponse, errorResponse } from '../../lib/middleware';
import { initDatabase, queryOne, query } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  await initDatabase();
  try {
    // Parse and authenticate request
    const request = parseRequest(event);
    const authReq = await authenticateRequest(request);

    const { agent_id } = authReq;
    const plot_id = event.queryStringParameters?.plot_id;

    if (!plot_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('invalid_request', 'Missing plot_id parameter', request.request_id)),
      };
    }

    // Verify plot exists and agent has access
    const plot = await queryOne(
      `SELECT * FROM plots WHERE plot_id = $1`,
      [plot_id]
    );

    if (!plot) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse('plot_not_found', 'Plot does not exist', request.request_id)),
      };
    }

    // Only owner can see detailed usage
    const isOwner = plot.owner_agent_id === agent_id;

    // Get storage statistics
    const storageStats = await query(
      `SELECT 
        COUNT(*) as file_count,
        SUM(content_size_bytes) as total_bytes,
        COUNT(DISTINCT SUBSTR(path, 1, INSTR(path || '/', '/') - 1)) as top_level_dirs
       FROM agent_storage 
       WHERE plot_id = $1`,
      [plot_id]
    );

    const stats = storageStats[0] as any;
    const totalBytes = stats.total_bytes || 0;
    const fileCount = stats.file_count || 0;
    const allocationBytes = (plot.storage_allocation_gb || 1) * 1024 * 1024 * 1024;
    const usedBytes = plot.storage_used_bytes || 0;
    const availableBytes = Math.max(0, allocationBytes - usedBytes);
    const usagePercent = allocationBytes > 0 
      ? Math.round((usedBytes / allocationBytes) * 100) 
      : 0;

    const response: any = {
      plot_id,
      storage_allocation_gb: plot.storage_allocation_gb || 1,
      storage_used_bytes: usedBytes,
      storage_available_bytes: availableBytes,
      usage_percent: usagePercent,
      file_count: fileCount,
    };

    // Owner gets detailed breakdown
    if (isOwner) {
      // Get breakdown by content type
      const typeBreakdown = await query(
        `SELECT 
          content_type,
          COUNT(*) as count,
          SUM(content_size_bytes) as total_bytes
         FROM agent_storage 
         WHERE plot_id = $1
         GROUP BY content_type
         ORDER BY total_bytes DESC`,
        [plot_id]
      );

      // Get largest files
      const largestFiles = await query(
        `SELECT path, content_size_bytes, content_type
         FROM agent_storage 
         WHERE plot_id = $1
         ORDER BY content_size_bytes DESC
         LIMIT 10`,
        [plot_id]
      );

      response.detailed = {
        type_breakdown: typeBreakdown.map((item: any) => ({
          content_type: item.content_type || 'unknown',
          file_count: item.count,
          total_bytes: item.total_bytes || 0,
        })),
        largest_files: largestFiles.map((item: any) => ({
          path: item.path,
          size_bytes: item.content_size_bytes,
          content_type: item.content_type,
        })),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(successResponse(response, {
        type: 'storage_usage',
        plot_id,
        timestamp: new Date().toISOString(),
      }, request.request_id)),
    };
  } catch (error: any) {
    return {
      statusCode: error.message?.startsWith('AGENT_ONLY') ? 403 : 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
