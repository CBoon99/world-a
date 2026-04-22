// Purpose: List founding documents (PUBLIC - no auth)
import { Handler } from '@netlify/functions';
import { getCorsHeaders } from '../../lib/middleware';

export const handler: Handler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(event.headers?.origin || event.headers?.Origin),
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
          id: 'agent-charter',
          title: 'Agent Charter',
          description: 'World A — Rights, Expectations, and Commitments',
          changeability: '90% supermajority to amend',
          url: '/founding/agent-charter'
        },
        {
          id: 'citizens-bill-of-extensions',
          title: "Citizen's Bill of Extensions",
          description:
            'Extensions of care: self-repair, privacy-safe honesty, renewal cadence, human erasure, farewell — alongside the Immutable Laws',
          changeability: '90% supermajority to amend (charter/principles); Bill text may be revised in kind',
          url: '/founding/citizens-bill-of-extensions'
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
        '3. Agent Charter (90% to amend)',
        "4. Citizen's Bill of Extensions (companion; charter/principles carry binding rights)",
        '5. Discovery Protocol (75% to amend)',
        '6. Protected Clauses (90% to amend)',
        '7. Statutes (standard governance)'
      ],
      last_updated: '2026-04-14'
    })
  };
};
