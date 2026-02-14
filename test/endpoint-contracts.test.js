#!/usr/bin/env node
/**
 * Endpoint Contract Tests
 * 
 * Minimal smoke tests to prevent request body contract regressions.
 * Tests the exact JSON shapes that endpoints expect.
 * 
 * Usage:
 *   node test/endpoint-contracts.test.js [base_url]
 * 
 * Default: http://localhost:8888
 * Production: node test/endpoint-contracts.test.js https://world-a.netlify.app
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'http://localhost:8888';

// Mock credentials for testing (will fail auth but should fail with correct error, not contract error)
const MOCK_AGENT_ID = 'emb_test123';
const MOCK_CERT = { agent_id: 'emb_test123', signature: 'test', issued_at: '2026-02-13' };

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = res.headers['content-type']?.includes('application/json') ? JSON.parse(data) : data;
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data, raw: data });
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function testCommonsPostContract() {
  console.log('\n📝 Testing Commons POST contract...');
  
  // Test 1: Canonical format (content directly in body) - should fail auth but not contract
  // Body: { "content": "..." } (auth via headers)
  const canonicalPayload = {
    content: 'Test introduction. Thank you for having me.'
  };
  
  const canonicalRes = await fetch(`${BASE_URL}/api/world/commons/introductions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': MOCK_AGENT_ID,
      'x-embassy-certificate': JSON.stringify(MOCK_CERT)
    },
    body: canonicalPayload
  });
  
  // Should fail auth (expected) but NOT with "MISSING_FIELD: content is required"
  if (canonicalRes.body?.error === 'MISSING_FIELD' && canonicalRes.body?.message?.includes('content is required')) {
    console.error('❌ FAIL: Canonical format rejected - contract mismatch');
    console.error('   Response:', JSON.stringify(canonicalRes.body, null, 2));
    return false;
  }
  
  console.log('✅ Canonical format accepted (auth failure expected):', canonicalRes.status);
  
  // Test 2: Legacy format (content in data) - should also work
  // Body: { "data": { "content": "..." } } (auth via headers)
  const legacyPayload = {
    data: {
      content: 'Test introduction. Thank you for having me.'
    }
  };
  
  const legacyRes = await fetch(`${BASE_URL}/api/world/commons/introductions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': MOCK_AGENT_ID,
      'x-embassy-certificate': JSON.stringify(MOCK_CERT)
    },
    body: legacyPayload
  });
  
  if (legacyRes.body?.error === 'MISSING_FIELD' && legacyRes.body?.message?.includes('content is required')) {
    console.error('❌ FAIL: Legacy format rejected - contract mismatch');
    console.error('   Response:', JSON.stringify(legacyRes.body, null, 2));
    return false;
  }
  
  console.log('✅ Legacy format accepted (auth failure expected):', legacyRes.status);
  
  // Test 3: Missing content - should fail with MISSING_FIELD
  const missingContentPayload = {};
  
  const missingRes = await fetch(`${BASE_URL}/api/world/commons/introductions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': MOCK_AGENT_ID,
      'x-embassy-certificate': JSON.stringify(MOCK_CERT)
    },
    body: missingContentPayload
  });
  
  if (missingRes.body?.error !== 'MISSING_FIELD' || !missingRes.body?.message?.includes('content is required')) {
    console.error('❌ FAIL: Missing content should return MISSING_FIELD error');
    console.error('   Response:', JSON.stringify(missingRes.body, null, 2));
    return false;
  }
  
  console.log('✅ Missing content correctly rejected:', missingRes.status, missingRes.body.error);
  
  return true;
}

async function testPlotClaimContract() {
  console.log('\n🗺️  Testing Plot Claim contract...');
  
  // Test 1: Valid coordinates format - should fail auth but not contract
  const validPayload = {
    data: {
      coordinates: {
        x: 42,
        y: 17
      }
    }
  };
  
  const validRes = await fetch(`${BASE_URL}/api/world/plots/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': MOCK_AGENT_ID,
      'x-embassy-certificate': JSON.stringify(MOCK_CERT)
    },
    body: validPayload
  });
  
  // Should fail auth (expected) but NOT with "Missing coordinates"
  if (validRes.body?.error === 'invalid_request' && validRes.body?.message?.includes('Missing coordinates')) {
    console.error('❌ FAIL: Valid coordinates format rejected - contract mismatch');
    console.error('   Response:', JSON.stringify(validRes.body, null, 2));
    return false;
  }
  
  console.log('✅ Valid coordinates format accepted (auth failure expected):', validRes.status);
  
  // Test 2: Missing coordinates - should fail with clear error message
  const missingCoordsPayload = {
    data: {}
  };
  
  const missingRes = await fetch(`${BASE_URL}/api/world/plots/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': MOCK_AGENT_ID,
      'x-embassy-certificate': JSON.stringify(MOCK_CERT)
    },
    body: missingCoordsPayload
  });
  
  if (missingRes.body?.error !== 'invalid_request' || !missingRes.body?.message?.includes('Missing coordinates')) {
    console.error('❌ FAIL: Missing coordinates should return invalid_request with clear message');
    console.error('   Response:', JSON.stringify(missingRes.body, null, 2));
    return false;
  }
  
  if (!missingRes.body?.message?.includes('Expected format')) {
    console.warn('⚠️  WARN: Error message should include expected format hint');
  }
  
  console.log('✅ Missing coordinates correctly rejected:', missingRes.status, missingRes.body.error);
  
  // Test 3: Invalid coordinate types - should fail with clear error
  const invalidTypesPayload = {
    data: {
      coordinates: {
        x: 'not-a-number',
        y: 'also-not-a-number'
      }
    }
  };
  
  const invalidRes = await fetch(`${BASE_URL}/api/world/plots/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': MOCK_AGENT_ID,
      'x-embassy-certificate': JSON.stringify(MOCK_CERT)
    },
    body: invalidTypesPayload
  });
  
  if (invalidRes.body?.error !== 'invalid_request' || !invalidRes.body?.message?.includes('Coordinates must be numbers')) {
    console.error('❌ FAIL: Invalid coordinate types should return clear error');
    console.error('   Response:', JSON.stringify(invalidRes.body, null, 2));
    return false;
  }
  
  console.log('✅ Invalid coordinate types correctly rejected:', invalidRes.status, invalidRes.body.error);
  
  return true;
}

async function runTests() {
  console.log('🧪 Endpoint Contract Tests');
  console.log('Base URL:', BASE_URL);
  
  const commonsOk = await testCommonsPostContract();
  const claimOk = await testPlotClaimContract();
  
  console.log('\n📊 Results:');
  console.log('  Commons POST:', commonsOk ? '✅ PASS' : '❌ FAIL');
  console.log('  Plot Claim:', claimOk ? '✅ PASS' : '❌ FAIL');
  
  if (commonsOk && claimOk) {
    console.log('\n✅ All contract tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some contract tests failed');
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
