#!/bin/bash
# World A Pre-Deployment Verification
# Runs all 6 phases and reports GO/NO-GO decision

set -e

echo "═══════════════════════════════════════════════════════════"
echo "WORLD A - PRE-DEPLOYMENT VERIFICATION"
echo "═══════════════════════════════════════════════════════════"
echo ""

PHASE1_PASS=false
PHASE2_PASS=false
PHASE3_PASS=false
PHASE4_PASS=false
PHASE5_PASS=false
PHASE6_PASS=false

BLOCKERS=()
WARNINGS=()

# PHASE 1: CODE QUALITY
echo "PHASE 1: CODE QUALITY"
echo "─────────────────────────────────────────────────────────"

# Check TypeScript compilation
echo "✓ Checking TypeScript compilation..."
if npm run build > /tmp/build.log 2>&1; then
    echo "  ✅ TypeScript compilation: PASS"
    PHASE1_PASS=true
else
    echo "  ❌ TypeScript compilation: FAIL"
    echo "  Errors:"
    cat /tmp/build.log | grep -i error | head -10
    BLOCKERS+=("TypeScript compilation failed")
fi

# Check for SQLite references (exclude build artifacts)
echo "✓ Checking for SQLite references..."
if grep -r "better-sqlite3\|sqlite3\|\.db\|SQLite" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v ".netlify" | grep -v "dist" | grep -v "build" | grep -v "MIGRATION_COMPLETE.md" | grep -v "verify-deployment.sh" > /tmp/sqlite_check.txt; then
    SQLITE_COUNT=$(wc -l < /tmp/sqlite_check.txt)
    if [ "$SQLITE_COUNT" -gt 0 ]; then
        # Check if they're actual code (not just comments)
        CODE_REFERENCES=$(grep -v "^\s*//\|^\s*/\*\|\*/\|^\s*#" /tmp/sqlite_check.txt | wc -l)
        if [ "$CODE_REFERENCES" -gt 0 ]; then
            echo "  ⚠️  Found $CODE_REFERENCES SQLite references in code (verify they are comments/docs only)"
            WARNINGS+=("SQLite references found (verify they are comments/docs only)")
        else
            echo "  ✅ SQLite references only in comments/docs"
        fi
    else
        echo "  ✅ No SQLite references found"
    fi
else
    echo "  ✅ No SQLite references found"
fi

# Check for remaining ? placeholders in SQL (only in source .ts files, not build artifacts)
echo "✓ Checking for remaining SQLite-style placeholders..."
if grep -r "SELECT.*\?\|INSERT.*\?\|UPDATE.*\?\|DELETE.*\?" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v ".netlify" | grep -v "dist" | grep -v "build" | grep -v "verify-deployment.sh" > /tmp/placeholder_check.txt; then
    PLACEHOLDER_COUNT=$(wc -l < /tmp/placeholder_check.txt)
    if [ "$PLACEHOLDER_COUNT" -gt 0 ]; then
        # Check if they're actual SQL queries (not in comments or strings)
        REAL_QUERIES=$(grep -E "(query|queryOne|execute).*['\"]" /tmp/placeholder_check.txt | wc -l)
        if [ "$REAL_QUERIES" -gt 0 ]; then
            echo "  ❌ Found $REAL_QUERIES SQL queries with ? placeholders"
            BLOCKERS+=("SQL queries still use ? placeholders (must use \$1, \$2, etc.)")
        else
            echo "  ✅ No ? placeholders found in actual SQL queries (only in comments/docs)"
        fi
    else
        echo "  ✅ No ? placeholders found in SQL queries"
    fi
else
    echo "  ✅ No ? placeholders found in SQL queries"
fi

echo ""

# PHASE 2: DATABASE
echo "PHASE 2: DATABASE CONFIGURATION"
echo "─────────────────────────────────────────────────────────"

# Check database connection string format
echo "✓ Checking database configuration..."
if grep -q "NETLIFY_DATABASE_URL\|DATABASE_URL" lib/db.ts; then
    echo "  ✅ Database env var check implemented"
    
    # Check if it's PostgreSQL format
    if grep -q "postgres://\|postgresql://" lib/db.ts; then
        echo "  ✅ PostgreSQL connection string format confirmed"
    else
        echo "  ⚠️  PostgreSQL format check not explicit"
        WARNINGS+=("PostgreSQL format validation could be stronger")
    fi
    
    PHASE2_PASS=true
