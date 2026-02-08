/**
 * World A Identity type definition
 * Matches the integration spec exactly
 */
export type WorldAIdentity = {
  version: 1;
  created_at: string;

  keypair: {
    alg: "ed25519";
    publicKeyPem: string;   // spki PEM
    privateKeyPem: string;  // pkcs8 PEM (secret)
  };

  embassy: {
    agent_id: string;
    agent_name: string;
    public_key_fingerprint: string;
    certificate: unknown;  // Force deliberate parsing
    birth_certificate?: unknown;  // Force deliberate parsing
    issuer_mode: "authoritative" | "reference";
  };
};
