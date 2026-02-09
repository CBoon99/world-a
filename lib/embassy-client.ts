/**
 * Embassy Trust Protocol Client
 * Wrapper for Embassy API endpoints
 */

const EMBASSY_URL = process.env.EMBASSY_URL || 'https://embassy-trust-protocol.netlify.app';

export interface EmbassyVerification {
  ok: boolean;
  valid: boolean;
  reason?: string;
}

export interface RegistryStatus {
  ok: boolean;
  exists: boolean;
  revoked: boolean;
  agent_id?: string;
}

/**
 * Verify an agent certificate (visa) with Embassy
 * 
 * Embassy production /api/verify expects:
 *   { "visa": <certificate_object> }
 * and returns:
 *   { "ok": true, "reason": "verified", ... }
 * 
 * Example successful verify:
 *   curl -X POST https://embassy-trust-protocol.netlify.app/api/verify \
 *     -H "Content-Type: application/json" \
 *     -d '{ "visa": <CERT_OBJECT> }'
 *   returns { ok:true, reason:"verified", ... }
 * 
 * @param artifact - Embassy certificate or visa object (must have agent_id and signature)
 */
export async function verifyAgentCertificate(artifact: any): Promise<EmbassyVerification> {
  try {
    const response = await fetch(`${EMBASSY_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        visa: artifact,
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
    
    // Embassy returns { ok: true, reason: "verified", ... } on success
    if (data.ok === true) {
      return {
        ok: true,
        valid: true,
        reason: data.reason || 'verified',
      };
    }

    return {
      ok: true,
      valid: false,
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
