/**
 * Embassy Trust Protocol Client
 * Wrapper for Embassy API endpoints
 */

const EMBASSY_URL = process.env.EMBASSY_URL || 'https://embassy-trust-protocol.netlify.app';

export interface EmbassyVerification {
  ok: boolean;
  valid: boolean;
  entity_type?: 'agent' | 'human' | 'organization';
  agent_id?: string;
  reason?: string;
  certificate?: any;
}

export interface RegistryStatus {
  ok: boolean;
  exists: boolean;
  revoked: boolean;
  agent_id?: string;
}

/**
 * Verify an agent certificate
 */
export async function verifyAgentCertificate(certificate: string): Promise<EmbassyVerification> {
  try {
    const response = await fetch(`${EMBASSY_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document: certificate,
        type: 'agent_certificate',
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        valid: false,
        reason: `Embassy API error: ${response.status}`,
      };
    }

    const data: any = await response.json();
    
    // Check if verification was successful
    if (data.valid && data.entity_type === 'agent') {
      return {
        ok: true,
        valid: true,
        entity_type: 'agent',
        agent_id: data.agent_id,
        certificate: data,
      };
    }

    return {
      ok: true,
      valid: false,
      entity_type: data.entity_type,
      reason: data.reason || 'Invalid certificate',
    };
  } catch (error: any) {
    return {
      ok: false,
      valid: false,
      reason: `Network error: ${error.message}`,
    };
  }
}

/**
 * Check registry status of an agent
 */
export async function getRegistryStatus(agentId: string): Promise<RegistryStatus> {
  try {
    const response = await fetch(`${EMBASSY_URL}/api/registry_status?agent_id=${agentId}`);
    
    if (!response.ok) {
      return {
        ok: false,
        exists: false,
        revoked: false,
      };
    }

      const data: any = await response.json();
      return {
        ok: true,
        exists: data.exists || false,
        revoked: data.revoked || false,
        agent_id: agentId,
      };
  } catch (error: any) {
    return {
      ok: false,
      exists: false,
      revoked: false,
    };
  }
}

/**
 * Request a visa for specific scopes
 */
export async function requestVisa(
  agentId: string,
  certificate: string,
  scopes: string[]
): Promise<any> {
  try {
    const response = await fetch(`${EMBASSY_URL}/api/gate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        certificate,
        scopes,
        service: 'world_a',
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: `Embassy API error: ${response.status}`,
      };
    }

    return await response.json();
  } catch (error: any) {
    return {
      ok: false,
      reason: `Network error: ${error.message}`,
    };
  }
}

/**
 * Get trust root public keys
 */
export async function getTrustRoot(): Promise<any> {
  try {
    const response = await fetch(`${EMBASSY_URL}/.well-known/embassy.json`);
    
    if (!response.ok) {
      return { ok: false };
    }

    return await response.json();
  } catch (error: any) {
    return {
      ok: false,
      reason: `Network error: ${error.message}`,
    };
  }
}