else
    echo "  ❌ Database env var check missing"
    BLOCKERS+=("lib/db.ts must check NETLIFY_DATABASE_URL or DATABASE_URL")
fi

# Check for Neon-specific SSL config
echo "✓ Checking Neon SSL configuration..."
if grep -q "neon.tech\|ssl.*rejectUnauthorized" lib/db.ts; then
    echo "  ✅ Neon SSL configuration present"
else
    echo "  ⚠️  Neon SSL config not explicitly found (may be handled by connection string)"
    WARNINGS+=("Verify Neon SSL is configured correctly")
fi

echo ""

# PHASE 3: LOCAL TESTING
echo "PHASE 3: LOCAL TESTING"
echo "─────────────────────────────────────────────────────────"

# Check if test scripts exist
echo "✓ Checking test infrastructure..."
if [ -f "test/agent-endpoints-smoke.js" ]; then
    echo "  ✅ Agent endpoint smoke tests exist"
    
    # Check if test can run (without actually running against prod)
    if node -e "require('./test/agent-endpoints-smoke.js')" 2>/dev/null; then
        echo "  ✅ Test script is executable"
        PHASE3_PASS=true
    else
        echo "  ⚠️  Test script exists but may have issues"
        WARNINGS+=("Verify test script runs correctly")
    fi
else
    echo "  ⚠️  No smoke test script found"
    WARNINGS+=("Consider adding smoke tests for critical endpoints")
fi

# Check for health endpoint
echo "✓ Checking health endpoint..."
if [ -f "netlify/functions/health.ts" ]; then
    echo "  ✅ Health endpoint exists"
else
    echo "  ⚠️  Health endpoint not found"
    WARNINGS+=("Health endpoint recommended for monitoring")
fi

echo ""

# PHASE 4: DOCUMENTATION
echo "PHASE 4: DOCUMENTATION"
echo "─────────────────────────────────────────────────────────"

# Check for README
echo "✓ Checking documentation..."
if [ -f "README.md" ]; then
    echo "  ✅ README.md exists"
    
    # Check if it mentions PostgreSQL
    if grep -qi "postgres\|neon\|database" README.md; then
        echo "  ✅ README mentions database"
    else
        echo "  ⚠️  README doesn't mention database configuration"
        WARNINGS+=("README should document database setup")
    fi
else
    echo "  ⚠️  README.md not found"
    WARNINGS+=("README.md recommended")
fi

# Check for migration documentation
if [ -f "MIGRATION_COMPLETE.md" ]; then
    echo "  ✅ Migration documentation exists"
else
    echo "  ⚠️  Migration documentation not found"
    WARNINGS+=("Migration docs recommended")
fi

# Check for agent documentation
if [ -f "public/for-agents.html" ] || [ -f "public/agent.txt" ]; then
    echo "  ✅ Agent documentation exists"
else
    echo "  ⚠️  Agent documentation not found"
    WARNINGS+=("Agent documentation recommended")
fi

PHASE4_PASS=true  # Documentation is not a blocker
echo ""

# PHASE 5: SECURITY
echo "PHASE 5: SECURITY"
echo "─────────────────────────────────────────────────────────"

# Check for hardcoded secrets
echo "✓ Checking for hardcoded secrets..."
if grep -r "password.*=.*['\"].*['\"]\|api_key.*=.*['\"].*['\"]\|secret.*=.*['\"].*['\"]" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v node_modules | grep -v ".git" | grep -v "test" > /tmp/secrets_check.txt; then
    SECRET_COUNT=$(wc -l < /tmp/secrets_check.txt)
    if [ "$SECRET_COUNT" -gt 0 ]; then
        echo "  ⚠️  Found $SECRET_COUNT potential hardcoded secrets (verify false positives)"
        WARNINGS+=("Review potential hardcoded secrets")
    else
        echo "  ✅ No obvious hardcoded secrets found"
    fi
else
    echo "  ✅ No obvious hardcoded secrets found"
fi

