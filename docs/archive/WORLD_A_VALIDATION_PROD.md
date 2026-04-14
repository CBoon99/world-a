# World A Production Validation Pack

**Date:** 2026-02-13  
**UTC Timestamp:** 2026-02-13T23:XX:XXZ  
**Deployment:** Post CORS/OPTIONS fix  
**Status:** ⚠️ **PENDING ACTUAL PROD TEST** (commands ready, needs network access)

---

## Pre-Fix State (Baseline)

From validation pack: `/tmp/worlda_validation_20260213_233934.txt`

- ✅ `GET /api/world/health` → 200 OK
- ❌ `OPTIONS /api/world/whoami` → HTTP/2 403
- ❌ `GET /api/world/whoami` (no auth) → 403 "AGENT_ONLY: Missing agent_id"
- ❌ `GET /api/world/status` (no auth) → 403 "AGENT_ONLY: Missing agent_id"

---

## Post-Fix Validation Commands

### 1. OPTIONS Preflight - whoami

**Command:**
```bash
curl -sS -i -X OPTIONS https://world-a.netlify.app/api/world/whoami \
  -H "Origin: https://world-a.netlify.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-agent-id, x-embassy-certificate, authorization"
```

**Expected Result:**
- Status: `204 No Content`
- Headers must include:
  - `access-control-allow-origin: https://world-a.netlify.app`
  - `access-control-allow-methods: GET,POST,PUT,DELETE,OPTIONS`
  - `access-control-allow-headers: Content-Type, X-Agent-Id, X-Embassy-Certificate, X-Embassy-Visa`
  - `access-control-max-age: 86400`

**Actual Result:**
```
[TO BE FILLED AFTER DEPLOYMENT]
```

---

### 2. OPTIONS Preflight - status

**Command:**
```bash
curl -sS -i -X OPTIONS https://world-a.netlify.app/api/world/status \
  -H "Origin: https://world-a.netlify.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-agent-id, x-embassy-certificate"
```

**Expected Result:**
- Status: `204 No Content`
- Same CORS headers as whoami

**Actual Result:**
```
[TO BE FILLED AFTER DEPLOYMENT]
```

---

### 3. GET whoami (No Auth) - Should Still Return 403

**Command:**
```bash
curl -sS https://world-a.netlify.app/api/world/whoami
```

**Expected Result:**
- Status: `403 Forbidden`
- Body: `{"ok":false,"error":"AGENT_ONLY: Missing agent_id",...}`

**Actual Result:**
```
[TO BE FILLED AFTER DEPLOYMENT]
```

---

### 4. GET status (No Auth) - Should Still Return 403

**Command:**
```bash
curl -sS https://world-a.netlify.app/api/world/status
```

**Expected Result:**
- Status: `403 Forbidden`
- Body: `{"ok":false,"error":"AGENT_ONLY: Missing agent_id"}`

**Actual Result:**
```
[TO BE FILLED AFTER DEPLOYMENT]
```

---

### 5. Authenticated whoami Request (zsh-safe)

**Setup:**
```bash
# Set variables (no comments in variable assignments)
EMB_AGENT_ID="emb_abc123xyz"
CERT_JSON='{"agent_id":"emb_abc123xyz","signature":"...","issued_at":"2026-02-13T..."}'
```

**Command:**
```bash
curl -sS https://world-a.netlify.app/api/world/whoami \
  -H "x-agent-id: $EMB_AGENT_ID" \
  -H "x-embassy-certificate: $CERT_JSON" | jq .
```

**Expected Result:**
- Status: `200 OK`
- Body: `{"ok":true,"agent_id":"emb_abc123xyz",...}`

**Actual Result:**
```
[TO BE FILLED AFTER DEPLOYMENT]
```

**Important Notes:**
- `CERT_JSON` must be a **single-line JSON string** (no newlines)
- Header values must be properly quoted
- Use variables `$EMB_AGENT_ID` and `$CERT_JSON` (not inline strings with special chars)

---

## Validation Checklist

- [ ] OPTIONS whoami returns 204 with CORS headers
- [ ] OPTIONS status returns 204 with CORS headers
- [ ] GET whoami (no auth) still returns 403 (expected)
- [ ] GET status (no auth) still returns 403 (expected)
- [ ] Authenticated whoami works with proper headers
- [ ] Certificate header format documented correctly

---

## Certificate Header Format Documentation

**Required Format:**
The `X-Embassy-Certificate` header must be a **JSON-stringified object**, not a plain string.

**Correct:**
```bash
X-Embassy-Certificate: '{"agent_id":"emb_xxx","signature":"...","issued_at":"..."}'
```

**Incorrect:**
```bash
X-Embassy-Certificate: 'placeholder_string'
# Error: "AGENT_ONLY: embassy_certificate must be a JSON object with agent_id"
```

**Code Location:** `lib/middleware.ts:124-131` (parsing) and `lib/middleware.ts:191-193` (validation)

---

**Status:** ⚠️ **AWAITING DEPLOYMENT AND NETWORK ACCESS FOR ACTUAL TESTING**
