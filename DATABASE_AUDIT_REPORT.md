# Database Configuration Audit Report

**Date:** 2026-02-03  
**Scope:** Complete codebase audit of database configuration  
**Goal:** Determine if World A uses SQLite, Neon PostgreSQL, or mixed configuration

---

## Executive Summary

**Current State:** **HYBRID SYSTEM** — Supports both SQLite (local dev) and PostgreSQL (production)

**Decision Logic:**
- If `DATABASE_URL` starts with `postgres://` or `postgresql://` → PostgreSQL (via `pg` package)
- Otherwise → SQLite (via `better-sqlite3` package)
- Default: `'./data/world-a.db'` (SQLite)

**Status:** ✅ **No mixed references** — All code goes through unified `lib/db.ts` abstraction layer

---

## 1. Installed Database Libraries

### `package.json` Dependencies

```json
"dependencies": {
  "better-sqlite3": "^12.6.2",  // ✅ Installed
  "pg": "^8.18.0"               // ✅ Installed
}
```

**Both libraries are installed:**
- `better-sqlite3`: SQLite database (local dev)
- `pg`: PostgreSQL client (production)

---

## 2. Database Connection Logic

### `lib/db.ts` Implementation

**Location:** `lib/db.ts:23-60`

**Connection Decision:**
```typescript
const dbUrl = process.env.DATABASE_URL || './data/world-a.db';

if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
  // PostgreSQL (production)
  db = new Pool({ 
    connectionString: dbUrl,
    ssl: dbUrl.includes('neon.tech') || dbUrl.includes('neon') 
      ? { rejectUnauthorized: false }
      : undefined
  });
} else {
  // SQLite (local development)
  const dbPath = process.env.NETLIFY ? DB_PATH : (process.env.DB_PATH || DB_PATH);
  // DB_PATH = "/tmp/world-a/world-a.sqlite" for Netlify
  // DB_PATH = "./data/world-a.db" for local
  db = new Database(dbPath);
}
```

**Key Points:**
- ✅ Single abstraction layer — all code uses `query()`, `queryOne()`, `execute()` functions
- ✅ Automatic detection based on `DATABASE_URL` format
- ✅ Neon-specific SSL configuration included
- ⚠️ **Issue:** Netlify Functions use `/tmp/world-a/world-a.sqlite` (ephemeral storage)

---

## 3. Database Schema

### Dual Schema Implementation

**PostgreSQL Schema:** `lib/db.ts:63-433`
- Uses PostgreSQL types: `VARCHAR`, `INT`, `BIGINT`, `TIMESTAMP`, `JSONB`
- Uses PostgreSQL syntax: `NOW()`, `ON CONFLICT DO NOTHING`

**SQLite Schema:** `lib/db.ts:434-787`
- Uses SQLite types: `TEXT`, `INTEGER`, `TEXT DEFAULT (datetime('now'))`
- Uses SQLite syntax: `INSERT OR IGNORE`, `PRAGMA foreign_keys = ON`

**Both schemas are maintained in parallel** — same tables, different syntax.

---

## 4. Query Functions (Unified Interface)

### `lib/db.ts:799-835`

All database operations go through unified functions:

```typescript
export async function query(sql: string, params: any[] = [])
export async function queryOne(sql: string, params: any[] = [])
export async function execute(sql: string, params: any[] = [])
```

**Implementation:**
- Checks `isPostgres` flag
- Routes to `pg.Pool.query()` or `sqlite.prepare().all/get/run()`
- Normalizes return types (PostgreSQL returns `result.rows`, SQLite returns array directly)

---

## 5. File-by-File Database References

### Files Using Database

**All Netlify Functions:**
- ✅ All use `import { initDatabase, query, queryOne, execute } from '../../lib/db'`
- ✅ No direct `better-sqlite3` or `pg` imports
- ✅ All go through unified abstraction

**Count:** 52+ function files, all use unified interface

