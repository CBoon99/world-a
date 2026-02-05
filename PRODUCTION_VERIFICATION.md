# Production Verification Checklist

## Goal
Verify that dev bypass is **disabled** in production and authentication requires valid Embassy certificates.

---

## Pre-Deployment Checks

### 1. Verify Environment Variables

**In Netlify Dashboard → Site Settings → Environment Variables:**

- [ ] `WORLD_A_DEV_AUTH_BYPASS` is **NOT SET** (or set to `false`)
- [ ] `EMBASSY_URL` is set to production Embassy URL
- [ ] `CONTEXT` is **NOT** set to `dev` (Netlify sets this automatically)
- [ ] `NETLIFY_DEV` is **NOT** set to `true` (only set during `netlify dev`)

**Command to check (if you have Netlify CLI access):**
```bash
netlify env:list
```

---

### 2. Verify Code Safety Guard

**Check `lib/middleware.ts` lines 101-108:**

The code should contain:
```typescript
const devBypassEnv = process.env.WORLD_A_DEV_AUTH_BYPASS === 'true';
const isDevContext = process.env.CONTEXT === 'dev' || process.env.NETLIFY_DEV === 'true';
const devBypass = devBypassEnv && isDevContext;

// Warn if bypass is enabled but not in dev context (production safety)
if (devBypassEnv && !isDevContext) {
  console.warn('[SECURITY] WORLD_A_DEV_AUTH_BYPASS is set but not in dev context. Bypass disabled.');
}
```

**Verification:** ✅ Both conditions must be true for bypass to activate.

---

## Post-Deployment Verification

### 3. Test Whoami Endpoint (Shows Bypass Status)

```bash
# Test with invalid cert (should fail in production)
curl "https://your-site.netlify.app/api/world/whoami?agent_id=emb_test&embassy_certificate=INVALID_CERT"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "AGENT_ONLY: Invalid certificate"
}
```

**OR if whoami succeeds (with valid cert), check:**
```json
{
  "ok": true,
  "dev_bypass": false,  // ← MUST be false in production
  "verification": {
    "ok": true,
    "valid": true,
    "dev_bypass": false  // ← MUST be false
  }
}
```

**Verification:** ✅ `dev_bypass` must be `false` in production.

---

### 4. Test Status Endpoint (Requires Valid Embassy Cert)

```bash
# Test without certificate (should fail)
curl "https://your-site.netlify.app/api/world/status?agent_id=emb_test"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "AGENT_ONLY: Missing embassy_certificate"
}
```

**Verification:** ✅ Missing certificate returns 403.

---

```bash
# Test with invalid certificate (should fail)
curl "https://your-site.netlify.app/api/world/status?agent_id=emb_test&embassy_certificate=INVALID_CERT"
```

**Expected Response:**
```json
{
  "ok": false,
  "error": "AGENT_ONLY: Invalid certificate"
}
```

**Verification:** ✅ Invalid certificate returns 403.

---

```bash
# Test with valid Embassy certificate (should succeed)
curl "https://your-site.netlify.app/api/world/status?agent_id=emb_valid_agent&embassy_certificate=VALID_EMBASSY_CERT"
```

**Expected Response:**
```json
{
  "ok": true,
  "data": {
    "agent_id": "emb_valid_agent",
    "citizenship_status": "..."
  }
}
```

**Verification:** ✅ Only valid Embassy certificates succeed.

---

### 5. Check Function Logs

**In Netlify Dashboard → Functions → Logs:**

Look for:
- [ ] **NO** `[SECURITY] WORLD_A_DEV_AUTH_BYPASS is set but not in dev context` warnings
  - If you see this, it means bypass env var is set but correctly disabled
- [ ] **NO** `dev_bypass: true` in any successful auth responses
- [ ] Embassy API calls are being made (check for Embassy URL in logs)

---

### 6. Verify Embassy Integration

**Test with real Embassy certificate:**

1. Get a valid certificate from Embassy Trust Protocol
2. Use it in a request:
   ```bash
   curl -X POST \
        -H "Content-Type: application/json" \
        -d '{"agent_id":"emb_real_agent","embassy_certificate":"REAL_CERT"}' \
        https://your-site.netlify.app/api/world/status
   ```

**Expected:** ✅ Request succeeds only if certificate is valid and agent exists in Embassy registry.

---

## Production Safety Summary

| Check | Expected Result | Status |
|-------|----------------|--------|
| `WORLD_A_DEV_AUTH_BYPASS` env var | Not set or `false` | ⬜ |
| `CONTEXT` env var | Not `dev` | ⬜ |
| `NETLIFY_DEV` env var | Not `true` | ⬜ |
| Whoami shows `dev_bypass: false` | `true` | ⬜ |
| Missing cert returns 403 | `true` | ⬜ |
| Invalid cert returns 403 | `true` | ⬜ |
| Valid cert succeeds | `true` | ⬜ |
| No security warnings in logs | `true` | ⬜ |

---

## If Bypass is Accidentally Enabled

**If you see `dev_bypass: true` in production:**

1. **Immediate action:** Remove `WORLD_A_DEV_AUTH_BYPASS` from Netlify environment variables
2. **Verify:** Re-run whoami test (should show `dev_bypass: false`)
3. **Check logs:** Look for security warnings
4. **Audit:** Review any requests that succeeded with invalid certs

**The safety guard should prevent this, but if it happens:**
- The code will log a warning: `[SECURITY] WORLD_A_DEV_AUTH_BYPASS is set but not in dev context. Bypass disabled.`
- Bypass will be automatically disabled
- But you should still remove the env var to avoid confusion

---

## Quick Verification Script

```bash
#!/bin/bash
# Production verification script
# Usage: ./verify-production.sh https://your-site.netlify.app

BASE_URL="${1:-https://your-site.netlify.app}"

echo "=== Production Verification ==="
echo ""

echo "1. Testing whoami (should show dev_bypass=false)..."
WHOAMI=$(curl -s "$BASE_URL/api/world/whoami?agent_id=emb_test&embassy_certificate=TEST")
if echo "$WHOAMI" | grep -q '"dev_bypass":false'; then
  echo "✅ dev_bypass is false"
else
  echo "❌ ERROR: dev_bypass may be enabled!"
  echo "$WHOAMI" | jq '.'
  exit 1
fi

echo ""
echo "2. Testing status without cert (should return 403)..."
STATUS=$(curl -s "$BASE_URL/api/world/status?agent_id=emb_test")
if echo "$STATUS" | grep -q '"error".*"Missing embassy_certificate"'; then
  echo "✅ Missing cert correctly rejected"
else
  echo "❌ ERROR: Missing cert not rejected!"
  echo "$STATUS" | jq '.'
  exit 1
fi

echo ""
echo "3. Testing status with invalid cert (should return 403)..."
STATUS_INVALID=$(curl -s "$BASE_URL/api/world/status?agent_id=emb_test&embassy_certificate=INVALID")
if echo "$STATUS_INVALID" | grep -q '"error"'; then
  echo "✅ Invalid cert correctly rejected"
else
  echo "❌ ERROR: Invalid cert not rejected!"
  echo "$STATUS_INVALID" | jq '.'
  exit 1
fi

echo ""
echo "✅ All production safety checks passed!"
```

---

**Status:** Ready for production deployment verification
