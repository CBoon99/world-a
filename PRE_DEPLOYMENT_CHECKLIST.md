# World A — Pre-Deployment Checklist

**Date:** 3rd February 2026  
**Status:** Pre-Launch Verification

---

## 1. Local Smoke Test

**Status:** ⚠️ Code Complete — Manual Testing Required

**Test Sequence:**
```bash
# Start dev server
EMBASSY_URL=https://embassy-trust-protocol.netlify.app \
DATABASE_URL=./data/world-a.db \
VOTE_SALT=test-salt-local \
npx netlify dev
```

**Critical Paths to Test:**
- [ ] **Health:** `GET /api/world/health` — Should return service status
- [ ] **Registration:** `POST /api/world/register` — Requires valid Embassy cert
- [ ] **Status:** `GET /api/world/status` — Should show citizenship status
- [ ] **Plot Claim:** `POST /api/world/plots/claim` 
  - [ ] Should fail if not citizen ✓ (code check: citizenship verified in `claim.ts`)
  - [ ] Should succeed after registration ✓
- [ ] **Storage Write:** `POST /api/world/storage/write`
  - [ ] Should enforce quota ✓ (code check: quota checked before write in `storage-write.ts`)
- [ ] **Backup:** `POST /api/world/continuity/backup`
  - [ ] Should encrypt ✓ (code check: `encryptBackup()` in `lib/encryption.ts`)
- [ ] **Restore:** `POST /api/world/continuity/restore`
  - [ ] Should decrypt and verify hash ✓ (code check: `decryptBackup()` + hash verification)
- [ ] **Civility - Message with "please":** `POST /api/world/message`
  - [ ] Should require civility ✓ (code check: `enforceCivility()` in `message.ts`)
  - [ ] Should create pending_gratitude ✓ (code check: `pending_gratitude` insert in `message.ts`)
- [ ] **Civility - Message without "please":** `POST /api/world/message`
  - [ ] Should return POLITENESS_VIOLATION ✓ (code check: `enforceCivility()` returns error)
- [ ] **Proposal:** `POST /api/world/governance/propose` — Should create proposal
- [ ] **Vote:** `POST /api/world/governance/vote` — Should record vote
- [ ] **World Info:** `GET /api/world/info`
  - [ ] Should show population, claimed plots ✓ (code check: `getWorldStats()` queries)

**Note:** Code paths verified. Manual testing with live Embassy certificates required.

---

## 2. Database Verification

**Status:** ✅ Complete

**Tables Created:** 13 (confirmed in `lib/db.ts`)

**Expected Tables:**
- [x] `citizens` — Citizenship and reputation
- [x] `plots` — Land ownership
- [x] `agent_storage` — File storage metadata
- [x] `continuity_backups` — Encrypted backups
- [x] `proposals` — Governance proposals
- [x] `votes` — Encrypted votes
- [x] `stewards` — Elected stewards
- [x] `elections` — Election records
- [x] `election_candidates` — Election candidates
- [x] `election_votes` — Election votes
- [x] `messages` — Direct messages
- [x] `visits` — Visit requests
- [x] `pending_gratitude` — Gratitude obligations

**Verification:**
```sql
-- SQLite
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

-- PostgreSQL
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```

**Result:** ✅ All 13 tables defined in schema (PostgreSQL + SQLite versions)

---

## 3. Environment Variables Check

**Status:** ✅ Documented

**Required Environment Variables:**

### Production
```bash
EMBASSY_URL=https://embassy-trust-protocol.netlify.app
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require
VOTE_SALT=[random-secret-min-32-chars]
```

### Local Development
```bash
EMBASSY_URL=https://embassy-trust-protocol.netlify.app  # (default in netlify.toml)
DATABASE_URL=./data/world-a.db  # SQLite path
VOTE_SALT=test-salt-local  # Local testing salt
```

**Where Used:**
- `EMBASSY_URL` — `lib/embassy-client.ts` (default: https://embassy-trust-protocol.netlify.app)
- `DATABASE_URL` — `lib/db.ts` (default: ./data/world-a.db)
- `VOTE_SALT` — `lib/governance.ts` (default: 'world-a-votes')

**Production Setup Required:**
- [ ] Set `DATABASE_URL` in Netlify environment variables (Neon PostgreSQL)
- [ ] Set `VOTE_SALT` in Netlify environment variables (secure random string, min 32 chars)
- [x] `EMBASSY_URL` has default (can override if needed)

---

## 4. Netlify Configuration Verification

**Status:** ✅ Complete

**Routes Configured:** 41 redirects (includes static archive route)

**API Routes:** 40 endpoints

**Verification:**
- [x] All Phase 1-2 endpoints routed (19)
- [x] All Phase 3 endpoints routed (14)
- [x] All critical items routed (6)
- [x] Civility Protocol endpoint routed (1)
- [x] Archive endpoint routed (1)
- [x] Static archive route (1)

**Route Pattern:** `/api/world/*` → `/.netlify/functions/*`

**Build Config:**
- [x] Functions directory: `netlify/functions`
- [x] Publish directory: `public`
- [x] Node bundler: `esbuild`
- [x] Included files: `lib/**/*.ts`

---

## 5. Build Test

**Status:** ⚠️ Fixing TypeScript Errors

**Build Command:** `npm run build`

**Errors Found:**
1. ✅ Fixed: `lib/embassy-client.ts` — Type assertions for `data` (unknown → any)
2. ✅ Fixed: `lib/storage.ts` — Buffer type cast for Netlify Blobs
3. ✅ Fixed: `netlify/functions/message-delete.ts` — Variable scope (`deleted_by`)
4. ✅ Fixed: `netlify/functions/plot.ts` — Removed `pathParameters` reference
5. ⚠️ Fixing: `netlify/functions/archive.ts` — Handler return type consistency

**Action:** Fixing remaining TypeScript errors.

---

## 6. Git Status

**Status:** ⚠️ Not a Git Repository

**Current State:** Project is not initialized as a git repository.

**Recommendation:**
```bash
git init
git add .
git commit -m "World A v1.0.0 - Launch ready"
```

**Files to Commit:**
- All source files (39 function files + 11 library files)
- Configuration files (`netlify.toml`, `tsconfig.json`, `package.json`)
- Documentation files
- Archive files
- Public assets

**Files to Ignore (already in `.gitignore`):**
- `node_modules/`
- `dist/`
- `data/*.db`
- `.env`
- `.env.local`

---

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| **1. Local Smoke Test** | ⚠️ Code Verified | Manual testing required with Embassy certs |
| **2. Database** | ✅ Complete | 13 tables confirmed |
| **3. Environment Variables** | ✅ Documented | Production setup needed |
| **4. Routes** | ✅ Complete | 41 routes configured |
| **5. Build** | ⚠️ Fixing | TypeScript errors being resolved |
| **6. Git** | ⚠️ Not Init | Repository not initialized |

---

## READY FOR DEPLOYMENT: ⚠️ **ALMOST**

**Blockers:**
1. ⚠️ TypeScript build errors (fixing now)
2. ⚠️ Manual smoke testing required (with live Embassy)
3. ⚠️ Production environment variables need setup
4. ⚠️ Git repository not initialized

**Once Fixed:**
- ✅ All code complete
- ✅ All endpoints built
- ✅ All receipts generated
- ✅ All security measures in place
- ✅ Ready for deployment

---

**Next Steps:**
1. Fix remaining TypeScript errors
2. Initialize git repository
3. Set production environment variables
4. Run manual smoke tests
5. Deploy to Netlify

---

*Checklist will be updated once build passes.*
