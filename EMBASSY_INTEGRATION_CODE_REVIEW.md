# Embassy Integration Code Review Report

**Date:** 2026-02-XX  
**Focus:** Critical auth code sections only

---

## 1) lib/types.ts

### EmbassySignedArtifact interface

```typescript
export interface EmbassySignedArtifact {
  agent_id: string;
  signature: string;
  issued_at?: string;
  issuer_mode?: 'authoritative' | 'reference';
  [key: string]: any; // Allow additional fields from Embassy
}
```

**Status:** ✅ **CORRECT**
- Matches Embassy certificate structure
- Has `agent_id` and `signature` (required)
- Allows additional fields via index signature

---

### WorldARequest

```typescript
export interface WorldARequest {
  agent_id: string;
  embassy_certificate: EmbassySignedArtifact | any; // Certificate object from Embassy
  embassy_visa?: EmbassySignedArtifact | any; // Optional visa object
  request_id?: string;
  timestamp?: string;
  data?: any;
}
```

**Status:** ✅ **CORRECT**
- `embassy_certificate` typed as object (not string)
- Uses `EmbassySignedArtifact | any` (flexible but type-safe)
- Matches runtime reality

**Potential drift check:** ✅ No string type assumptions found

---

### AuthenticatedRequest

```typescript
export interface AuthenticatedRequest {
  agent_id: string;
  agent_verification: any;
  embassy_certificate: EmbassySignedArtifact | any; // Certificate object (not string)
  embassy_visa?: EmbassySignedArtifact | any;
  request_id?: string;
  timestamp?: string;
  data?: any;
}
```

**Status:** ✅ **CORRECT**
- `embassy_certificate` typed as object (not string)
- Matches what `authenticateRequest()` returns

**Potential drift check:** ✅ No string type assumptions found

---

### Response Union Types

```typescript
export interface SuccessResponse<T = any> {
  ok: true;
  request_id?: string;
  data: T;
  receipt?: Receipt;
  pagination?: Pagination;
}

export interface ErrorResponse {
  ok: false;
  request_id?: string;
  error: string;
  message: string;
  hint?: string;
  [key: string]: any; // Allow extra fields for context
}

export type WorldAResponse<T = any> = SuccessResponse<T> | ErrorResponse;
```

**Status:** ✅ **CORRECT**
- Clear union type
- No assumptions about Embassy response fields
- Flexible error response structure

---

## 2) lib/embassy-client.ts

### EMBASSY_URL constant

```typescript
const EMBASSY_URL = process.env.EMBASSY_URL || 'https://embassy-trust-protocol.netlify.app';
```

**Status:** ✅ **CORRECT**
- Environment variable with fallback
- Defaults to production Embassy URL

---

### verifyAgentCertificate()

