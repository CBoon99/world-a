# Run This From Repo Root

## Quick Verification (30 seconds)

```bash
./verify-node-abi.sh
```

## Complete Verification (2-3 minutes)

```bash
./verify-fix.sh
```

## Manual Steps (if scripts don't work)

```bash
# 1. Ensure correct Node version
fnm use 20.20.0
# OR: nvm use 20.20.0

# 2. Verify Node ABI
node -p "process.versions.modules"
# Must show: 115

# 3. Clean everything
rm -rf node_modules .netlify

# 4. Install (will auto-rebuild better-sqlite3)
npm ci

# 5. Verify better-sqlite3 loads
node -e "require('better-sqlite3'); console.log('✅ OK')"

# 6. Build
npm run build

# 7. Start Netlify Dev
npx netlify dev --debug

# 8. In another terminal, test:
curl -i http://localhost:8888/api/world/health
# Expected: HTTP/1.1 200 OK
# Response should include: "node_abi":"115"
```

## What Was Fixed

1. ✅ `package.json` engines: `>=22.0.0` → `>=20.20.0`
2. ✅ `.nvmrc`: `22` → `20.20.0`
3. ✅ `netlify.toml`: Added `NODE_VERSION = "20"`
4. ✅ `package.json`: Added `postinstall` script to rebuild better-sqlite3
5. ✅ `.gitignore`: Updated to ignore `.netlify/` (cached binaries)
6. ✅ `health.ts`: Added Node ABI reporting for verification

## Expected Results

- ✅ Node ABI: 115 (Node 20.20.0)
- ✅ better-sqlite3: Loads without ABI errors
- ✅ Netlify Dev: Starts without crashes
- ✅ Health endpoint: Returns 200 OK with `node_abi: "115"`

## If Netlify Dev Still Uses Wrong Node

```bash
# Force fnm Node in PATH
eval "$(fnm env --use-on-cd)"
npx netlify dev --debug

# OR use fnm exec
fnm exec --using=20.20.0 -- npx netlify dev --debug
```

---

**All fixes applied. Ready for verification.**
