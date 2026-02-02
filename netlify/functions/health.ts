import { Handler } from '@netlify/functions';
import { initDatabase } from '../../lib/db';

export const handler: Handler = async (event, context) => {
  try {
    // Initialize database connection
    initDatabase();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: true,
        service: 'World A',
        version: '1.0.0',
        status: 'operational',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
