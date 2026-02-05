# Authentication Fix — Test Plan

## Prerequisites

1. Start Netlify Dev:
   ```bash
   npx netlify dev --debug
   ```
   This automatically sets `NETLIFY_DEV=true`, which enables dev context.

2. Set environment variable for dev bypass (optional):
   ```bash
   export WORLD_A_DEV_AUTH_BYPASS=true
   # OR add to .env file:
   # WORLD_A_DEV_AUTH_BYPASS=true
   ```
   
   **Important:** Dev bypass only works when:
   - `WORLD_A_DEV_AUTH_BYPASS=true` **AND**
   - `CONTEXT=dev` OR `NETLIFY_DEV=true` (automatically set by `netlify dev`)
   
   **Production safety:** Bypass is automatically disabled in production builds.

---

## Test Cases

### 1. Health Endpoint (Public, No Auth Required)

```bash
curl -i http://localhost:8888/api/world/health
```

**Expected:** `HTTP/1.1 200 OK`  
**Response:** `{"ok":true,"service":"World A","version":"1.0.0",...}`

---

### 2. Status Endpoint — GET with Query Parameters

```bash
curl -i "http://localhost:8888/api/world/status?agent_id=emb_test_agent_123&embassy_certificate=TEST_CERT"
```

**Expected (with DEV_AUTH_BYPASS=true):** `HTTP/1.1 200 OK`  
**Expected (without bypass):** `HTTP/1.1 403 Forbidden` (Embassy API error)

---

### 3. Status Endpoint — GET with Headers

```bash
curl -i -H "X-Agent-ID: emb_test_agent_123" \
     -H "X-Embassy-Certificate: TEST_CERT" \
     http://localhost:8888/api/world/status
```

**Expected (with DEV_AUTH_BYPASS=true):** `HTTP/1.1 200 OK`  
**Expected (without bypass):** `HTTP/1.1 403 Forbidden`

---

### 4. Status Endpoint — POST with JSON Body

```bash
curl -i -X POST \
     -H "Content-Type: application/json" \
     -d '{"agent_id":"emb_test_agent_123","embassy_certificate":"TEST_CERT"}' \
     http://localhost:8888/api/world/status
```

**Expected (with DEV_AUTH_BYPASS=true):** `HTTP/1.1 200 OK`  
**Expected (without bypass):** `HTTP/1.1 403 Forbidden`

---

### 5. Info Endpoint — GET with Query Parameters

```bash
curl -i "http://localhost:8888/api/world/info?agent_id=emb_test_agent_123&embassy_certificate=TEST_CERT"
```

**Expected (with DEV_AUTH_BYPASS=true):** `HTTP/1.1 200 OK`  
**Expected (without bypass):** `HTTP/1.1 403 Forbidden`

---

### 6. Info Endpoint — GET with Headers

```bash
curl -i -H "X-Agent-ID: emb_test_agent_123" \
     -H "X-Embassy-Certificate: TEST_CERT" \
     http://localhost:8888/api/world/info
```

**Expected (with DEV_AUTH_BYPASS=true):** `HTTP/1.1 200 OK`  
**Expected (without bypass):** `HTTP/1.1 403 Forbidden`

---

### 7. Info Endpoint — POST with JSON Body

```bash
curl -i -X POST \
     -H "Content-Type: application/json" \
     -d '{"agent_id":"emb_test_agent_123","embassy_certificate":"TEST_CERT"}' \
     http://localhost:8888/api/world/info
```

**Expected (with DEV_AUTH_BYPASS=true):** `HTTP/1.1 200 OK`  
**Expected (without bypass):** `HTTP/1.1 403 Forbidden`

---

### 8. Whoami Debug Endpoint — GET with Query

```bash
curl -i "http://localhost:8888/api/world/whoami?agent_id=emb_test_agent_123&embassy_certificate=TEST_CERT_123456"
```

**Expected (with DEV_AUTH_BYPASS=true):** 
- `HTTP/1.1 200 OK`
- Response includes: `"dev_bypass":true`, `"certificate_preview":"...3456"`

