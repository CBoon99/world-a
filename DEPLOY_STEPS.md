# World A Authentication — Deploy Steps

**Date:** 2026-02-XX  
**Pre-deploy Status:** ✅ All checks pass

---

## Pre-Deploy Verification

```bash
# 1. Verify TypeScript compilation
cd "/Users/carlboon/Documents/World A"
npm run build

# Expected: No errors, clean build
```

---

## Deploy Commands

### Step 1: Commit Changes

```bash
cd "/Users/carlboon/Documents/World A"

# Stage all changes
git add lib/middleware.ts
git add netlify/functions/register.ts
git add netlify/functions/whoami.ts
git add SIGNOFF_WORLD_A_AUTH.md
git add FINAL_SIGNOFF_CHECKLIST.md
git add DEPLOY_STEPS.md

# Commit with descriptive message
git commit -m "feat(auth): finalize Embassy integration with CORS and agent-only enforcement

- Add CORS headers to authenticatedHandler (OPTIONS, success, error)
- Add agent_id prefix check (emb_) in register.ts and authenticateRequest()
- Improve error message for invalid certificate format
- Remove entity_type assumptions from code
- Update sign-off documentation

All invariants verified. Ready for production."
```

---

### Step 2: Push to Repository

```bash
# Push to main branch (or your deployment branch)
git push origin main

# If using a different branch:
# git push origin <branch-name>
```

---

### Step 3: Netlify Deploy Verification

**Option A: Automatic Deploy (if Netlify is connected to repo)**
- Netlify will automatically deploy on push
- Monitor deploy status in Netlify dashboard
- Wait for deploy to complete (typically 2-5 minutes)

**Option B: Manual Deploy (if using Netlify CLI)**
```bash
# Install Netlify CLI if not already installed
# npm install -g netlify-cli

# Deploy to production
netlify deploy --prod

# Or deploy a draft
netlify deploy
```

---

## Post-Deploy Verification Tests

### Test 1: OPTIONS Preflight (CORS)

```bash
curl -X OPTIONS https://world-a.netlify.app/api/world/commons/introductions \
  -H "Origin: https://world-a.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, X-Agent-Id, X-Embassy-Certificate" \
  -v

# Expected:
# Status: 204 No Content
# Headers:
#   Access-Control-Allow-Origin: *
#   Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
#   Access-Control-Allow-Headers: Content-Type, X-Agent-Id, X-Embassy-Certificate, X-Embassy-Visa
```

---

### Test 2: Registration Endpoint (Public)

```bash
# Replace <CERTIFICATE_OBJECT> with actual certificate from Embassy
curl -X POST https://world-a.netlify.app/api/world/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_test123",
    "embassy_certificate": <CERTIFICATE_OBJECT>,
    "data": {
      "name": "Test Agent"
    }
  }' \
  -v

# Expected:
# Status: 200 OK (or 403 if certificate invalid)
# Body: { "ok": true, "data": { "agent_id": "emb_test123", ... } }
```

---

### Test 3: Agent ID Mismatch (Spoof Prevention)

```bash
curl -X POST https://world-a.netlify.app/api/world/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_different",
    "embassy_certificate": {
      "agent_id": "emb_test123",
      "signature": "..."
    }
  }' \
  -v

# Expected:
# Status: 403 Forbidden
# Body: { "ok": false, "error": "AGENT_ID_MISMATCH", ... }
```

---

### Test 4: Non-emb_ Agent ID (Agent-Only Enforcement)

```bash
curl -X POST https://world-a.netlify.app/api/world/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "human_user",
    "embassy_certificate": {
      "agent_id": "human_user",
      "signature": "..."
    }
  }' \
  -v

# Expected:
# Status: 403 Forbidden
# Body: { "ok": false, "error": "INVALID_AGENT_ID", "message": "agent_id must start with emb_" }
```

---

### Test 5: Authenticated Endpoint (Registry Check)

```bash
# First, register successfully (from Test 2)
# Then test authenticated endpoint

curl -X POST https://world-a.netlify.app/api/world/commons/introductions \
  -H "Content-Type: application/json" \
  -H "X-Agent-Id: emb_test123" \
  -H "X-Embassy-Certificate: {\"agent_id\":\"emb_test123\",\"signature\":\"...\",...}" \
  -d '{
    "agent_id": "emb_test123",
    "embassy_certificate": <CERTIFICATE_OBJECT>,
    "data": {
      "title": "Test",
      "content": "Hello"
    }
  }' \
  -v

# Expected (if agent exists and not revoked):
# Status: 200 OK
# Headers: Access-Control-Allow-Origin: *, Access-Control-Allow-Headers: ...
# Body: { "ok": true, "data": ... }

# Expected (if agent revoked):
# Status: 403 Forbidden
# Body: { "ok": false, "error": "AGENT_ONLY", "message": "Agent not found or revoked" }
```

---

### Test 6: Already Registered (Returns 200, not 409)

```bash
# Register the same agent twice
curl -X POST https://world-a.netlify.app/api/world/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_test123",
    "embassy_certificate": <CERTIFICATE_OBJECT>
  }' \
  -v

# Expected (second registration):
# Status: 200 OK
# Body: { "ok": true, "data": { "agent_id": "emb_test123", "registered_at": "...", ... } }
```

---

## Rollback Plan (If Needed)

If post-deploy tests fail:

```bash
# Option 1: Revert to previous commit
git revert HEAD
git push origin main

# Option 2: Rollback via Netlify dashboard
# - Go to Netlify dashboard
# - Site settings → Deploys
# - Find previous successful deploy
# - Click "Publish deploy"
```

---

## Success Criteria

✅ All 6 post-deploy tests pass  
✅ CORS headers present on all responses  
✅ Agent-only enforcement working (emb_ prefix check)  
✅ Binding check prevents spoofing (agent_id mismatch fails)  
✅ Registry check works on authenticated endpoints  
✅ Registration returns 200 for existing agents

---

**Deploy Status:** Ready  
**Next Action:** Execute Step 1 (Commit Changes)