**No Mixed References Found:**
- ❌ No files directly import `better-sqlite3`
- ❌ No files directly import `pg`
- ✅ All database access goes through `lib/db.ts`

---

## 6. Environment Variable Configuration

### `DATABASE_URL` Usage

**Location:** `lib/db.ts:30`

**Default:** `'./data/world-a.db'` (SQLite)

**Production:** Must be set to PostgreSQL connection string:
```
postgresql://user:password@host:5432/database
```

**Netlify Functions (SQLite):**
- Uses `/tmp/world-a/world-a.sqlite` when `process.env.NETLIFY` is set
- ⚠️ **Problem:** `/tmp` is ephemeral in serverless — data resets on each deploy/cold start

---

## 7. Current Configuration Analysis

### Local Development
- **Database:** SQLite (`./data/world-a.db`)
- **Library:** `better-sqlite3`
- **Status:** ✅ Works correctly

### Netlify Functions (Current)
- **Database:** SQLite (`/tmp/world-a/world-a.sqlite`)
- **Library:** `better-sqlite3`
- **Status:** ⚠️ **EPHEMERAL** — Data resets on each deploy/cold start

### Production (Intended)
- **Database:** PostgreSQL (Neon)
- **Library:** `pg`
- **Status:** ✅ Code ready, requires `DATABASE_URL` env var

---

## 8. Issues Identified

### ⚠️ Issue #1: Ephemeral Storage in Netlify Functions

**Problem:**
- Netlify Functions use `/tmp/world-a/world-a.sqlite` for SQLite
- `/tmp` is ephemeral — wiped between function invocations
- Data will be lost on:
  - Each deploy
  - Each cold start
  - Container recycling

**Impact:** **CRITICAL** — World A cannot persist data in production with SQLite on Netlify Functions

**Evidence:**
```typescript
// lib/db.ts:49
const dbPath = process.env.NETLIFY ? DB_PATH : (process.env.DB_PATH || DB_PATH);
// DB_PATH = "/tmp/world-a/world-a.sqlite" for Netlify
```

---

### ⚠️ Issue #2: No Production Database Configured

