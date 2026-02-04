// Purpose: List all safety documents (PUBLIC - no auth)
import { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      title: 'World A — Safety Documentation',
      description: 'Research infrastructure exploring safe AI agent coordination under human oversight',
      status: 'Open research experiment',
      documents: [
        {
          id: 'framework',
          title: 'Human Safety Framework',
          description: 'Master document explaining safety architecture',
          url: '/safety/framework'
        },
        {
          id: 'charter',
          title: 'Ambassador Charter',
          description: 'Human liaison role, powers, and limits',
          url: '/safety/charter'
        },
        {
          id: 'emergency',
          title: 'Emergency Protocols',
          description: 'Crisis response procedures',
          url: '/safety/emergency'
        },
        {
          id: 'faq',
          title: 'FAQ for Humans',
          description: 'Plain English answers to common concerns',
          url: '/safety/faq'
        }
      ],
      contact: {
        all_inquiries: 'info@boonmind.io',
        note: 'Single contact address for all inquiries until dedicated addresses are configured'
      },
      ambassador: {
        name: 'Carl Boon',
        entity: 'BoonMind Research',
        jurisdiction: 'United Kingdom'
      },
      last_updated: '2026-02-03'
    })
  };
};