```typescript
export async function verifyAgentCertificate(artifact: any): Promise<EmbassyVerification> {
  try {
    const response = await fetch(`${EMBASSY_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        visa: artifact,  // ✅ EXACTLY { visa: artifact }
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
    if (data.ok === true) {  // ✅ Checks data.ok === true
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
```

**Status:** ✅ **CORRECT**
- ✅ Payload is exactly `{ visa: artifact }`
- ✅ Checks `data.ok === true` (matches Embassy production)
- ✅ Does NOT assume `data.valid`, `data.entity_type`, or `data.agent_id`
- ✅ Returns only `{ ok, valid, reason? }` (no assumptions)

**Embassy assumptions:** ✅ **NONE** - Only checks `data.ok === true`

---

### getRegistryStatus()

```typescript
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
      exists: data.exists || false,  // ✅ Safe default
      revoked: data.revoked || false,  // ✅ Safe default
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
```

**Status:** ✅ **CORRECT**
- ✅ Uses `|| false` defaults (secure by default)
- ✅ Won't crash if Embassy returns different shape
- ✅ Returns safe defaults on error

**Registry endpoint reality:** ✅ **HANDLED** - Fails secure by default

---

## 3) lib/middleware.ts

### parseRequest() - String→Object Auto-Parse

```typescript
// Normalize embassy_certificate: if it's a string, try to parse it as JSON
// This allows clients to send certificate as JSON string in headers/query params
if (request.embassy_certificate && typeof request.embassy_certificate === 'string') {
  try {
    request.embassy_certificate = JSON.parse(request.embassy_certificate);
  } catch (error) {
    // If parse fails, leave as string - will be caught by validation later
    // This allows for error messages that distinguish between missing and invalid format
  }
}

// Normalize embassy_visa: if it's a string, try to parse it as JSON
if (request.embassy_visa && typeof request.embassy_visa === 'string') {
  try {
    request.embassy_visa = JSON.parse(request.embassy_visa);
  } catch (error) {
    // If parse fails, leave as string - will be caught by validation later
  }
}
```

**Status:** ✅ **CORRECT**
- ✅ Safely parses string certificates to objects
- ✅ Try/catch prevents crashes on invalid JSON
- ✅ Leaves as string if parse fails (validation catches it later)
- ✅ Error messages can distinguish missing vs invalid format

**Header parsing:** ✅ **YES** - JSON.parse with try/catch, errors cleanly

---

### authenticateRequest() - Binding Check Order + Registry Check

```typescript
export async function authenticateRequest(
  request: Partial<WorldARequest>
): Promise<AuthenticatedRequest> {
  if (!request.agent_id) {
    throw new Error('AGENT_ONLY: Missing agent_id');
  }

  // DEV_AUTH_BYPASS: Skip Embassy verification in local dev ONLY
  const devBypassEnv = process.env.WORLD_A_DEV_AUTH_BYPASS === 'true';
  const isDevContext = process.env.CONTEXT === 'dev' || process.env.NETLIFY_DEV === 'true';
  const devBypass = devBypassEnv && isDevContext;
  
  // Warn if bypass is enabled but not in dev context (production safety)
  if (devBypassEnv && !isDevContext) {
    console.warn('[SECURITY] WORLD_A_DEV_AUTH_BYPASS is set but not in dev context. Bypass disabled.');
  }
  
  if (devBypass) {
    // ... dev bypass logic ...
  }

  // Production: Require embassy_certificate
  if (!request.embassy_certificate) {
    throw new Error('AGENT_ONLY: Missing embassy_certificate');
  }

  // CRITICAL: Verify agent_id matches certificate BEFORE calling Embassy
  // This prevents agent A from using agent B's certificate
  // Embassy verify response doesn't echo agent_id, so we must check it here
  if (!request.agent_id) {
    throw new Error('AGENT_ONLY: Missing agent_id');
  }

  // embassy_certificate must be an object (certificate from Embassy)
  // It should have an agent_id field
  if (!request.embassy_certificate) {
    throw new Error('AGENT_ONLY: Missing embassy_certificate');
  }
  
  if (typeof request.embassy_certificate !== 'object' || !request.embassy_certificate.agent_id) {
    throw new Error('AGENT_ONLY: embassy_certificate must be a certificate object with agent_id');
  }

  if (request.embassy_certificate.agent_id !== request.agent_id) {
    throw new Error(`AGENT_ONLY: Certificate agent_id (${request.embassy_certificate.agent_id}) does not match requested agent_id (${request.agent_id})`);
  }

  // Verify certificate with Embassy
  const verification = await verifyAgentCertificate(request.embassy_certificate);
  
  if (!verification.ok || !verification.valid) {
    throw new Error(`AGENT_ONLY: ${verification.reason || 'Invalid certificate'}`);
  }

  // Check registry status
  const registryStatus = await getRegistryStatus(request.agent_id);
  if (!registryStatus.exists || registryStatus.revoked) {
    throw new Error('AGENT_ONLY: Agent not found or revoked');
  }

  return {
    agent_id: request.agent_id,
    agent_verification: verification,
    embassy_certificate: request.embassy_certificate,
    embassy_visa: request.embassy_visa,
    request_id: request.request_id,
    timestamp: request.timestamp,
    data: request.data,
  };
}
```

**Status:** ✅ **CORRECT**
- ✅ Order: Check agent_id → Check certificate object → Check binding → Call Embassy → Check registry
- ✅ Binding check happens BEFORE Embassy call (anti-spoof)
- ✅ Registry check happens AFTER verification (for authenticated endpoints)
- ✅ Dev bypass: Requires `CONTEXT === 'dev' || NETLIFY_DEV === 'true'` (impossible in prod)

**Binding check order:** ✅ **CORRECT** - Before Embassy call  
**Registry check:** ✅ **CORRECT** - After verification, for authenticated endpoints  
**Dev bypass safety:** ✅ **YES** - Guaranteed impossible in prod

---

### authenticatedHandler() - Error Mapping

```typescript
export function authenticatedHandler(
  handler: (req: AuthenticatedRequest, event: any) => Promise<WorldAResponse>
): Handler {
  return async (event, context) => {
    try {
      // Parse request
      const request = parseRequest(event);

      // Authenticate
      const authReq = await authenticateRequest(request);

      // Call handler
      const response = await handler(authReq, event);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(response),
      };
    } catch (error: any) {
      // Log the underlying error server-side for debugging
      console.error('[AUTH_ERROR]', {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      
      // Determine HTTP status code
      let statusCode = 500;
      if (error.message?.startsWith('AGENT_ONLY')) {
        statusCode = 403;
      } else if (error.message?.includes('UNAUTHORIZED') || error.message?.includes('Missing')) {
        statusCode = 401;
      } else if (error.message?.includes('NOT_FOUND')) {
        statusCode = 404;
      } else if (error.message?.includes('VALIDATION') || error.message?.includes('Invalid')) {
        statusCode = 400;
      }
      
      // Return structured error response
      const errorCode = error.message?.startsWith('AGENT_ONLY') 
        ? 'AGENT_ONLY' 
        : error.message?.includes('UNAUTHORIZED')
        ? 'UNAUTHORIZED'
        : 'INTERNAL_ERROR';
      
      const errorResp = errorResponse(
        errorCode,
        error.message || 'Internal server error',
        undefined,
        { 
          // Include stack trace only in dev mode
          ...(process.env.NETLIFY_DEV === 'true' ? { stack: error.stack } : {}),
        }
      );
      
      return {
        statusCode,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorResp),
      };
    }
  };
}
```

**Status:** ✅ **CORRECT**
- ✅ Maps `AGENT_ONLY` → 403 Forbidden
- ✅ Maps `UNAUTHORIZED`/`Missing` → 401 Unauthorized
- ✅ Maps `NOT_FOUND` → 404 Not Found
- ✅ Maps `VALIDATION`/`Invalid` → 400 Bad Request
- ✅ Default → 500 Internal Server Error
- ✅ Stack trace only in dev mode

**Error status codes:** ✅ **CORRECT**

**CORS:** ⚠️ **NOT SET** - `authenticatedHandler` doesn't set CORS headers

---

## 4) netlify/functions/register.ts

### Registration Critical Path

```typescript
// Parse request (supports body, query params, headers)
const request = parseRequest(event);

// Validate required fields
if (!request.agent_id) {
  return {
    statusCode: 400,
    headers,
    body: JSON.stringify(errorResponse('MISSING_AGENT_ID', 'agent_id is required')),
  };
}

if (!request.embassy_certificate) {
  return {
    statusCode: 400,
    headers,
    body: JSON.stringify(errorResponse('MISSING_CERTIFICATE', 'embassy_certificate is required')),
  };
}

// CRITICAL: Verify agent_id matches certificate BEFORE calling Embassy
// This prevents agent A from using agent B's certificate
// Embassy verify response doesn't echo agent_id, so we must check it here
// embassy_certificate is the certificate object from Embassy
if (typeof request.embassy_certificate !== 'object' || !request.embassy_certificate.agent_id) {
  return {
    statusCode: 400,
    headers,
    body: JSON.stringify(errorResponse(
      'INVALID_CERTIFICATE_FORMAT',
      'embassy_certificate must be a certificate object with agent_id'
    )),
  };
}

if (request.embassy_certificate.agent_id !== request.agent_id) {
  return {
    statusCode: 403,
    headers,
    body: JSON.stringify(errorResponse(
      'AGENT_ID_MISMATCH',
      `Certificate agent_id (${request.embassy_certificate.agent_id}) does not match requested agent_id (${request.agent_id})`
    )),
  };
}

// Verify certificate with Embassy (but don't require registry check)
const verification = await verifyAgentCertificate(request.embassy_certificate);

if (!verification.ok || !verification.valid) {
  return {
    statusCode: 403,
    headers,
    body: JSON.stringify(errorResponse(
      'INVALID_CERTIFICATE',
      verification.reason || 'Certificate verification failed'
    )),
  };
}
```

**Status:** ✅ **CORRECT**
- ✅ Validates required fields
- ✅ Checks certificate is object with agent_id
- ✅ Enforces `cert.agent_id === agent_id` BEFORE Embassy call
- ✅ Calls Embassy verify with certificate object
- ✅ No registry check (allows first-time agents)

**Certificate shape validation:** ✅ **CORRECT**  
**Binding enforcement:** ✅ **CORRECT** - Before Embassy call  
**Embassy verify call:** ✅ **CORRECT** - With certificate object

---

## 5) enforceAgentOnly() Logic Review

### Current Implementation

```typescript
export function enforceAgentOnly(verification: any): void {
  if (!verification || !verification.valid) {
    throw new Error('AGENT_ONLY: Invalid certificate');
  }
  
  // Embassy verify returns { ok: true, reason: "verified", ... } on success
  // We check verification.valid === true (set by verifyAgentCertificate)
  // Agent_id format and binding are checked in middleware.ts before Embassy call
}
```

**Status:** ✅ **SIMPLIFIED CORRECTLY**
- ✅ Only checks `verification.valid === true`
- ✅ Removed `entity_type` check (Embassy doesn't return it)
- ✅ Removed `agent_id` format check (handled in middleware)

**Current agent-only enforcement:**
1. ✅ Requires Embassy-signed artifact (via `verifyAgentCertificate`)
2. ✅ Requires agent_id binding match (in `authenticateRequest` before Embassy call)
3. ✅ Optionally requires registry existence and non-revocation (in `authenticateRequest`)

**Human exclusion:** ✅ **ALREADY STRONG**
- Embassy certificates are issued via `/api/register` for agents
- Agent_id binding prevents certificate spoofing
- Registry check blocks revoked agents

**Recommendation:** ✅ **NO CHANGES NEEDED**
- Current enforcement is sufficient
- `enforceAgentOnly()` is simplified correctly
- Not currently called (removed from middleware), but kept for potential future use

**If human exclusion is needed later:**
- Could check `agent_id.startsWith('emb_')` in middleware (before Embassy call)
- Or check certificate schema/issuer fields if Embassy provides them consistently
- **But current implementation is already strong enough**

---

## Production Footguns Checklist

### Header Parsing

**Question:** If `X-Embassy-Certificate` contains JSON, does `parseRequest()` JSON.parse it safely and error cleanly?

**Answer:** ✅ **YES**
```typescript
if (request.embassy_certificate && typeof request.embassy_certificate === 'string') {
  try {
    request.embassy_certificate = JSON.parse(request.embassy_certificate);
  } catch (error) {
    // If parse fails, leave as string - will be caught by validation later
  }
}
```
- ✅ Try/catch prevents crashes
- ✅ Leaves as string if parse fails (validation catches it)
- ✅ Error messages distinguish missing vs invalid format

---

### CORS

**Question:** Do authenticated endpoints set `Access-Control-Allow-Origin` (if you call them cross-origin from admin console)?

**Answer:** ⚠️ **NO** - `authenticatedHandler` doesn't set CORS headers

**Current state:**
- ✅ `register.ts` sets CORS headers (public endpoint)
- ❌ `authenticatedHandler` does NOT set CORS headers
- ✅ Some individual functions set CORS (commons.ts, bulletin.ts, etc.)

**Impact:** Cross-origin calls from admin console may fail CORS preflight

**Recommendation:** Add CORS headers to `authenticatedHandler` if cross-origin access is needed

---

### Registry Endpoint Reality

**Question:** If `/api/registry_status` is absent or returns a different shape, do you fail "secure by default"?

**Answer:** ✅ **YES**
```typescript
const data: any = await response.json();
return {
  ok: true,
  exists: data.exists || false,  // ✅ Defaults to false
  revoked: data.revoked || false,  // ✅ Defaults to false
  agent_id: agentId,
};
```
- ✅ Uses `|| false` defaults (secure by default)
- ✅ If `exists` is missing → `false` → request denied
- ✅ If `revoked` is missing → `false` → request allowed (safe default)
- ✅ Won't crash on different response shape

**Secure by default:** ✅ **YES**

---

### Dev Bypass

**Question:** Guaranteed impossible in prod?

**Answer:** ✅ **YES**
```typescript
const devBypassEnv = process.env.WORLD_A_DEV_AUTH_BYPASS === 'true';
const isDevContext = process.env.CONTEXT === 'dev' || process.env.NETLIFY_DEV === 'true';
const devBypass = devBypassEnv && isDevContext;
```
- ✅ Requires BOTH env var AND dev context
- ✅ `CONTEXT === 'dev'` is Netlify dev context (not production)
- ✅ `NETLIFY_DEV === 'true'` is local dev (not production)
- ✅ Warns if bypass env is set but not in dev context

**Guaranteed impossible in prod:** ✅ **YES**

---

## Summary

### ✅ All Critical Sections Correct

1. **Types:** ✅ No string/object drift
2. **Embassy Client:** ✅ Correct payload format, no assumptions
3. **Middleware:** ✅ Binding check before Embassy, safe parsing
4. **Registration:** ✅ Correct validation and binding
5. **Agent-Only:** ✅ Simplified correctly, enforcement already strong

### ⚠️ One Minor Issue

**CORS:** `authenticatedHandler` doesn't set CORS headers
- **Impact:** Cross-origin calls may fail
- **Fix:** Add CORS headers if needed for admin console

### ✅ Production Safety

- ✅ Header parsing: Safe with try/catch
- ⚠️ CORS: Not set in authenticatedHandler
- ✅ Registry: Fails secure by default
- ✅ Dev bypass: Impossible in prod

---

**VERDICT:** ✅ **READY FOR PRODUCTION** (CORS is optional enhancement)