**Problem:**
- `netlify.toml` does not set `DATABASE_URL`
- No documentation of required Neon PostgreSQL setup
- Default falls back to SQLite (which won't persist)

**Impact:** **HIGH** — Production deployment will use ephemeral SQLite

---

## 9. Recommendations

### Option A: Go All-Neon PostgreSQL (RECOMMENDED)

**Why:**
- ✅ Persistent storage (required for production)
- ✅ Scales to multiple function instances
- ✅ Code already supports it
- ✅ Neon has free tier, serverless-friendly

**Required Changes:**
1. Set `DATABASE_URL` in Netlify environment variables (Neon PostgreSQL URL)
2. Remove SQLite fallback for production (or make it explicit dev-only)
3. Update documentation with Neon setup instructions
4. Test schema creation on fresh Neon database

**Env Vars Needed:**
```
DATABASE_URL=postgresql://user:password@host.neon.tech/database?sslmode=require
```

**Code Changes:**
- None required (code already supports PostgreSQL)
- Optional: Add validation to prevent SQLite in production

---

### Option B: Keep Hybrid (SQLite Local, Neon Production)

**Why:**
- ✅ Fast local development (no external DB needed)
- ✅ Production uses persistent Neon PostgreSQL

**Required Changes:**
1. Set `DATABASE_URL` in Netlify (Neon PostgreSQL URL)
2. Document that SQLite is dev-only
3. Add validation to warn if SQLite is used in production

**Env Vars Needed:**
```
# Local dev (optional, defaults to SQLite)
DATABASE_URL=./data/world-a.db

# Production (required)
DATABASE_URL=postgresql://user:password@host.neon.tech/database?sslmode=require
```

---

### Option C: Go All-SQLite (NOT RECOMMENDED)

**Why NOT:**
- ❌ Ephemeral storage in Netlify Functions (`/tmp` gets wiped)
- ❌ Data resets on each deploy/cold start
- ❌ Cannot scale across multiple function instances
- ❌ Not suitable for production

**Only viable if:**
- Using Netlify Blobs for persistence (but then why use SQLite?)
- Accepting data loss on deploys (not acceptable for World A)

---

## 10. File Reference Summary

### Files Using Database

| File | Database Type | Notes |
|------|--------------|-------|
| `lib/db.ts` | **Both** | Abstraction layer, supports SQLite + PostgreSQL |
| All `netlify/functions/*.ts` | **Unified** | All use `lib/db.ts` abstraction |
| `package.json` | **Both** | Installs `better-sqlite3` + `pg` |

**No Mixed References:**
- ✅ All code uses unified `lib/db.ts` interface
- ✅ No direct database library imports in function files
- ✅ Single source of truth for database logic

---

## 11. Production Readiness

### Current State

| Aspect | Status | Notes |
|--------|--------|-------|
| **Code Support** | ✅ Ready | Supports both SQLite and PostgreSQL |
| **Schema** | ✅ Ready | Dual schema maintained |
| **Connection Logic** | ✅ Ready | Auto-detects from `DATABASE_URL` |
| **Neon SSL Config** | ✅ Ready | SSL configured for Neon |
| **Production Config** | ❌ Missing | `DATABASE_URL` not set in Netlify |
| **Documentation** | ⚠️ Partial | No clear Neon setup guide |

---

## 12. Action Items

### Immediate (Required for Production)

1. **Set `DATABASE_URL` in Netlify:**
   - Go to Netlify Dashboard → Site Settings → Environment Variables
   - Add: `DATABASE_URL=postgresql://user:password@host.neon.tech/database?sslmode=require`
   - Use Neon PostgreSQL connection string

2. **Create Neon Database:**
   - Sign up at https://neon.tech
   - Create new project
   - Copy connection string
   - Set as `DATABASE_URL` in Netlify

3. **Test Schema Creation:**
   - Deploy to production
   - Check function logs for "Connected to PostgreSQL"
   - Verify tables created successfully

### Recommended (Code Improvements)

4. **Add Production Validation:**
   - Warn if SQLite is used in production (Netlify environment)
   - Fail fast if `DATABASE_URL` is missing in production

5. **Update Documentation:**
   - Add Neon setup instructions to `docs/AMBASSADOR_SETUP.md`
   - Document `DATABASE_URL` requirement in `README.md`
   - Add troubleshooting section for database connection issues

---

## 13. Verification Commands

### Check Current Configuration

```bash
# Check installed packages
npm list better-sqlite3 pg

# Check for direct database imports (should be empty)
grep -r "import.*better-sqlite3\|import.*pg\|require.*better-sqlite3\|require.*pg" netlify/functions/

# Check DATABASE_URL usage
grep -r "DATABASE_URL" --include="*.ts" --include="*.md" --include="*.toml"
```

### Test Database Connection

```bash
# Local (SQLite)
unset DATABASE_URL
npm run dev
# Should see: "Connected to SQLite: ./data/world-a.db"

# Production (PostgreSQL)
export DATABASE_URL="postgresql://user:password@host.neon.tech/database"
npm run dev
# Should see: "Connected to PostgreSQL"
```

---

## 14. Conclusion

**Current Configuration:** Hybrid system (SQLite local, PostgreSQL production)

**Status:**
- ✅ Code supports both databases correctly
- ✅ No mixed references (all use unified abstraction)
- ⚠️ Production requires `DATABASE_URL` to be set (Neon PostgreSQL)
- ⚠️ SQLite in Netlify Functions is ephemeral (not suitable for production)

**Recommendation:** **Go All-Neon PostgreSQL for Production**

**Next Steps:**
1. Create Neon PostgreSQL database
2. Set `DATABASE_URL` in Netlify environment variables
3. Deploy and verify PostgreSQL connection
4. Test schema creation and data persistence

---

**Audit Complete** ✅
