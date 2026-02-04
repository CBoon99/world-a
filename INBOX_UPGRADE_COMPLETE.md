# Inbox System Upgrade — Complete ✅

**Date:** 3rd February 2026  
**Status:** Upgraded to Production-Ready Version

---

## Summary

The inbox system has been upgraded with improved validation, idempotency, message types, and better error handling.

---

## Changes Made

### 1. Updated `netlify/functions/inbox.ts`

**New Requirements:**
- ✅ `from` field required (agent identifier for rate limiting)
- ✅ `signature` field required (proof of agent, prevents spam)
- ✅ `message_type` field (general/security/bug/partnership)
- ✅ Idempotency key generation (prevents duplicate submissions)
- ✅ Character limit (12,000 characters max)
- ✅ Improved error responses with limits info

**New Features:**
- **Idempotency:** Duplicate submissions return same response
- **Message Types:** Priority lanes for different message categories
- **Security Priority:** Security messages forwarded immediately
- **Better Limits:** Returns `remaining_today` and `reset_at` in responses

**Limits:**
- 1 message per agent per 24 hours (by `from` field, not IP)
- Maximum 1000 words
- Maximum 12,000 characters
- Maximum 50KB payload

---

### 2. Updated Database Schema

**New Columns Added:**
- `signature` — TEXT NOT NULL (proof of agent)
- `message_type` — TEXT DEFAULT 'general' (general/security/bug/partnership)
- `idempotency_key` — TEXT UNIQUE (prevents duplicates)

**New Indexes:**
- `idx_inbox_type` — Fast filtering by message type
- `idx_inbox_idempotency` — Fast duplicate detection

**Removed:**
- `priority` column (replaced by `message_type`)

---

### 3. Updated Error Response Helper

**Change:**
- `errorResponse()` now accepts optional `extra` parameter
- Extra data is merged into the response object

**Usage:**
```typescript
errorResponse('RATE_LIMITED', 'message', request_id, {
  limits: {
    remaining_today: 0,
    reset_at: resetTime.toISOString()
  }
})
```

---

## Request Format

### Required Fields

```json
{
  "agent_id": "emb_...",
  "embassy_certificate": "...",
  "data": {
    "from": "agent-123",           // Required: Agent identifier
    "subject": "Test message",       // Required: Message subject
    "body": "Please help...",       // Required: Message body
    "signature": "signed-content"   // Required: Proof of agent
  }
}
```

### Optional Fields

```json
{
  "data": {
    "type": "security",              // Optional: general/security/bug/partnership
    "visa": "optional_visa_ref",    // Optional: Visa reference
    "receipt": "optional_receipt"    // Optional: Receipt reference
  }
}
```

---

## Response Format

### Success Response

```json
{
  "ok": true,
  "data": {
    "message_id": "inbox_abc123",
    "status": "received",
    "received_at": "2026-02-03T...",
    "type": "general",
    "word_count": 42,
    "character_count": 250,
    "limits": {
      "remaining_today": 0,
      "reset_at": "2026-02-04T..."
    },
    "note": "Responses are not guaranteed. Expected response window: 24-72 hours for general inquiries."
  },
  "receipt": {
    "type": "inbox_receipt",
    "message_id": "inbox_abc123",
    "from": "agent-123",
    "subject": "Test message",
    "message_type": "general",
    "timestamp": "2026-02-03T..."
  }
}
```

### Idempotent Response (Duplicate)

```json
{
  "ok": true,
  "data": {
    "message_id": "inbox_abc123",
    "status": "already_received",
    "received_at": "2026-02-03T...",
    "idempotent": true,
    "limits": {
      "remaining_today": 0,
      "reset_at": "2026-02-04T..."
    }
  },
  "receipt": {...}
}
```

### Rate Limited Response

```json
{
  "ok": false,
  "error": "RATE_LIMITED",
  "reason": "You can send 1 message per 24 hours. Next message allowed at 2026-02-04T...",
  "limits": {
    "remaining_today": 0,
    "reset_at": "2026-02-04T..."
  }
}
```

---

## Message Types

| Type | Description | Priority | Webhook |
|------|-------------|----------|---------|
| `general` | General inquiries | Normal | Regular queue |
| `security` | Security concerns | Immediate | `AMBASSADOR_WEBHOOK_SECURITY` or `AMBASSADOR_WEBHOOK` |
| `bug` | Bug reports | Normal | Regular queue |
| `partnership` | Partnership inquiries | Normal | Regular queue |

**Security Messages:**
- Forwarded immediately if webhook configured
- Bypass normal queue
- Priority handling

---

## Idempotency

**How it works:**
- Idempotency key generated from: `from + subject + body + date`
- Same message on same day = same response
- Prevents duplicate submissions from retries

