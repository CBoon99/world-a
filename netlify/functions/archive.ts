import { Handler } from '@netlify/functions';
import fs from 'fs';
import path from 'path';

export const handler: Handler = async (event, context) => {
  try {
    // Get document ID from path or query parameter
    const pathMatch = event.path.match(/\/archive\/(.+)/);
    const queryId = event.queryStringParameters?.id;
    const docId = pathMatch ? pathMatch[1] : (queryId || '001-founding');

    // Try multiple possible paths for the archive file
    const possiblePaths = [
      path.join(process.cwd(), 'archive', `${docId}.md`),
      path.join(__dirname, '..', '..', 'archive', `${docId}.md`),
      path.join(process.cwd(), '..', 'archive', `${docId}.md`),
    ];

    let markdown: string | null = null;
    let archivePath: string | null = null;

    // Try to find the file
    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        archivePath = tryPath;
        markdown = fs.readFileSync(tryPath, 'utf-8');
        break;
      }
    }

    // If not found, return 404
    if (!markdown) {
      return {
        statusCode: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          ok: false,
          error: 'archive_not_found',
          reason: `Archive document "${docId}" not found`,
        }),
      };
    }

    // Return as markdown (agents can parse it)
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: markdown,
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
