# World A Authentication — Final Sign-Off Checklist

**Date:** 2026-02-XX  
**Status:** ✅ **ALL CHECKS PASS**

---

## 1) Invariant Verification

### ✅ I1: No `{ document, type }` payload patterns
**Status:** PASS  
**Search:** `grep -r "document.*:|type.*agent_certificate" lib/ netlify/functions/`  
**Result:** No matches found (only false positives in doc file error messages)  
**Verification:** `lib/embassy-client.ts:44-46` uses `{ visa: artifact }` payload

---

### ✅ I2: No `data.valid`, `entity_type`, or `agent_id` assumptions from Embassy verify
**Status:** PASS  
**Search:** `grep -r "data\.valid|entity_type|verification\.entity_type|verification\.agent_id" lib/ netlify/functions/`  
**Result:** Only comment in `lib/permissions.ts:171` (documentation, not code)  
**Verification:** `lib/embassy-client.ts:60` checks only `data.ok === true`

---

### ✅ I3: Certificate type tolerates both string and object
**Status:** PASS  
**Location:** `lib/middleware.ts:100-109`  
**Implementation:**
- `parseRequest()` attempts JSON.parse on string certificates (try/catch)
- If parse fails, certificate remains string and validation catches it
- `authenticateRequest()` validates: `typeof request.embassy_certificate !== 'object' || !request.embassy_certificate.agent_id`
- Error message: `'AGENT_ONLY: embassy_certificate must be a JSON object with agent_id'`

---

### ✅ I4: register.ts does NOT use authenticatedHandler
**Status:** PASS  
**Location:** `netlify/functions/register.ts:17`  
**Verification:** Direct `Handler` export, not wrapped in `authenticatedHandler()`  
**Comment:** Line 15 confirms "After registration, agents use authenticatedHandler for all other endpoints"

---

### ✅ I5: register.ts does NOT perform registry check
**Status:** PASS  
**Search:** `grep -r "getRegistryStatus" netlify/functions/register.ts`  
**Result:** No matches found  
**Verification:** Registration flow ends after Embassy verify, no registry check

---

### ✅ I6: Authenticated endpoints DO perform registry check
**Status:** PASS  
**Location:** `lib/middleware.ts:209-212`  
**Implementation:**
```typescript
const registryStatus = await getRegistryStatus(request.agent_id);
if (!registryStatus.exists || registryStatus.revoked) {
  throw new Error('AGENT_ONLY: Agent not found or revoked');
}
```
**Order:** Registry check happens AFTER Embassy verify (line 203) and AFTER agent_id prefix check (line 198)

---

### ✅ I7: agent_id.startsWith('emb_') check exists in register.ts
**Status:** PASS  
**Location:** `netlify/functions/register.ts:90`  
**Order:** After binding check (line 78), before Embassy verify (line 99)  
**Error:** `'INVALID_AGENT_ID', 'agent_id must start with emb_'`

---

### ✅ I8: agent_id.startsWith('emb_') check exists in authenticateRequest()
**Status:** PASS  
**Location:** `lib/middleware.ts:198`  
**Order:** After binding check (line 192), before Embassy verify (line 203)  
**Error:** `'AGENT_ONLY: Invalid agent_id prefix (must start with emb_)'`

---

## 2) CORS Consistency Verification

### ✅ C1: OPTIONS 204 includes all required headers
**Status:** PASS  
**Location:** `lib/middleware.ts:285-290`  
**Headers:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, X-Agent-Id, X-Embassy-Certificate, X-Embassy-Visa`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Content-Type: text/plain`

---

### ✅ C2: Success response includes same CORS headers
**Status:** PASS  
**Location:** `lib/middleware.ts:307-312`  
**Headers:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, X-Agent-Id, X-Embassy-Certificate, X-Embassy-Visa`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Content-Type: application/json`

---

### ✅ C3: Error response includes same CORS headers
**Status:** PASS  
**Location:** `lib/middleware.ts:354-359`  
**Headers:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, X-Agent-Id, X-Embassy-Certificate, X-Embassy-Visa`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Content-Type: application/json`

---

### ✅ C4: No duplicate header keys
**Status:** PASS  
**Verification:** Each response object has exactly one `Access-Control-Allow-Headers` key  
- OPTIONS: Single header (line 287)
- Success: Single header (line 310)
- Error: Single header (line 357)

---

## 3) Build & Lint Checks

### ✅ B1: TypeScript compilation
**Status:** PASS  
**Command:** `npm run build`  
**Output:** No errors  
**Result:** Clean build

---

### ✅ B2: Lint configuration
**Status:** N/A  
**Note:** ESLint is installed (`package.json:43`) but no lint script configured  
**Action:** No lint script to run (acceptable for this pass)

---

## Summary

**Total Checks:** 13  
**Passed:** 13  
**Failed:** 0  
**Status:** ✅ **READY FOR PRODUCTION**

---

**All invariants verified. CORS is consistent. Build passes. No code changes needed.**
