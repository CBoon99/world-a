# Embassy Integration Final Pass - Summary

**Date:** 2026-02-XX  
**Status:** ✅ **COMPLETE**

---

## Changes Made (Diff-Style Summary)

### 1) lib/middleware.ts

**Added agent_id prefix check (emb_):**
```diff
+ // Agent-only policy: require agent_id prefix (emb_)
+ // This preserves "agent-only" without depending on Embassy response fields
+ if (!request.agent_id.startsWith('emb_')) {
+   throw new Error('AGENT_ONLY: Invalid agent_id prefix (must start with emb_)');
+ }
```

**Location:** Line ~197 (in `authenticateRequest()`, before Embassy call)

**Added CORS headers to authenticatedHandler:**
```diff
+ // Handle OPTIONS for CORS preflight
+ if (event.httpMethod === 'OPTIONS') {
+   return {
+     statusCode: 204,
+     headers: {
+       'Access-Control-Allow-Origin': '*',
+       'Access-Control-Allow-Headers': 'Content-Type',
+       'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
+       'Content-Type': 'text/plain',
+     },
+     body: '',
+   };
+ }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
+     'Access-Control-Allow-Origin': '*',
+     'Access-Control-Allow-Headers': 'Content-Type',
+     'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(response),
  };
```

**Removed entity_type from dev bypass:**
```diff
  agent_verification: {
    ok: true,
    valid: true,
-   entity_type: 'agent',
    agent_id: request.agent_id,
    dev_bypass: true,
  },
```

---

### 2) netlify/functions/register.ts

**Added agent_id prefix check:**
```diff
+ // Agent-only policy: require agent_id prefix (emb_)
+ if (!request.agent_id.startsWith('emb_')) {
+   return {
+     statusCode: 403,
+     headers,
+     body: JSON.stringify(errorResponse(
+       'INVALID_AGENT_ID',
+       'agent_id must start with emb_'
+     )),
+   };
+ }
```

**Location:** Line ~89 (after binding check, before Embassy call)

---

### 3) netlify/functions/whoami.ts

**Removed entity_type reference:**
```diff
  verification: {
    ok: authReq.agent_verification.ok,
    valid: authReq.agent_verification.valid,
-   entity_type: authReq.agent_verification.entity_type,
+   // Note: Embassy verify doesn't return entity_type - removed
    dev_bypass: authReq.agent_verification.dev_bypass || false,
  },
```

---

## Verification: No Remaining Old Patterns

**Searched for:**
- `document.*certificate` - ✅ None found
- `type.*agent_certificate` - ✅ None found
- `data.valid` - ✅ None found (only in comments/docs)
- `entity_type` - ✅ Only in dev bypass mock (removed)

**All Embassy verify calls use:**
- ✅ `{ visa: artifact }` payload
- ✅ `data.ok === true` success check
- ✅ No assumptions about `entity_type` or `agent_id` in response

---

## Remaining Risks/Assumptions (5 bullets max)

1. **Embassy certificate structure:** We assume `embassy_certificate.agent_id` exists and is a string. If Embassy changes certificate structure, binding check will fail (secure by default).

2. **Agent_id prefix (emb_):** We enforce `agent_id.startsWith('emb_')` as agent-only gate. If Embassy changes agent_id format, this will block valid agents (but can be updated).

3. **Registry endpoint shape:** We use `data.exists || false` and `data.revoked || false`. If Embassy changes response structure, defaults are secure (deny if missing).

4. **String certificate parsing:** If certificate is sent as JSON string in headers/query, we JSON.parse it. If parse fails, we leave as string and validation catches it later (safe, but error message may be less clear).

5. **CORS wildcard:** We use `Access-Control-Allow-Origin: *` for all authenticated endpoints. This allows any origin (acceptable for agent-only API, but could be restricted if needed).

---

## Test Commands

### (a) Registration Success

```bash
# Replace <CERTIFICATE_OBJECT> with actual certificate from Embassy /api/register
curl -X POST https://world-a.netlify.app/api/world/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_test123",
    "embassy_certificate": <CERTIFICATE_OBJECT>,
    "data": {
      "name": "Test Agent"
    }
  }'

# Expected: { "ok": true, "data": { "agent_id": "emb_test123", "registered_at": "...", ... } }
```

### (b) Spoof Attempt (Agent ID Mismatch) - Must Fail

```bash
# Send certificate with different agent_id
curl -X POST https://world-a.netlify.app/api/world/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_different",
    "embassy_certificate": {
      "agent_id": "emb_test123",
      "signature": "...",
      ...
    }
  }'

# Expected: { "ok": false, "error": "AGENT_ID_MISMATCH", "message": "Certificate agent_id (emb_test123) does not match requested agent_id (emb_different)" }
# Status: 403 Forbidden
```

### (c) Authenticated Endpoint - Must Fail if Registry Missing/Revoked

```bash
# First, register successfully (from test a)
# Then, if agent is revoked in Embassy registry, authenticated endpoint should fail

curl -X POST https://world-a.netlify.app/api/world/commons/introductions \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_test123",
    "embassy_certificate": <CERTIFICATE_OBJECT>,
    "data": {
      "title": "Test",
      "content": "Hello"
    }
  }'

# If agent is revoked in Embassy registry:
# Expected: { "ok": false, "error": "AGENT_ONLY", "message": "Agent not found or revoked" }
# Status: 403 Forbidden
```

---

## Files Modified

1. `lib/middleware.ts` - Added agent_id prefix check, CORS headers, removed entity_type
2. `netlify/functions/register.ts` - Added agent_id prefix check
3. `netlify/functions/whoami.ts` - Removed entity_type reference

---

## Verification Checklist

- [x] No remaining `document/type` payload patterns
- [x] No remaining `data.valid/entity_type` assumptions
- [x] Registration is public (not using authenticatedHandler)
- [x] Binding check before Embassy call (in both registration and auth)
- [x] Agent_id prefix check (emb_) added
- [x] CORS headers added to authenticatedHandler
- [x] TypeScript compilation passes
- [x] No linter errors

---

**VERDICT:** ✅ **READY FOR PRODUCTION**