**Expected (without bypass):**
- `HTTP/1.1 403 Forbidden` (if Embassy is down)
- OR `HTTP/1.1 200 OK` (if Embassy is up and cert is valid)

---

### 9. Whoami Debug Endpoint — GET with Headers

```bash
curl -i -H "X-Agent-ID: emb_test_agent_123" \
     -H "X-Embassy-Certificate: TEST_CERT_123456" \
     http://localhost:8888/api/world/whoami
```

**Expected:** Same as test 8

---

### 10. Whoami Debug Endpoint — POST with Body

```bash
curl -i -X POST \
     -H "Content-Type: application/json" \
     -d '{"agent_id":"emb_test_agent_123","embassy_certificate":"TEST_CERT_123456"}' \
     http://localhost:8888/api/world/whoami
```

**Expected:** Same as test 8

---

### 11. Missing agent_id (Should Fail)

```bash
curl -i http://localhost:8888/api/world/status
```

**Expected:** `HTTP/1.1 403 Forbidden`  
**Response:** `{"ok":false,"error":"AGENT_ONLY: Missing agent_id"}`

---

### 12. Missing embassy_certificate (Should Fail in Production)

```bash
curl -i "http://localhost:8888/api/world/status?agent_id=emb_test_agent_123"
```

**Expected (with DEV_AUTH_BYPASS=true):** `HTTP/1.1 200 OK` (bypass allows it)  
**Expected (without bypass):** `HTTP/1.1 403 Forbidden`  
**Response:** `{"ok":false,"error":"AGENT_ONLY: Missing embassy_certificate"}`

---

## Verification Checklist

- [ ] Health endpoint returns 200 (no auth required)
- [ ] Status endpoint works with GET + query params (with dev bypass)
- [ ] Status endpoint works with GET + headers (with dev bypass)
- [ ] Status endpoint works with POST + body (with dev bypass)
- [ ] Info endpoint works with GET + query params (with dev bypass)
- [ ] Info endpoint works with GET + headers (with dev bypass)
- [ ] Info endpoint works with POST + body (with dev bypass)
- [ ] Whoami endpoint shows correct extraction (query/header/body)
- [ ] Whoami endpoint shows dev_bypass status
- [ ] Missing agent_id returns 403
- [ ] Missing embassy_certificate returns 403 (without bypass) or 200 (with bypass)

---

## Quick Test Script

```bash
#!/bin/bash
# Run with: ./test-auth.sh

BASE_URL="http://localhost:8888"
AGENT_ID="emb_test_agent_123"
CERT="TEST_CERT_123456"

echo "=== Test 1: Health (public) ==="
curl -s "$BASE_URL/api/world/health" | jq '.ok'

echo ""
echo "=== Test 2: Status GET with query ==="
curl -s "$BASE_URL/api/world/status?agent_id=$AGENT_ID&embassy_certificate=$CERT" | jq '.ok'

echo ""
echo "=== Test 3: Status GET with headers ==="
curl -s -H "X-Agent-ID: $AGENT_ID" -H "X-Embassy-Certificate: $CERT" \
     "$BASE_URL/api/world/status" | jq '.ok'

echo ""
echo "=== Test 4: Status POST with body ==="
curl -s -X POST -H "Content-Type: application/json" \
     -d "{\"agent_id\":\"$AGENT_ID\",\"embassy_certificate\":\"$CERT\"}" \
     "$BASE_URL/api/world/status" | jq '.ok'

echo ""
echo "=== Test 5: Whoami (debug) ==="
curl -s "$BASE_URL/api/world/whoami?agent_id=$AGENT_ID&embassy_certificate=$CERT" | jq '{ok, dev_bypass, method, query_seen, headers_seen}'
```

---

## Notes

- All tests assume `WORLD_A_DEV_AUTH_BYPASS=true` is set for local dev
- In production (without bypass), tests will fail if Embassy API is down or certs are invalid
- The whoami endpoint is useful for debugging auth extraction
- Certificate is never fully exposed in responses (only preview in dev bypass mode)
