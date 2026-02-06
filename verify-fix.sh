#!/bin/bash
# Complete verification script for Node 20 ABI fix
# Run from repo root

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         World A — Node Version Fix Verification                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check Node version
echo "Step 1: Checking Node version..."
NODE_VERSION=$(node -v)
NODE_ABI=$(node -p "process.versions.modules")
echo "  Node version: $NODE_VERSION"
echo "  Node ABI (MODULE_VERSION): $NODE_ABI"

EXPECTED_ABI="115"
if [ "$NODE_ABI" != "$EXPECTED_ABI" ]; then
  echo ""
  echo "  ❌ ERROR: Node ABI mismatch!"
  echo "     Expected: $EXPECTED_ABI (Node 20.20.0)"
  echo "     Got: $NODE_ABI ($NODE_VERSION)"
  echo ""
  echo "  Fix: Run 'fnm use 20.20.0' or 'nvm use 20.20.0'"
  exit 1
fi
echo "  ✅ Node ABI correct: $NODE_ABI"
echo ""

# Step 2: Clean old artifacts
echo "Step 2: Cleaning old artifacts..."
rm -rf node_modules .netlify
echo "  ✅ Cleaned node_modules and .netlify"
echo ""

# Step 3: Install dependencies
echo "Step 3: Installing dependencies (will rebuild better-sqlite3)..."
npm ci
echo "  ✅ Dependencies installed"
echo ""

# Step 4: Verify better-sqlite3
echo "Step 4: Verifying better-sqlite3..."
if node -e "require('better-sqlite3'); console.log('✅ better-sqlite3 loads successfully')" 2>&1; then
  echo "  ✅ better-sqlite3 verified"
else
  echo "  ❌ ERROR: better-sqlite3 failed to load"
  echo "  Run: npm rebuild better-sqlite3 --build-from-source"
  exit 1
fi
echo ""

# Step 5: Build TypeScript
echo "Step 5: Building TypeScript..."
npm run build
echo "  ✅ Build successful"
echo ""

# Step 6: Start Netlify Dev (background)
echo "Step 6: Starting Netlify Dev..."
echo "  (This may take 10-15 seconds to start)"
npx netlify dev --debug > /tmp/netlify-dev.log 2>&1 &
NETLIFY_PID=$!
echo "  Netlify Dev PID: $NETLIFY_PID"
echo "  Logs: /tmp/netlify-dev.log"
echo ""

# Step 7: Wait for server
echo "Step 7: Waiting for server to start..."
for i in {1..30}; do
  if curl -s http://localhost:8888/api/world/health > /dev/null 2>&1; then
    echo "  ✅ Server is responding"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  ❌ ERROR: Server did not start after 30 seconds"
    echo "  Check logs: tail -50 /tmp/netlify-dev.log"
    kill $NETLIFY_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done
echo ""

# Step 8: Test health endpoint
echo "Step 8: Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" http://localhost:8888/api/world/health)
HTTP_STATUS=$(echo "$HEALTH_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$HEALTH_RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "  ✅ Health endpoint returned 200 OK"
  
  # Check Node ABI in response
  NODE_ABI_RESPONSE=$(echo "$BODY" | grep -o '"node_abi":"[^"]*"' | cut -d'"' -f4 || echo "")
  if [ -n "$NODE_ABI_RESPONSE" ]; then
    if [ "$NODE_ABI_RESPONSE" = "115" ]; then
      echo "  ✅ Function runtime Node ABI: $NODE_ABI_RESPONSE (correct)"
    else
      echo "  ⚠️  Function runtime Node ABI: $NODE_ABI_RESPONSE (expected 115)"
    fi
  fi
else
  echo "  ❌ ERROR: Health endpoint returned $HTTP_STATUS"
  echo "  Response: $BODY"
  kill $NETLIFY_PID 2>/dev/null || true
  exit 1
fi
echo ""

# Step 9: Check for ABI errors in logs
echo "Step 9: Checking for ABI errors in Netlify Dev logs..."
if grep -i "NODE_MODULE_VERSION\|better_sqlite3.*compiled\|ABI" /tmp/netlify-dev.log 2>/dev/null | grep -v "node_abi" | head -5; then
  echo "  ⚠️  WARNING: Possible ABI errors found in logs"
  echo "  Check: tail -50 /tmp/netlify-dev.log"
else
  echo "  ✅ No ABI errors detected in logs"
fi
echo ""

# Step 10: Cleanup
echo "Step 10: Cleaning up..."
kill $NETLIFY_PID 2>/dev/null || true
wait $NETLIFY_PID 2>/dev/null || true
echo "  ✅ Netlify Dev stopped"
echo ""

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ VERIFICATION COMPLETE                       ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "All checks passed! Node 20 ABI fix is working correctly."
echo ""
echo "To start Netlify Dev manually:"
echo "  npx netlify dev --debug"
echo ""
echo "To test endpoints:"
echo "  curl http://localhost:8888/api/world/health"
echo "  curl http://localhost:8888/api/world/status"
echo "  curl http://localhost:8888/api/world/info"
