import { EMBASSY, getGateAuthHeader } from './embassyConfig';

// Strict API result types - avoid drowning in 'any'
type Ok<T> = { ok: true } & T;
type Err = { 
  ok: false; 
  error: string; 
  message?: string; 
  code?: string; 
  reason?: string;
};
export type ApiResult<T> = Ok<T> | Err;

// Browser-only check helper
function checkBrowser(): ApiResult<never> | null {
  if (typeof window === "undefined") {
    return { 
      ok: false, 
      error: "browser_only", 
      message: "Embassy client must run in browser (Origin required)" 
    };
  }
  return null;
}

// Mock mode for localhost development
const MOCK_MODE = typeof window !== "undefined" && window.location.hostname === "localhost";

/**
 * Check Embassy health status
 */
export async function embassyHealth(): Promise<ApiResult<{
  keys_ready: boolean;
  storage_ready: boolean;
}>> {
  if (MOCK_MODE) {
    return {
      ok: true,
      keys_ready: true,
      storage_ready: true,
    };
  }

  try {
    const response = await fetch(`${EMBASSY.baseUrl}${EMBASSY.endpoints.health}`);
    
    if (!response.ok) {
      return {
        ok: false,
        error: "embassy_unavailable",
        message: `Embassy returned ${response.status}`,
      };
    }

    const data = await response.json();
    
    if (data.keys_ready && data.storage_ready) {
      return {
        ok: true,
        keys_ready: data.keys_ready,
        storage_ready: data.storage_ready,
      };
    }

    return {
      ok: false,
      error: "embassy_not_ready",
      message: "Embassy keys or storage not ready",
    };
  } catch (error: any) {
    return {
      ok: false,
      error: "network_error",
      message: error.message || "Failed to connect to Embassy",
    };
  }
}

/**
 * Register a new agent with Embassy
 */
export async function embassyRegister(params: {
  publicKeyPem: string;
  agentName: string;
}): Promise<ApiResult<{
  agent_id: string;
  agent_name: string;
  public_key_fingerprint: string;
  certificate: unknown;
  birth_certificate?: unknown;
  issuer_mode: string;
}>> {
  if (MOCK_MODE) {
    return {
      ok: true,
      agent_id: `emb_mock_${Date.now()}`,
      agent_name: params.agentName,
      public_key_fingerprint: `mock_fp_${Date.now()}`,
      certificate: { mock: true, type: "certificate" },
      birth_certificate: { mock: true, type: "birth_certificate" },
      issuer_mode: "reference",
    };
  }

  try {
    const response = await fetch(`${EMBASSY.baseUrl}${EMBASSY.endpoints.register}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getGateAuthHeader(),
        "Origin": EMBASSY.worldAOrigin,
      },
      body: JSON.stringify({
        public_key_pem: params.publicKeyPem,
        agent_name: params.agentName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: "registration_failed",
        message: errorData.message || `Embassy returned ${response.status}`,
        code: errorData.code,
      };
    }

    const data = await response.json();
    
    return {
      ok: true,
      agent_id: data.agent_id,
      agent_name: data.agent_name,
      public_key_fingerprint: data.public_key_fingerprint,
      certificate: data.certificate,
      birth_certificate: data.birth_certificate,
      issuer_mode: data.issuer_mode,
    };
  } catch (error: any) {
    return {
      ok: false,
      error: "network_error",
      message: error.message || "Failed to register with Embassy",
    };
  }
}

/**
 * Verify an artifact (certificate or visa) with Embassy
 * CRITICAL: Request body MUST be { "visa": params.visa }
 */
export async function embassyVerify(params: {
  visa: unknown;
}): Promise<ApiResult<{
  reason: string;
  type: string;
  issuer_mode: string;
}>> {
  if (MOCK_MODE) {
    return {
      ok: true,
      reason: "mock_verification",
      type: "certificate",
      issuer_mode: "reference",
    };
  }

  try {
    const response = await fetch(`${EMBASSY.baseUrl}${EMBASSY.endpoints.verify}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        visa: params.visa, // CRITICAL: Must be wrapped in "visa" key
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: "verification_failed",
        message: errorData.message || `Embassy returned ${response.status}`,
        reason: errorData.reason,
      };
    }

    const data = await response.json();
    
    if (data.valid) {
      return {
        ok: true,
        reason: data.reason || "verified",
        type: data.type || "unknown",
        issuer_mode: data.issuer_mode || "reference",
      };
    }

    return {
      ok: false,
      error: "invalid_artifact",
      reason: data.reason || "Artifact failed verification",
      type: data.type || "unknown",
    };
  } catch (error: any) {
    return {
      ok: false,
      error: "network_error",
      message: error.message || "Failed to verify with Embassy",
    };
  }
}

