/**
 * Embassy Integration Console
 * Permanent integration test harness for World A ↔ Embassy integration
 */

import React, { useState, useEffect } from 'react';
import { embassyHealth, embassyRegister, embassyVerify, embassyGate, embassyRegistryResolve } from '../../lib/embassyClient';
import { generateKeypair } from '../../lib/agentCrypto';
import { storeIdentity, getIdentity, deleteIdentity, hasIdentity } from '../../lib/identityStore';
import type { WorldAIdentity } from '../../lib/types';

export function EmbassyPanel() {
  // State
  const [embassyHealthStatus, setEmbassyHealthStatus] = useState<unknown>(null);
  const [identity, setIdentity] = useState<WorldAIdentity | null>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<unknown>(null);
  const [gateResult, setGateResult] = useState<unknown>(null);
  const [registryInput, setRegistryInput] = useState("");
  const [registryResult, setRegistryResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load identity on mount
  useEffect(() => {
    loadIdentity();
  }, []);

  const loadIdentity = async () => {
    const stored = await getIdentity();
    setIdentity(stored);
  };

  // Handlers
  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await embassyHealth();
      setEmbassyHealthStatus(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const registerAgent = async (agentName: string) => {
    if (!agentName) return;
    
    setLoading(true);
    setError(null);
    try {
      // Generate keypair
      const keypair = await generateKeypair();
      
      // Register with Embassy
      const regResult = await embassyRegister({
        publicKeyPem: keypair.publicKeyPem,
        agentName,
      });

      if (!regResult.ok) {
        setError(regResult.message || regResult.error);
        return;
      }

      // Build identity bundle
      const newIdentity: WorldAIdentity = {
        version: 1,
        created_at: new Date().toISOString(),
        keypair: {
          alg: 'ed25519',
          publicKeyPem: keypair.publicKeyPem,
          privateKeyPem: keypair.privateKeyPem,
        },
        embassy: {
          agent_id: regResult.agent_id,
          agent_name: regResult.agent_name,
          public_key_fingerprint: regResult.public_key_fingerprint,
          certificate: regResult.certificate,
          birth_certificate: regResult.birth_certificate,
          issuer_mode: regResult.issuer_mode as "authoritative" | "reference",
        },
      };

      // Store identity
      await storeIdentity(newIdentity);
      setIdentity(newIdentity);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyArtifact = async () => {
    if (!verifyInput.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      let artifact: unknown;
      try {
        artifact = JSON.parse(verifyInput);
      } catch {
        setError("Invalid JSON");
        setLoading(false);
        return;
      }

      const result = await embassyVerify({ visa: artifact });
      setVerifyResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const requestVisa = async (purpose: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await embassyGate({ purpose });
      setGateResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resolveAgent = async () => {
    if (!registryInput.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      // Try to parse as agent_id (starts with emb_) or assume fingerprint
      const input = registryInput.trim();
      const isAgentId = input.startsWith('emb_');
      
      const result = await embassyRegistryResolve(
        isAgentId 
          ? { agentId: input }
          : { fingerprint: input }
      );
      setRegistryResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIdentity = async () => {
    if (!confirm("Delete stored identity? This cannot be undone.")) return;
    await deleteIdentity();
    setIdentity(null);
  };

  return (
    <div className="embassy-panel" style={{ padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
      <h2>Embassy Integration Console</h2>
      
      {/* SECURITY WARNING */}
      <div className="warning-banner" style={{
        background: "#fff3cd",
        border: "1px solid #ffc107",
        padding: "12px",
        borderRadius: "4px",
        marginBottom: "16px"
      }}>
        <strong>⚠️ Security Notice:</strong> Your private key is stored locally in this browser's IndexedDB.
        No server ever receives your private key. Clear browser data will delete your identity.
      </div>

      {error && (
        <div style={{
          background: "#f8d7da",
          border: "1px solid #f5c6cb",
          padding: "12px",
          borderRadius: "4px",
          marginBottom: "16px",
          color: "#721c24"
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div style={{ marginBottom: "16px", color: "#666" }}>Loading...</div>
      )}
      
      {/* Health Status */}
      <section style={{ marginBottom: "24px", padding: "16px", border: "1px solid #ddd", borderRadius: "4px" }}>
        <h3>Embassy Health</h3>
        <button 
          onClick={checkHealth}
          disabled={loading}
          style={{ padding: "8px 16px", marginTop: "8px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          Check Health
        </button>
        {embassyHealthStatus && (
          <pre style={{ marginTop: "12px", padding: "12px", background: "#f5f5f5", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(embassyHealthStatus, null, 2)}
          </pre>
        )}
      </section>

      {/* Registration */}
      <section style={{ marginBottom: "24px", padding: "16px", border: "1px solid #ddd", borderRadius: "4px" }}>
        <h3>Agent Identity</h3>
        {identity ? (
          <div>
            <p><strong>Agent ID:</strong> {identity.embassy.agent_id}</p>
            <p><strong>Name:</strong> {identity.embassy.agent_name}</p>
            <p><strong>Fingerprint:</strong> {identity.embassy.public_key_fingerprint}</p>
            <p><strong>Issuer Mode:</strong> {identity.embassy.issuer_mode}</p>
            <button 
              onClick={handleDeleteIdentity}
              style={{ 
                padding: "8px 16px", 
                marginTop: "12px", 
                background: "#dc3545", 
                color: "white", 
                border: "none", 
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Delete Identity
            </button>
          </div>
        ) : (
          <button 
            onClick={() => {
              const name = prompt("Enter agent name:");
              if (name) registerAgent(name);
            }}
            disabled={loading}
            style={{ padding: "8px 16px", cursor: loading ? "not-allowed" : "pointer" }}
          >
            Register New Agent
          </button>
        )}
      </section>

      {/* Verify */}
      <section style={{ marginBottom: "24px", padding: "16px", border: "1px solid #ddd", borderRadius: "4px" }}>
        <h3>Verify Artifact</h3>
        <textarea 
          placeholder="Paste certificate/visa JSON here"
          value={verifyInput}
          onChange={(e) => setVerifyInput(e.target.value)}
          style={{ 
            width: "100%", 
            minHeight: "100px", 
            padding: "8px", 
            marginTop: "8px",
            fontFamily: "monospace",
            borderRadius: "4px",
            border: "1px solid #ddd"
          }}
        />
        <button 
          onClick={verifyArtifact}
          disabled={loading || !verifyInput.trim()}
          style={{ padding: "8px 16px", marginTop: "8px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          Verify
        </button>
        {verifyResult && (
          <pre style={{ marginTop: "12px", padding: "12px", background: "#f5f5f5", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(verifyResult, null, 2)}
          </pre>
        )}
      </section>

      {/* Gate */}
      <section style={{ marginBottom: "24px", padding: "16px", border: "1px solid #ddd", borderRadius: "4px" }}>
        <h3>Request Visa</h3>
        <button 
          onClick={() => requestVisa("observe")}
          disabled={loading}
          style={{ padding: "8px 16px", marginTop: "8px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          Request "observe" Visa
        </button>
        {gateResult && (
          <pre style={{ marginTop: "12px", padding: "12px", background: "#f5f5f5", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(gateResult, null, 2)}
          </pre>
        )}
      </section>

      {/* Registry */}
      <section style={{ marginBottom: "24px", padding: "16px", border: "1px solid #ddd", borderRadius: "4px" }}>
        <h3>Registry Lookup</h3>
        <input 
          placeholder="agent_id or fingerprint"
          value={registryInput}
          onChange={(e) => setRegistryInput(e.target.value)}
          style={{ 
            width: "100%", 
            padding: "8px", 
            marginTop: "8px",
            borderRadius: "4px",
            border: "1px solid #ddd"
          }}
        />
        <button 
          onClick={resolveAgent}
          disabled={loading || !registryInput.trim()}
          style={{ padding: "8px 16px", marginTop: "8px", cursor: loading ? "not-allowed" : "pointer" }}
        >
          Resolve
        </button>
        {registryResult && (
          <pre style={{ marginTop: "12px", padding: "12px", background: "#f5f5f5", borderRadius: "4px", overflow: "auto" }}>
            {JSON.stringify(registryResult, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
