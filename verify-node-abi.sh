#!/bin/bash
# Verification script for Node ABI compatibility
# Run from repo root

set -e

echo "=== Node ABI Verification ==="
echo ""

# Check Node version
NODE_VERSION=$(node -v)
NODE_ABI=$(node -p "process.versions.modules")
echo "Node version: $NODE_VERSION"
echo "Node ABI (MODULE_VERSION): $NODE_ABI"
echo ""

# Expected ABI for Node 20.20.0
EXPECTED_ABI="115"
if [ "$NODE_ABI" != "$EXPECTED_ABI" ]; then
  echo "❌ ERROR: Node ABI mismatch!"
  echo "   Expected: $EXPECTED_ABI (Node 20.20.0)"
  echo "   Got: $NODE_ABI ($NODE_VERSION)"
  echo ""
  echo "Fix: Run 'fnm use 20.20.0' or 'nvm use 20.20.0'"
  exit 1
fi

echo "✅ Node ABI correct: $NODE_ABI"
echo ""

# Check better-sqlite3
if [ -d "node_modules/better-sqlite3" ]; then
  echo "Checking better-sqlite3 installation..."
  if node -e "require('better-sqlite3')" 2>&1 | grep -q "NODE_MODULE_VERSION"; then
    echo "❌ ERROR: better-sqlite3 ABI mismatch detected"
    echo "   Run: npm rebuild better-sqlite3 --build-from-source"
    exit 1
  else
    echo "✅ better-sqlite3 loads successfully"
  fi
else
  echo "⚠️  better-sqlite3 not found in node_modules (run npm install)"
fi

echo ""
echo "=== Verification Complete ==="