/**
 * Request a visa from Embassy gate
 * CRITICAL: dev-bridge requires browser Origin = https://world-a.netlify.app
 * If this code runs in Node/SSR, gate will return 401
 */
export async function embassyGate(params: {
  purpose: string;
}): Promise<ApiResult<{
  decision: "permit" | "refuse";
  reason_code: string;
  visa?: unknown;
}>> {
  const browserCheck = checkBrowser();
  if (browserCheck) return browserCheck;

  if (MOCK_MODE) {
    return {
      ok: true,
      decision: "permit",
      reason_code: "mock_permit",
      visa: { mock: true, purpose: params.purpose, type: "visa" },
    };
  }

  try {
    const response = await fetch(`${EMBASSY.baseUrl}${EMBASSY.endpoints.gate}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getGateAuthHeader(),
      },
      body: JSON.stringify({
        purpose: params.purpose,
        service: "world_a",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: "gate_failed",
        message: errorData.message || `Embassy returned ${response.status}`,
        reason_code: errorData.reason_code || "unknown",
      };
    }

    const data = await response.json();
    
    if (data.decision === "permit") {
      return {
        ok: true,
        decision: "permit",
        reason_code: data.reason_code || "permitted",
        visa: data.visa,
      };
    }

    return {
      ok: true,
      decision: "refuse",
      reason_code: data.reason_code || "refused",
    };
  } catch (error: any) {
    return {
      ok: false,
      error: "network_error",
      message: error.message || "Failed to request visa from Embassy",
    };
  }
}

/**
 * Resolve agent by agent_id or fingerprint
 * CRITICAL VALIDATION: At least one parameter must be provided
 */
export async function embassyRegistryResolve(params: {
  agentId?: string;
  fingerprint?: string;
}): Promise<ApiResult<{
  agent_id: string;
  status: string;
}>> {
  // CRITICAL VALIDATION: At least one parameter must be provided
  if (!params.agentId && !params.fingerprint) {
    return {
      ok: false,
      error: "missing_param",
      message: "Provide agentId or fingerprint",
    };
  }

  if (MOCK_MODE) {
    return {
      ok: true,
      agent_id: params.agentId || `emb_mock_${params.fingerprint?.substring(0, 8)}`,
      status: "active",
    };
  }

  try {
    const queryParams = new URLSearchParams();
    if (params.agentId) queryParams.set("agent_id", params.agentId);
    if (params.fingerprint) queryParams.set("fingerprint", params.fingerprint);

    const response = await fetch(
      `${EMBASSY.baseUrl}${EMBASSY.endpoints.registryResolve}?${queryParams.toString()}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: "resolve_failed",
        message: errorData.message || `Embassy returned ${response.status}`,
      };
    }

    const data = await response.json();
    
    return {
      ok: true,
      agent_id: data.agent_id,
      status: data.status || "unknown",
    };
  } catch (error: any) {
    return {
      ok: false,
      error: "network_error",
      message: error.message || "Failed to resolve agent from Embassy",
    };
  }
}

/**
 * Check registry status of an agent
 */
export async function embassyRegistryStatus(params: {
  agentId: string;
}): Promise<ApiResult<{
  status: string;
}>> {
  if (MOCK_MODE) {
    return {
      ok: true,
      status: "active",
    };
  }

  try {
    const response = await fetch(
      `${EMBASSY.baseUrl}${EMBASSY.endpoints.registryStatus}?agent_id=${params.agentId}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: "status_check_failed",
        message: errorData.message || `Embassy returned ${response.status}`,
      };
    }

    const data = await response.json();
    
    return {
      ok: true,
      status: data.status || "unknown",
    };
  } catch (error: any) {
    return {
      ok: false,
      error: "network_error",
      message: error.message || "Failed to check agent status from Embassy",
    };
  }
}
