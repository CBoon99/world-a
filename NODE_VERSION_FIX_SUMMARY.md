# Node Version Fix — Complete Summary

## Problem
- Local Node: v20.20.0 (ABI 115)
- Netlify Dev: Using Node 22 (ABI 127)
- better-sqlite3: Compiled for ABI 127, but runtime uses ABI 115
- Result: `better_sqlite3.node compiled for NODE_MODULE_VERSION 127` error

## Solution
Pinned all Node version references to 20.20.0 and ensured better-sqlite3 rebuilds for correct ABI.

---

## Files Changed

### 1. `package.json`
**Changes:**
- Line 13: `"node": ">=22.0.0"` → `"node": ">=20.20.0"`
- Lines 5-11: Added scripts:
  ```json
  "postinstall": "npm run rebuild-sqlite",
  "rebuild-sqlite": "npm rebuild better-sqlite3 --build-from-source || echo 'Warning: better-sqlite3 rebuild failed (may not have build tools)'"
  ```

**Why:** Ensures package.json requires Node 20, and automatically rebuilds better-sqlite3 after install.

---

### 2. `.nvmrc`
**Changes:**
- Content: `22` → `20.20.0`

**Why:** Ensures fnm/nvm uses Node 20.20.0 when switching to this directory.

---

### 3. `netlify.toml`
**Changes:**
- Added section:
  ```toml
  [build.environment]
    NODE_VERSION = "20"
  ```

**Why:** Forces Netlify Dev and Netlify Build to use Node 20 instead of default (22).

---

### 4. `.gitignore`
**Changes:**
- Line 16: `.netlify` → `.netlify/` (more explicit)

**Why:** Ensures cached binaries in `.netlify/functions-serve/` are not committed and can be cleaned.

---

### 5. `netlify/functions/health.ts`
**Changes:**
- Added to response:
  ```typescript
  node_version: process.version,
  node_abi: process.versions.modules,
  ```

**Why:** Allows verification of Node ABI in function runtime via health endpoint.

---

### 6. `verify-node-abi.sh` (NEW)
**Purpose:** Quick check script for Node ABI compatibility

---

### 7. `verify-fix.sh` (NEW)
**Purpose:** Complete verification script that:
- Checks Node version/ABI
- Cleans artifacts
- Installs dependencies
- Verifies better-sqlite3
- Starts Netlify Dev
- Tests health endpoint
- Checks for ABI errors

---

## Run This From Repo Root

```bash
# Quick verification (checks Node ABI only)
./verify-node-abi.sh

# Complete verification (full test)
./verify-fix.sh

# Manual steps:
# 1. Ensure correct Node version
fnm use 20.20.0
# OR: nvm use 20.20.0

# 2. Clean and rebuild
rm -rf node_modules .netlify
npm ci

# 3. Verify better-sqlite3
node -e "require('better-sqlite3'); console.log('✅ OK')"

# 4. Start Netlify Dev
npx netlify dev --debug

# 5. In another terminal, test:
curl -i http://localhost:8888/api/world/health
# Should return: HTTP/1.1 200 OK
# Response should include: "node_abi":"115"
```

---

## Expected Results

After running verification:

✅ `node -v` → `v20.20.0`  
✅ `node -p "process.versions.modules"` → `115`  
✅ `npm ci` → Rebuilds better-sqlite3 for ABI 115  
✅ `npx netlify dev` → No ABI errors  
✅ `curl http://localhost:8888/api/world/health` → `200 OK` with `"node_abi":"115"`

---

## If Netlify Dev Still Uses Wrong Node

If `netlify dev` still spawns Node 22, ensure fnm Node is in PATH:

```bash
# Option 1: Source fnm env before running
eval "$(fnm env --use-on-cd)"
npx netlify dev --debug

# Option 2: Explicit PATH
PATH="$(fnm env --use-on-cd | grep PATH | cut -d'=' -f2 | tr -d '\"'):$PATH" npx netlify dev --debug

# Option 3: Use fnm exec
fnm exec --using=20.20.0 -- npx netlify dev --debug
```

---

## Production Note

The `postinstall` script will attempt to rebuild better-sqlite3, but includes a fallback message if build tools are missing. This is safe for Netlify production builds which may use prebuilt binaries.

If production builds fail, you can:
1. Use Netlify's Node 20 runtime (set via `NODE_VERSION = "20"` in netlify.toml)
2. Or use prebuilt better-sqlite3 binaries (if available for your platform)

---

**Status:** ✅ All fixes applied, ready for verification
