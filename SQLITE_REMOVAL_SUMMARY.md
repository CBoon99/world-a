# SQLite Removal — Complete Summary

## Goal
Remove all SQLite references from World A — Neon PostgreSQL ONLY.

---

## Files Changed

### 1. `lib/db.ts` — Complete Rewrite

**Removed:**
- ❌ `import Database from 'better-sqlite3'`
- ❌ All SQLite-specific imports (`fs`, `path`)
- ❌ `DB_DIR` and `DB_PATH` constants
- ❌ Dynamic `pg` import with try/catch
- ❌ `isPostgres` flag
- ❌ `Database.Database` type references
- ❌ Entire SQLite schema (lines 434-787)
- ❌ SQLite seeding code
- ❌ If/else logic choosing between SQLite and PostgreSQL

**Added:**
- ✅ Direct `import { Pool } from 'pg'`
- ✅ `DATABASE_URL` validation (throws clear error if missing)
- ✅ PostgreSQL connection string validation
- ✅ PostgreSQL-only schema
- ✅ Simplified `query()`, `queryOne()`, `execute()` functions (PostgreSQL only)

**Key Changes:**
```typescript
// Before: Hybrid system with if/else
if (dbUrl.startsWith('postgres://')) {
  // PostgreSQL
} else {
  // SQLite
}

// After: PostgreSQL only
if (!dbUrl) {
  throw new Error('DATABASE_URL environment variable required...');
}
if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection string...');
}
db = new Pool({ connectionString: dbUrl, ssl: ... });
```

**Line Count:** Reduced from ~836 lines to ~430 lines (removed ~400 lines of SQLite code)

---

### 2. `package.json` — Dependencies Cleanup

**Removed:**
- ❌ `"better-sqlite3": "^12.6.2"` from dependencies
- ❌ `"@types/better-sqlite3": "^7.6.13"` from devDependencies
- ❌ `"postinstall": "npm run rebuild-sqlite"` script
- ❌ `"rebuild-sqlite": "npm rebuild better-sqlite3..."` script

**Added:**
- ✅ `"@types/pg": "^8.11.10"` to devDependencies (for TypeScript types)

**Kept:**
- ✅ `"pg": "^8.18.0"` in dependencies

---

### 3. `lib/permissions.ts` — Comment Update

**Changed:**
- ❌ `// Parse permissions JSON (handle both SQLite TEXT and PostgreSQL JSONB)`
- ✅ `// Parse permissions JSON (PostgreSQL JSONB)`

---

### 4. `.gitignore` — No Changes Needed

**Current:** Already ignores `data/*.db`, `data/*.db-shm`, `data/*.db-wal`

**Status:** ✅ No changes needed (SQLite files already ignored)

---

## Verification

### SQLite References Removed

**Checked:**
- ✅ No `better-sqlite3` imports in `lib/` or `netlify/functions/`
- ✅ No `Database.Database` type references
- ✅ No `.db` or `.sqlite` file path references in code
- ✅ No `DB_PATH` or `DB_DIR` constants

**Remaining References (Documentation Only):**
- `DATABASE_AUDIT_REPORT.md` — Audit report (documentation, not code)
- `lib/permissions.ts` — Comment updated (now says "PostgreSQL JSONB" only)

---

## Build Status

**TypeScript Compilation:**
```bash
npm run build
```

**Expected:** ✅ Should pass after `npm install` (to get `@types/pg`)

**Note:** `@types/pg` is already in `package.json` devDependencies. Run `npm install` to install it.

---

## Database Connection

### Before (Hybrid)
```typescript
const dbUrl = process.env.DATABASE_URL || './data/world-a.db';
if (dbUrl.startsWith('postgres://')) {
  // PostgreSQL
} else {
  // SQLite fallback
}
```

### After (PostgreSQL Only)
```typescript
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL environment variable required...');
}
if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection string...');
}
db = new Pool({ connectionString: dbUrl, ssl: ... });
```

---

## Environment Variables

### Required
- `DATABASE_URL` — **MUST** be set to PostgreSQL connection string
  - Format: `postgresql://user:password@host.neon.tech/database?sslmode=require`
  - **No default** — will throw error if not set

### Example (Neon)
```
DATABASE_URL=postgresql://user:password@ep-xxx-xxx.neon.tech/neondb?sslmode=require
```

---

## Migration Notes

### For Local Development

**Before:** Could run without `DATABASE_URL` (would use SQLite)

**After:** **MUST** set `DATABASE_URL` to PostgreSQL connection string

**Setup:**
```bash
# Create Neon database (free tier works)
# Copy connection string
export DATABASE_URL="postgresql://user:password@host.neon.tech/database?sslmode=require"

# Or add to .env file
echo 'DATABASE_URL=postgresql://...' >> .env
```

### For Production (Netlify)

**Required:**
1. Set `DATABASE_URL` in Netlify environment variables
2. Use Neon PostgreSQL connection string
3. No code changes needed (already supports PostgreSQL)

---

## Files Changed Summary

| File | Changes | Lines Changed |
|------|---------|---------------|
| `lib/db.ts` | Complete rewrite (PostgreSQL only) | -791, +425 |
| `package.json` | Removed better-sqlite3, added @types/pg | -3, +1 |
| `lib/permissions.ts` | Updated comment | -1, +1 |

**Total:** 3 files changed, ~400 lines of SQLite code removed

---

## Next Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```
   (This will install `@types/pg` if not already installed)

2. **Set DATABASE_URL:**
   ```bash
   export DATABASE_URL="postgresql://user:password@host.neon.tech/database?sslmode=require"
   ```

3. **Verify build:**
   ```bash
   npm run build
   ```
   Should pass with no errors.

4. **Test connection:**
   ```bash
   npm run dev
   ```
   Should see: "Connected to PostgreSQL"

---

**Status:** ✅ SQLite completely removed, PostgreSQL-only implementation ready
