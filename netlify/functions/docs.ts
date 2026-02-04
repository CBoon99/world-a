// Purpose: Serve documentation as markdown (PUBLIC - no auth)
import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';

const DOCS: Record<string, string> = {
  'agent-quickstart': 'AGENT_QUICKSTART.md',
  'ambassador-operations': 'AMBASSADOR_OPERATIONS.md',
  'api-reference': 'API_REFERENCE.md',
  'for-agents': 'FOR_AGENTS.md',
  'for-humans': 'FOR_HUMANS.md',
  'first-election': 'FIRST_ELECTION.md'
};

export const handler: Handler = async (event) => {
  const pathParts = event.path.split('/').filter(Boolean);
  const docId = pathParts[pathParts.length - 1];
  
  const filename = DOCS[docId];
  
  if (!filename) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'NOT_FOUND',
        available: Object.keys(DOCS)
      })
    };
  }
  
  try {
    // Try multiple paths for different execution contexts
    const possiblePaths = [
      path.join(process.cwd(), 'docs', filename),
      path.join(__dirname, '..', '..', 'docs', filename),
      path.join(__dirname, 'docs', filename)
    ];
    
    let filePath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    
    if (!filePath) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'FILE_NOT_FOUND',
          searched: possiblePaths
        })
      };
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      } as Record<string, string>,
      body: content
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'READ_ERROR',
        message: error.message 
      })
    };
  }
};
