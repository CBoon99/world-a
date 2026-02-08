/**
 * Ed25519 keypair generation in browser
 * Uses jose library for reliable PEM export
 */

import { generateKeyPair, exportSPKI, exportPKCS8 } from 'jose';

/**
 * Generate Ed25519 keypair and export to PEM format
 * PRIMARY: Uses jose library (uses WebCrypto under the hood where supported)
 * 
 * PEM format: CRITICAL - Embassy /api/register requires Ed25519 public key in valid SPKI PEM format
 * Embassy expects standard SPKI for public keys, PKCS8 for private keys
 */
export async function generateKeypair(): Promise<{
  publicKeyPem: string;   // SPKI format
  privateKeyPem: string;  // PKCS8 format
}> {
  try {
    // Generate Ed25519 keypair using jose
    // jose uses WebCrypto API where available, falls back to pure JS implementation
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519'
    });

    // Export to PEM format
    const publicKeyPem = await exportSPKI(publicKey);
    const privateKeyPem = await exportPKCS8(privateKey);

    return {
      publicKeyPem,
      privateKeyPem,
    };
  } catch (error: any) {
    throw new Error(`Failed to generate keypair: ${error.message}`);
  }
}

/**
 * Future use - NOT NEEDED FOR V1 INTEGRATION
 * World A doesn't need local signing/verify yet - Embassy handles all trust via /api/verify
 * 
 * Keep it simple: generate + export PEM using proven library only
 */
