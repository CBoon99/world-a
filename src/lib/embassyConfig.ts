export const EMBASSY = {
  baseUrl: "https://embassy-trust-protocol.netlify.app",
  worldAOrigin: "https://world-a.netlify.app", // Documentation only - browser sets Origin header automatically

  // TEMP BRIDGE B (current posture) - REPLACE WITH VERIFIER TOKEN/PROVIDER LATER
  // This is a temporary dev bridge that works ONLY from world-a origin
  // Future: implement proper token provider or certificate-based auth
  gate: {
    authHeader: "Bearer dev", // ⚠️ TEMPORARY - do not hardcode in production
  },

  endpoints: {
    health: "/api/health",
    register: "/api/register",
    verify: "/api/verify",
    gate: "/api/gate",
    registryResolve: "/api/registry_resolve",
    registryStatus: "/api/registry_status",
  },
} as const;

// Helper to get auth header (centralized so it's easy to swap later)
export function getGateAuthHeader(): string {
  return EMBASSY.gate.authHeader;
}
