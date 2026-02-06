# Node Version Fix — Final Report

## Problem Identified
- **Local Node:** v20.20.0 (ABI 115)
- **Netlify Dev Runtime:** Node 22 (ABI 127)
- **better-sqlite3:** Compiled for ABI 127, runtime uses ABI 115
- **Error:** `better_sqlite3.node compiled for NODE_MODULE_VERSION 127`

---

## Files Changed

### 1. `package.json`
**Line 15:** `"node": ">=22.0.0"` → `"node": ">=20.20.0"`  
**Lines 11-12:** Added:
```json
"postinstall": "npm run rebuild-sqlite",
"rebuild-sqlite": "npm rebuild better-sqlite3 --build-from-source || echo 'Warning: better-sqlite3 rebuild failed (may not have build tools)'"
```

**Why:** Ensures package requires Node 20 and auto-rebuilds better-sqlite3 after install.

---

### 2. `.nvmrc`
**Content:** `22` → `20.20.0`

**Why:** Ensures fnm/nvm uses Node 20.20.0 when entering this directory.

---

### 3. `netlify.toml`
**Added:**
```toml
[build.environment]
  NODE_VERSION = "20"
```

**Why:** Forces Netlify Dev and Netlify Build to use Node 20 instead of default (22).

---

### 4. `.gitignore`
**Line 16:** `.netlify` → `.netlify/` (more explicit)

**Why:** Ensures cached binaries in `.netlify/functions-serve/` are cleaned on fresh installs.

---

### 5. `netlify/functions/health.ts`
**Added to response:**
```typescript
node_version: process.version,
node_abi: process.versions.modules,
```

**Why:** Allows verification of Node ABI in function runtime.

---

## Verification Scripts Created

### `verify-node-abi.sh`
Quick check for Node ABI compatibility (30 seconds)

### `verify-fix.sh`
Complete verification including:
- Node version/ABI check
- Clean install
- better-sqlite3 verification
- Netlify Dev startup
- Health endpoint test
- ABI error detection

---

## Run This From Repo Root

```bash
# Quick check
./verify-node-abi.sh

# Complete verification
./verify-fix.sh

# OR manual steps:
fnm use 20.20.0
rm -rf node_modules .netlify
npm ci
npm run build
npx netlify dev --debug

# In another terminal:
curl -i http://localhost:8888/api/world/health
# Expected: HTTP/1.1 200 OK with "node_abi":"115"
```

---

## Expected Results

✅ `node -v` → `v20.20.0`  
✅ `node -p "process.versions.modules"` → `115`  
✅ `npm ci` → Rebuilds better-sqlite3 for ABI 115  
✅ `npx netlify dev` → No ABI errors, starts successfully  
✅ `curl http://localhost:8888/api/world/health` → `200 OK` with `"node_abi":"115"`

---

## If Netlify Dev Still Uses Wrong Node

If `netlify dev` spawns Node 22 despite fixes:

```bash
# Option 1: Source fnm env
eval "$(fnm env --use-on-cd)"
npx netlify dev --debug

# Option 2: Explicit PATH
PATH="$(fnm env --use-on-cd | grep PATH | cut -d'=' -f2 | tr -d '\"'):$PATH" npx netlify dev --debug

# Option 3: fnm exec
fnm exec --using=20.20.0 -- npx netlify dev --debug
```

---

## Git Diff Summary

```diff
package.json:
- "node": ">=22.0.0"
+ "node": ">=20.20.0"
+ "postinstall": "npm run rebuild-sqlite"
+ "rebuild-sqlite": "npm rebuild better-sqlite3 --build-from-source || ..."

.nvmrc:
- 22
+ 20.20.0

netlify.toml:
+ [build.environment]
+   NODE_VERSION = "20"

.gitignore:
+ .netlify/

netlify/functions/health.ts:
+ node_version: process.version,
+ node_abi: process.versions.modules,
```

---

**Status:** ✅ All fixes applied, ready for verification
