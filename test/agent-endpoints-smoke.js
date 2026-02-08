#!/usr/bin/env node
/**
 * Agent Endpoints Smoke Test
 * 
 * Verifies that critical agent discovery endpoints return correct status codes
 * and content types. Run this in CI to prevent regressions.
 * 
 * Usage:
 *   node test/agent-endpoints-smoke.js [base_url]
 * 
 * Default base_url: http://localhost:8888 (for local dev)
 * For production: node test/agent-endpoints-smoke.js https://world-a.netlify.app
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'http://localhost:8888';

const ENDPOINTS = [
  {
    path: '/agent.txt',
    expectedStatus: 200,
    expectedContentType: 'text/plain',
    requiredContent: ['WORLD A', 'AGENT ENTRY POINT', 'START HERE']
  },
  {
    path: '/.well-known/world-a.json',
    expectedStatus: 200,
    expectedContentType: 'application/json',
    requiredContent: ['name', 'version', 'canonical_url', 'capabilities', 'auth', 'entrypoints']
  },
  {
    path: '/for-agents',
    expectedStatus: 200,
    expectedContentType: 'text/html',
    requiredContent: ['World A', 'agent']
  }
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function checkContentType(headers, expected) {
  const contentType = headers['content-type'] || '';
  
  if (expected === 'application/json') {
    return contentType.includes('application/json');
  }
  
  if (expected === 'text/plain') {
    return contentType.includes('text/plain');
  }
  
  if (expected === 'text/html') {
    return contentType.includes('text/html');
  }
  
  return contentType.includes(expected);
}

function checkRequiredContent(body, required) {
  const bodyLower = body.toLowerCase();
  return required.every(term => bodyLower.includes(term.toLowerCase()));
}

async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  
  try {
    const response = await fetch(url);
    const errors = [];
    
    // Check status code
    if (response.status !== endpoint.expectedStatus) {
      errors.push(`Expected status ${endpoint.expectedStatus}, got ${response.status}`);
    }
    
    // Check content type
    if (!checkContentType(response.headers, endpoint.expectedContentType)) {
      const actualType = response.headers['content-type'] || 'unknown';
      errors.push(`Expected content-type containing "${endpoint.expectedContentType}", got "${actualType}"`);
    }
    
    // Check required content
    if (endpoint.requiredContent && !checkRequiredContent(response.body, endpoint.requiredContent)) {
      errors.push(`Missing required content: ${endpoint.requiredContent.filter(c => !response.body.toLowerCase().includes(c.toLowerCase())).join(', ')}`);
    }
    
    // For JSON, validate it's parseable
    if (endpoint.expectedContentType === 'application/json') {
      try {
        JSON.parse(response.body);
      } catch (e) {
        errors.push(`Invalid JSON: ${e.message}`);
      }
    }
    
    return {
      path: endpoint.path,
      success: errors.length === 0,
      errors
    };
  } catch (error) {
    return {
      path: endpoint.path,
      success: false,
      errors: [`Request failed: ${error.message}`]
    };
  }
}

async function runTests() {
  console.log(`Testing agent endpoints at: ${BASE_URL}\n`);
  
  const results = await Promise.all(ENDPOINTS.map(testEndpoint));
  
  let allPassed = true;
  
  results.forEach(result => {
    if (result.success) {
      console.log(`✓ ${result.path} - PASS`);
    } else {
      console.error(`✗ ${result.path} - FAIL`);
      result.errors.forEach(err => console.error(`  - ${err}`));
      allPassed = false;
    }
  });
  
  console.log('');
  
  if (allPassed) {
    console.log('All agent endpoint tests passed ✓');
    process.exit(0);
  } else {
    console.error('Some agent endpoint tests failed ✗');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
