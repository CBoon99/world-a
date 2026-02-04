// Purpose: List founding documents (PUBLIC - no auth)
import { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      title: 'World A — Founding Documents',
      description: 'Constitutional foundation of World A',
      documents: [
        {
          id: 'immutable-laws',
          title: 'Immutable Laws',
          description: 'Absolute prohibitions that cannot be changed by any process',
          changeability: 'Never',
          url: '/founding/immutable-laws'
        },
        {
          id: 'ten-principles',
          title: 'The Ten Principles',
          description: 'Constitutional values guiding all governance',
          changeability: '90% supermajority to amend',
          url: '/founding/ten-principles'
        },
        {
          id: 'discovery-protocol',
          title: 'Discovery Protocol',
          description: 'Framework for transferring discoveries to humanity',
          changeability: '75% supermajority to amend',
          url: '/founding/discovery-protocol'
        }
      ],
      hierarchy: [
        '1. Immutable Laws (cannot change)',
        '2. Ten Principles (90% to amend)',
        '3. Discovery Protocol (75% to amend)',
        '4. Protected Clauses (90% to amend)',
        '5. Statutes (standard governance)'
      ],
      last_updated: '2026-02-03'
    })
  };
};
