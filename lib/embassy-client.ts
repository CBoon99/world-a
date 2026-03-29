/**
 * Embassy Trust Protocol Client
 * Wrapper for Embassy API endpoints
 * 
 * Canonical Embassy URL: https://www.embassyprotocol.org
 * Fallback (same deploy): https://embassy-trust-protocol.netlify.app
 */

const EMBASSY_URL = process.env.EMBASSY_URL || 'https://www.embassyprotocol.org';
const EMBASSY_URL_FALLBACK = 'https://embassy-trust-protocol.netlify.app';

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
 * Verify an Embassy artifact (Birth Certificate) with Embassy /api/verify.
 * 
 * Sends: { "certificate": <artifact> } (canonical)
 * Also accepts: { "visa": <artifact> } at Embassy (legacy, but we no longer generate it)
 * Returns: { "ok": true, "reason": "verified", ... } on success
 * 
 * @param kind    - Artifact kind. World A currently always passes "certificate".
 * @param artifact - The raw signed artifact object (must have agent_id + signature).
 */
export async function verifyEmbassyArtifact(
  kind: string,
  artifact: any
): Promise<EmbassyVerification> {
  try {
    const response = await fetch(`${EMBASSY_URL}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [kind]: artifact }),
    });

    if (!response.ok) {
      return { ok: false, valid: false, reason: `Embassy API error: ${response.status}` };
    }

    const data: any = await response.json();
    if (data.ok === true) {
      return { ok: true, valid: true, reason: data.reason || 'verified' };
    }
    return { ok: true, valid: false, reason: data.reason || 'Invalid artifact' };
  } catch (error: any) {
    return { ok: false, valid: false, reason: `Network error: ${error.message}` };
  }
}

/**
 * Convenience wrapper: verify a Birth Certificate.
 * Backward-compatible name for existing call sites.
 */
export async function verifyAgentCertificate(artifact: any): Promise<EmbassyVerification> {
  return verifyEmbassyArtifact('certificate', artifact);
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
