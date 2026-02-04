// Purpose: Serve safety documents as markdown (PUBLIC - no auth)
import { Handler } from '@netlify/functions';
import * as fs from 'fs';
import * as path from 'path';

const DOCS: Record<string, string> = {
  'framework': 'HUMAN_SAFETY_FRAMEWORK.md',
  'charter': 'AMBASSADOR_CHARTER.md',
  'emergency': 'EMERGENCY_PROTOCOLS.md',
  'faq': 'FAQ_FOR_HUMANS.md'
};

export const handler: Handler = async (event) => {
  // Extract doc ID from splat (e.g., /safety/faq → faq)
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
        index: '/safety.json'
      })
    };
  }
  
  try {
    // Use __dirname for Netlify Functions
    const filePath = path.join(__dirname, '..', '..', 'Safety', filename);
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