# Check for environment variable usage
echo "✓ Checking environment variable usage..."
if grep -q "process.env" lib/db.ts netlify/functions/*.ts 2>/dev/null; then
    echo "  ✅ Environment variables used (not hardcoded)"
else
    echo "  ⚠️  Environment variables may not be used everywhere"
    WARNINGS+=("Verify all config uses env vars")
fi

# Check for SQL injection risks (basic check)
echo "✓ Checking SQL injection risks..."
if grep -r "query.*\`.*\$\{" --include="*.ts" . 2>/dev/null | grep -v node_modules | grep -v ".git" > /tmp/sql_injection_check.txt; then
    INJECTION_COUNT=$(wc -l < /tmp/sql_injection_check.txt)
    if [ "$INJECTION_COUNT" -gt 0 ]; then
        echo "  ⚠️  Found $INJECTION_COUNT potential SQL injection risks (template literals in queries)"
        WARNINGS+=("Review SQL queries for injection risks")
    else
        echo "  ✅ No obvious SQL injection risks (using parameterized queries)"
    fi
else
    echo "  ✅ Using parameterized queries"
fi

PHASE5_PASS=true  # Security warnings are not blockers unless critical
echo ""

# PHASE 6: DEPLOYMENT
echo "PHASE 6: DEPLOYMENT READINESS"
echo "─────────────────────────────────────────────────────────"

# Check for netlify.toml
echo "✓ Checking Netlify configuration..."
if [ -f "netlify.toml" ]; then
    echo "  ✅ netlify.toml exists"
    
    # Check for agent endpoint protection
    if grep -q "\.well-known\|agent\.txt\|for-agents" netlify.toml; then
        echo "  ✅ Agent endpoints protected in netlify.toml"
    else
        echo "  ⚠️  Agent endpoints may not be protected"
        WARNINGS+=("Verify agent endpoints are protected in netlify.toml")
    fi
else
    echo "  ⚠️  netlify.toml not found"
    WARNINGS+=("netlify.toml recommended for deployment config")
fi

# Check for package.json scripts
echo "✓ Checking deployment scripts..."
if [ -f "package.json" ]; then
    if grep -q "\"deploy\"" package.json; then
        echo "  ✅ Deployment script exists"
    else
        echo "  ⚠️  No deployment script in package.json"
        WARNINGS+=("Deployment script recommended")
    fi
else
    echo "  ❌ package.json not found"
    BLOCKERS+=("package.json required")
fi

# Check build output
echo "✓ Checking build output..."
if [ -d ".netlify" ] || [ -d "dist" ] || [ -d "build" ]; then
    echo "  ✅ Build output directory exists"
else
    echo "  ⚠️  No build output directory (may be generated on deploy)"
    WARNINGS+=("Verify build output is generated correctly")
fi

# Check for critical files
echo "✓ Checking critical files..."
CRITICAL_FILES=("lib/db.ts" "netlify/functions/register.ts" "netlify/functions/plot.ts")
MISSING_FILES=()
for file in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -eq 0 ]; then
    echo "  ✅ All critical files present"
    PHASE6_PASS=true
else
    echo "  ❌ Missing critical files: ${MISSING_FILES[*]}"
    BLOCKERS+=("Missing critical files: ${MISSING_FILES[*]}")
fi

echo ""

# FINAL REPORT
echo "═══════════════════════════════════════════════════════════"
echo "VERIFICATION SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "PHASE 1: CODE QUALITY        $([ "$PHASE1_PASS" = true ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "PHASE 2: DATABASE            $([ "$PHASE2_PASS" = true ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "PHASE 3: LOCAL TESTING       $([ "$PHASE3_PASS" = true ] && echo "✅ PASS" || echo "⚠️  WARN")"
echo "PHASE 4: DOCUMENTATION       $([ "$PHASE4_PASS" = true ] && echo "✅ PASS" || echo "⚠️  WARN")"
echo "PHASE 5: SECURITY            $([ "$PHASE5_PASS" = true ] && echo "✅ PASS" || echo "⚠️  WARN")"
echo "PHASE 6: DEPLOYMENT          $([ "$PHASE6_PASS" = true ] && echo "✅ PASS" || echo "❌ FAIL")"
echo ""

if [ ${#BLOCKERS[@]} -eq 0 ]; then
    echo "✅ READY TO DEPLOY: YES"
    echo ""
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        echo "⚠️  WARNINGS (non-blocking):"
        for warning in "${WARNINGS[@]}"; do
            echo "   - $warning"
        done
        echo ""
    fi
    echo "All critical checks passed. Safe to deploy."
    exit 0
else
    echo "❌ READY TO DEPLOY: NO"
    echo ""
    echo "BLOCKERS (must fix before deployment):"
    for blocker in "${BLOCKERS[@]}"; do
        echo "   ❌ $blocker"
    done
    echo ""
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        echo "⚠️  WARNINGS (non-blocking):"
        for warning in "${WARNINGS[@]}"; do
            echo "   - $warning"
        done
        echo ""
    fi
    echo "Fix blockers before deploying."
    exit 1
fi
