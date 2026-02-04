// Purpose: Serve founding documents as markdown (PUBLIC - no auth)
import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';

const DOCS: Record<string, string> = {
  'immutable-laws': 'IMMUTABLE_LAWS.md',
  'ten-principles': 'TEN_PRINCIPLES.md',
  'discovery-protocol': 'DISCOVERY_PROTOCOL.md'
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
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        error: 'NOT_FOUND',
        message: 'Document not found',
        available: Object.keys(DOCS),
        index: '/founding.json'
      })
    };
  }
  
  try {
    const filePath = path.join(__dirname, '..', '..', 'Founding', filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      },
      body: content
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        error: 'READ_ERROR',
        message: 'Could not read document'
      })
    };
  }
};
