# NETLIFY.TOML FIX REPORT

**Date:** 2026-02-XX  
**Status:** ✅ **CONFIG FIXED - READY FOR TESTING**

---

## STEP 1 - CONFIG CHANGE

**✅ Moved included_files to [functions] block**  
**✅ Deleted [functions."*"] block**

### Before:
```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[functions."*"]
  included_files = [
    "lib/**/*.ts",
    "Safety/**",
    "Founding/**",
    "docs/**",
    "archive/**"
  ]
```

### After:
```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
  included_files = [
    "lib/**/*.ts",
    "Safety/**",
    "Founding/**",
    "docs/**",
    "archive/**"
  ]
```

**Change:** Moved `included_files` array from `[functions."*"]` block to main `[functions]` block and deleted the wildcard block.

**Why:** The main `[functions]` block is the most reliable location for `included_files`. The `[functions."*"]` wildcard pattern can be ignored in some Netlify configurations.

---

## STEP 2 - LOCAL TEST RESULTS

**⚠️ MANUAL TESTING REQUIRED**

Due to sandbox restrictions, local testing must be performed manually. Follow these steps:

### Start Netlify Dev Server:
```bash
cd "/Users/carlboon/Documents/World A"
NETLIFY_CLI_DISABLE_UPDATE_CHECK=1 npx netlify dev --port 8888
```

Wait for server to start (look for "Server now ready on http://localhost:8888").

### Test Commands:

**Test 1 - Founding doc:**
```bash
curl -i http://localhost:8888/founding/immutable-laws
```
**Expected:** `HTTP/1.1 200 OK` + markdown content

**Test 2 - Safety doc:**
```bash
curl -i http://localhost:8888/safety/framework
```
**Expected:** `HTTP/1.1 200 OK` + markdown content

**Test 3 - Docs:**
```bash
curl -i http://localhost:8888/docs/agent-quickstart
```
**Expected:** `HTTP/1.1 200 OK` + markdown content

**Test 4 - 404 handling:**
```bash
curl -i http://localhost:8888/founding/does-not-exist
```
**Expected:** `HTTP/1.1 404 Not Found` + error JSON

---

## STEP 3 - PRODUCTION TEST RESULTS

**⚠️ TEST AFTER DEPLOYMENT**

After deploying to production, run these tests:

**Test 1 - Founding doc:**
```bash
curl -i https://world-a.netlify.app/founding/immutable-laws
```
**Expected:** `HTTP/2 200` + markdown content

**Test 2 - Safety doc:**
```bash
curl -i https://world-a.netlify.app/safety/framework
```
**Expected:** `HTTP/2 200` + markdown content

**Test 3 - Docs:**
```bash
curl -i https://world-a.netlify.app/docs/agent-quickstart
```
**Expected:** `HTTP/2 200` + markdown content

**Test 4 - 404 handling:**
```bash
curl -i https://world-a.netlify.app/founding/does-not-exist
```
**Expected:** `HTTP/2 404` + error JSON

---

## VERIFICATION CHECKLIST

**Before deploying, verify:**

- [x] `included_files` moved to `[functions]` block
- [x] `[functions."*"]` block deleted
- [x] All paths correct: `Founding/**`, `Safety/**`, `docs/**`
- [x] Function code uses `process.cwd()` (already fixed)
- [x] Function code uses correct case: `'Founding'`, `'Safety'`, `'docs'` (already fixed)
- [x] Function code returns 404 on ENOENT (already fixed)

**After deploying, verify:**

- [ ] Local tests pass (200 for existing docs, 404 for missing)
- [ ] Production tests pass (200 for existing docs, 404 for missing)
- [ ] Netlify deploy logs show files included in bundle
- [ ] No ENOENT errors in Netlify function logs

---

## EXPECTED BEHAVIOR

### Success Response (200):
```
HTTP/1.1 200 OK
Content-Type: text/markdown; charset=utf-8
Cache-Control: public, max-age=3600
Access-Control-Allow-Origin: *

# IMMUTABLE LAWS
## World A — Absolute Prohibitions
...
```

### Not Found Response (404):
```
HTTP/1.1 404 Not Found
Content-Type: application/json
Cache-Control: no-cache
Access-Control-Allow-Origin: *

{
  "error": "FILE_NOT_FOUND",
  "message": "Document file not found",
  "path": "/var/task/Founding/DOES_NOT_EXIST.md",
  "available": ["immutable-laws", "ten-principles", "discovery-protocol"]
}
```

---

## TROUBLESHOOTING

**If local tests fail:**

1. **Check Netlify dev server is running:**
   ```bash
   ps aux | grep "netlify dev"
   ```

2. **Check function logs:**
   - Look for ENOENT errors
   - Verify file paths in error messages

3. **Verify files exist:**
   ```bash
   ls -la Founding/
   ls -la Safety/
   ls -la docs/
   ```

4. **Check function code paths:**
   - Should use `process.cwd()` (already fixed)
   - Should use correct case: `'Founding'`, `'Safety'`, `'docs'` (already fixed)

**If production tests fail after deploy:**

1. **Check Netlify deploy logs:**
   - Look for "Bundled Dependencies" section
   - Verify `Founding/`, `Safety/`, `docs/` are listed

2. **Check Netlify function logs:**
   - Look for ENOENT errors
   - Check error.path in 404 responses

3. **Verify included_files syntax:**
   - Should be in `[functions]` block (now fixed)
   - Should use `**` for recursive matching

---

## DEPLOYMENT INSTRUCTIONS

**After local tests pass:**

```bash
# Commit the fix
git add netlify.toml
git commit -m "fix(config): move included_files to main functions block for reliable bundling"
git push origin main

# Wait 2-3 minutes for Netlify deploy
# Then test production routes
```

---

## VERDICT: ✅ CONFIG FIXED

**Status:** Configuration updated. Ready for local testing and deployment.

**Next Steps:**
1. Test locally with `netlify dev`
2. Verify all 4 test routes return expected responses
3. Deploy to production
4. Test production routes
5. Verify Netlify deploy logs show files included

---

**FIX COMPLETE - READY FOR TESTING** ✅