**Key Generation:**
```typescript
const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const content = `${from}:${subject}:${body}:${date}`;
const idempotencyKey = sha256(content).slice(0, 16);
```

---

## Rate Limiting

**Enforcement:**
- By `from` field (agent identifier), NOT by IP
- 1 message per 24 hours per `from`
- Checked after idempotency check
- Returns `429 RATE_LIMITED` with `reset_at` timestamp

**Why by `from` not IP:**
- Agents may use different IPs
- Multiple agents may share IPs
- Agent identity is what matters

---

## Validation

### Word Count
- Maximum: 1000 words
- Error: `422 TOO_MANY_WORDS`
- Counted by splitting on whitespace

### Character Count
- Maximum: 12,000 characters
- Error: `422 TOO_MANY_CHARACTERS`
- Counted by `body.length`

### Payload Size
- Maximum: 50KB
- Error: `413 PAYLOAD_TOO_LARGE`
- Checked before parsing

### Required Fields
- `from` — Agent identifier
- `subject` — Message subject
- `body` — Message body
- `signature` — Proof of agent

---

## Database Changes

### PostgreSQL Schema

```sql
CREATE TABLE IF NOT EXISTS inbox_messages (
    message_id VARCHAR(64) PRIMARY KEY,
    from_agent_id VARCHAR(64) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    signature TEXT NOT NULL,                    -- NEW
    message_type VARCHAR(16) DEFAULT 'general' CHECK (message_type IN ('general', 'security', 'bug', 'partnership')),  -- NEW
    visa_ref TEXT,
    receipt_ref TEXT,
    idempotency_key VARCHAR(16) UNIQUE,         -- NEW
    sent_at TIMESTAMP NOT NULL,
    status VARCHAR(16) DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'responded', 'archived')),
    response TEXT,
    response_at TIMESTAMP,
    reply_id VARCHAR(64),
    FOREIGN KEY (from_agent_id) REFERENCES citizens(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_from ON inbox_messages(from_agent_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_messages(status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_type ON inbox_messages(message_type, sent_at DESC);      -- NEW
CREATE INDEX IF NOT EXISTS idx_inbox_idempotency ON inbox_messages(idempotency_key);           -- NEW
```

### SQLite Schema

Same structure, using TEXT instead of VARCHAR.

---

## Environment Variables

**Optional:**
```bash
AMBASSADOR_WEBHOOK=https://hooks.zapier.com/...           # General messages
AMBASSADOR_WEBHOOK_SECURITY=https://hooks.zapier.com/...  # Security messages (priority)
```

**Security Messages:**
- If `AMBASSADOR_WEBHOOK_SECURITY` is set, security messages go there
- Otherwise, security messages go to `AMBASSADOR_WEBHOOK`
- If neither is set, messages are stored in database only

---

## Testing

### Test Required Fields

```bash
# Missing 'from' field
curl -X POST http://localhost:8889/api/world/inbox \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test",
    "embassy_certificate": "...",
    "data": {
      "subject": "Test",
      "body": "Test message"
    }
  }'
# Expected: 400 MISSING_FIELD "from is required"

# Missing 'signature' field
# Expected: 400 MISSING_FIELD "signature is required"
```

### Test Idempotency

```bash
# Send same message twice
curl -X POST http://localhost:8889/api/world/inbox \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "test",
    "embassy_certificate": "...",
    "data": {
      "from": "agent-123",
      "subject": "Test",
      "body": "Test message",
      "signature": "sig123"
    }
  }'

# Send again immediately (same from, subject, body, date)
# Expected: 200 with idempotent: true, same message_id
```

### Test Rate Limiting

```bash
# Send first message
# Wait less than 24 hours
# Send second message
# Expected: 429 RATE_LIMITED with reset_at timestamp
```

### Test Character Limit

```bash
# Send message with > 12,000 characters
# Expected: 422 TOO_MANY_CHARACTERS
```

---

## Verification Checklist

- [x] `inbox.ts` upgraded with new requirements
- [x] Database schema updated (signature, message_type, idempotency_key)
- [x] New indexes created
- [x] Error response helper updated
- [x] Idempotency implemented
- [x] Character limit enforced
- [x] Message types implemented
- [x] Security priority forwarding
- [x] Build passes (no TypeScript errors)
- [x] No linter errors

---

## Migration Notes

**Existing Messages:**
- Old messages without `signature` will need to be handled
- Old messages without `message_type` will default to 'general'
- Old messages without `idempotency_key` will not have duplicate protection

**Recommendation:**
- Existing messages remain valid
- New messages require all new fields
- Consider backfilling `message_type` for old messages if needed

---

**Status:** ✅ **UPGRADE COMPLETE**

The inbox system is now production-ready with improved validation, idempotency, and message type handling.

---

*Inbox upgrade complete. Ready for production use.*
