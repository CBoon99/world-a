# Node Version Fix — Verification Report

## Files Changed

### 1. `package.json`
**Line 13:** Changed `engines.node` from `">=22.0.0"` to `">=20.20.0"`  
**Lines 5-11:** Added `postinstall` and `rebuild-sqlite` scripts

### 2. `.nvmrc`
**Content:** Changed from `22` to `20.20.0`

### 3. `netlify.toml`
**Added:** `[build.environment]` section with `NODE_VERSION = "20"`

### 4. `.gitignore`
**Line 16:** Updated to ignore `.netlify/` directory (includes cached binaries)

### 5. `verify-node-abi.sh` (NEW)
**Purpose:** Verification script to check Node ABI matches expected value (115)

---

## What Was Wrong

1. **package.json** required Node 22, but local dev uses Node 20.20.0
2. **.nvmrc** was set to 22, causing version mismatch
3. **netlify.toml** had no NODE_VERSION specified, so Netlify used default (22)
4. **better-sqlite3** was compiled for Node 22 ABI (127) but runtime uses Node 20 ABI (115)
5. **Cached binaries** in `.netlify/functions-serve/` had wrong ABI

---

## Why This Fixes It

1. **package.json engines** now matches local Node version (20.20.0)
2. **.nvmrc** ensures fnm/nvm uses Node 20.20.0
3. **netlify.toml NODE_VERSION** forces Netlify Dev to use Node 20
4. **postinstall script** rebuilds better-sqlite3 for correct ABI after install
5. **.gitignore** ensures cached binaries are cleaned on fresh installs

---

## Verification Commands

Run from repo root:

```bash
# 1. Clean everything
rm -rf node_modules .netlify

# 2. Ensure correct Node version (via fnm)
fnm use 20.20.0
# OR if using nvm:
# nvm use 20.20.0

# 3. Verify Node ABI
node -v
# Should show: v20.20.0

node -p "process.versions.modules"
# Should show: 115

# 4. Install dependencies (will trigger postinstall rebuild)
npm ci

# 5. Verify better-sqlite3 loads
node -e "require('better-sqlite3'); console.log('✅ better-sqlite3 OK')"

# 6. Start Netlify Dev (in background or separate terminal)
npx netlify dev --debug &
NETLIFY_PID=$!

# 7. Wait for server to start (adjust sleep if needed)
sleep 10

# 8. Verify server is running
curl -i http://localhost:8888/api/world/health
# Should return: HTTP/1.1 200 OK

# 9. Check Node ABI in function runtime (via health endpoint)
curl -s http://localhost:8888/api/world/health | jq '.node_abi // "not reported"'
# Should show: 115 (if endpoint reports it)

# 10. Cleanup
kill $NETLIFY_PID 2>/dev/null || true
```

---

## Quick Verification Script

```bash
#!/bin/bash
# Run from repo root

echo "=== Node Version Fix Verification ==="
echo ""

# Check Node version
NODE_VERSION=$(node -v)
NODE_ABI=$(node -p "process.versions.modules")
echo "Node: $NODE_VERSION (ABI: $NODE_ABI)"

if [ "$NODE_ABI" != "115" ]; then
  echo "❌ Wrong Node ABI! Expected 115, got $NODE_ABI"
  echo "Run: fnm use 20.20.0"
  exit 1
fi

# Clean and rebuild
echo ""
echo "Cleaning..."
rm -rf node_modules .netlify

echo "Installing..."
npm ci

echo "Verifying better-sqlite3..."
node -e "require('better-sqlite3'); console.log('✅ better-sqlite3 OK')" || {
  echo "❌ better-sqlite3 failed to load"
  exit 1
}

echo ""
echo "✅ All checks passed!"
echo "Now run: npx netlify dev --debug"
```

---

## Expected Results

After fixes:
- ✅ `node -v` → `v20.20.0`
- ✅ `node -p "process.versions.modules"` → `115`
- ✅ `npm ci` → Installs and rebuilds better-sqlite3 for ABI 115
- ✅ `npx netlify dev` → Uses Node 20, no ABI errors
- ✅ `curl http://localhost:8888/api/world/health` → `200 OK`

---

## If Issues Persist

1. **Netlify Dev still uses wrong Node:**
   - Check `which node` in terminal (should be fnm path)
   - Run `fnm env --use-on-cd | source` before `netlify dev`
   - Or: `PATH="$(fnm env --use-on-cd | grep PATH | cut -d'=' -f2):$PATH" npx netlify dev`

2. **better-sqlite3 still fails:**
   - Manually rebuild: `npm rebuild better-sqlite3 --build-from-source`
   - Check build tools: `node -p "process.versions.modules"` (must be 115)

3. **Cached binaries:**
   - Delete `.netlify/` folder completely
   - Restart Netlify Dev
