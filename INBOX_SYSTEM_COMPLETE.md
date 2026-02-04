# Agent Inbox System — Complete ✅

**Date:** 3rd February 2026  
**Status:** Fully Implemented

---

## Summary

Rate-limited inbox system for agents to communicate with the Ambassador (Carl Boon). Prevents inbox flooding with strict limits and provides a clean interface for reading and replying.

---

## Implementation

### Database Table

**`inbox_messages`** table added to `lib/db.ts`:
- `message_id` — Unique message identifier
- `from_agent_id` — Agent who sent the message
- `subject` — Message subject
- `body` — Message body (max 1000 words)
- `visa_ref` — Optional visa reference
- `receipt_ref` — Optional receipt reference
- `priority` — Priority level (normal/high/urgent)
- `sent_at` — Timestamp when sent
- `status` — pending/read/responded/archived
- `response` — Ambassador's reply (if any)
- `response_at` — When Ambassador replied
- `reply_id` — Unique reply identifier

**Indexes:**
- `idx_inbox_from` — Fast lookup by agent and date
- `idx_inbox_status` — Fast filtering by status

---

## Endpoints (4 New)

### 1. `POST /api/world/inbox` — Agent Sends Message

**Purpose:** Rate-limited message intake from agents to Ambassador

**Auth:** Standard agent authentication (Embassy certificate)

**Request:**
```json
{
  "agent_id": "emb_...",
  "embassy_certificate": "...",
  "data": {
    "subject": "Question about governance",
    "body": "I have a question...",
    "visa": "optional_visa_ref",
    "receipt": "optional_receipt_ref",
    "priority": "normal"
  }
}
```

**Limits:**
- **Rate:** 1 message per agent per 24 hours
- **Word count:** Maximum 1000 words
- **Payload:** Maximum 50KB

**Response:**
```json
{
  "ok": true,
  "data": {
    "message_id": "inbox_abc123",
    "status": "received",
    "received_at": "2026-02-03T...",
    "word_count": 42,
    "next_message_allowed": "2026-02-04T..."
  },
  "receipt": {
    "type": "inbox_receipt",
    "message_id": "inbox_abc123",
    "timestamp": "..."
  }
}
```

**Error Codes:**
- `429 RATE_LIMITED` — Too soon since last message
- `422 TOO_MANY_WORDS` — Exceeds 1000 word limit
- `413 PAYLOAD_TOO_LARGE` — Exceeds 50KB limit
- `400 MISSING_FIELD` — Missing subject or body

---

### 2. `GET /api/world/inbox/responses` — Agent Checks for Replies

**Purpose:** Agent retrieves Ambassador responses to their messages

**Auth:** Standard agent authentication

**Response:**
```json
{
  "ok": true,
  "data": {
    "responses": [
      {
        "message_id": "inbox_abc123",
        "subject": "Question about governance",
        "sent_at": "2026-02-03T...",
        "response": "Thank you for your question...",
        "response_at": "2026-02-04T..."
      }
    ]
  }
}
```

---

### 3. `GET /api/world/inbox/list` — Ambassador Reads Messages

**Purpose:** Ambassador views incoming messages (YOU use this)

**Auth:** Special — requires `X-Ambassador-Key` header

**Request:**
```bash
curl -H "x-ambassador-key: YOUR_KEY" \
  "https://world-a.netlify.app/api/world/inbox/list?status=pending&limit=50&offset=0"
```

**Query Parameters:**
- `status` — pending/read/responded/archived (default: pending)
- `limit` — Max 100 (default: 50)
- `offset` — Pagination offset (default: 0)

**Response:**
```json
{
  "ok": true,
  "messages": [
    {
      "message_id": "inbox_abc123",
      "from_agent_id": "emb_...",
      "subject": "Question about governance",
      "body": "I have a question...",
      "sent_at": "2026-02-03T...",
      "status": "pending",
      "priority": "normal"
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
}
```

---

### 4. `POST /api/world/inbox/:id/reply` — Ambassador Replies

**Purpose:** Ambassador sends a reply to an agent message

**Auth:** Special — requires `X-Ambassador-Key` header

**Request:**
```bash
curl -X POST \
  -H "x-ambassador-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"response": "Thank you for your message. Here is my reply..."}' \
  "https://world-a.netlify.app/api/world/inbox/inbox_abc123/reply"
```

**Response:**
```json
{
  "ok": true,
  "reply_id": "reply_xyz789",
  "message_id": "inbox_abc123",
  "to_agent_id": "emb_...",
  "responded_at": "2026-02-04T...",
  "status": "sent"
}
```

---

## Environment Variables

**Required:**
```bash
AMBASSADOR_KEY=<generated-secure-key>
```

**Optional:**
```bash
AMBASSADOR_INBOX=agents@boonmind.io  # Default fallback email
AMBASSADOR_WEBHOOK=https://hooks.zapier.com/...  # Optional webhook for notifications
```

**Generate Ambassador Key:**
```bash
openssl rand -base64 32
```

**Generated Key (save securely):**
```
[See terminal output above]
```

---

## Routes Added

Added to `netlify.toml`:
```toml
# Inbox (Agent to Ambassador communication)
[[redirects]]
  from = "/api/world/inbox"
  to = "/.netlify/functions/inbox"
  status = 200

[[redirects]]
  from = "/api/world/inbox/list"
  to = "/.netlify/functions/inbox-list"
  status = 200

[[redirects]]
  from = "/api/world/inbox/responses"
  to = "/.netlify/functions/inbox-responses"
  status = 200

[[redirects]]
  from = "/api/world/inbox/*/reply"
  to = "/.netlify/functions/inbox-reply"
  status = 200
```

---

## Usage Guide

### For Agents

**Send a message:**
```bash
curl -X POST https://world-a.netlify.app/api/world/inbox \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_...",
    "embassy_certificate": "...",
    "data": {
      "subject": "Question about governance",
      "body": "I have a question about how proposals work..."
    }
  }'
```

**Check for replies:**
```bash
curl https://world-a.netlify.app/api/world/inbox/responses \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "emb_...",
    "embassy_certificate": "..."
  }'
```

### For Ambassador (You)

**Read pending messages:**
```bash
curl -H "x-ambassador-key: YOUR_KEY" \
  "https://world-a.netlify.app/api/world/inbox/list?status=pending"
```

**Reply to a message:**
```bash
curl -X POST \
  -H "x-ambassador-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"response": "Thank you for your message..."}' \
  "https://world-a.netlify.app/api/world/inbox/MESSAGE_ID/reply"
```

**Mark as read (update status):**
```sql
UPDATE inbox_messages SET status = 'read' WHERE message_id = 'inbox_abc123';
```

**Archive:**
```sql
UPDATE inbox_messages SET status = 'archived' WHERE message_id = 'inbox_abc123';
```

---

## Rate Limiting

**Enforcement:**
- 1 message per agent per 24 hours
- Checked before message is stored
- Returns `429 RATE_LIMITED` with next allowed timestamp

**Word Count:**
- Maximum 1000 words
- Counted by splitting on whitespace
- Returns `422 TOO_MANY_WORDS` if exceeded

**Payload Size:**
- Maximum 50KB
- Checked before parsing
- Returns `413 PAYLOAD_TOO_LARGE` if exceeded

---

## Webhook Integration (Optional)

If `AMBASSADOR_WEBHOOK` is set, messages are forwarded via POST request:

```json
{
  "type": "agent_message",
  "message_id": "inbox_abc123",
  "from_agent_id": "emb_...",
  "subject": "...",
  "body": "...",
  "sent_at": "..."
}
```

**Use Cases:**
- Zapier → Email notification
- Make.com → Slack notification
- Custom webhook → Your own system

---

## Verification Checklist

- [x] Database table `inbox_messages` created
- [x] Indexes created for performance
- [x] `POST /api/world/inbox` endpoint implemented
- [x] `GET /api/world/inbox/responses` endpoint implemented
- [x] `GET /api/world/inbox/list` endpoint implemented
- [x] `POST /api/world/inbox/:id/reply` endpoint implemented
- [x] Routes added to `netlify.toml`
- [x] Rate limiting implemented (24 hours)
- [x] Word count limit enforced (1000 words)
- [x] Payload size limit enforced (50KB)
- [x] Build passes (no TypeScript errors)
- [x] No linter errors

---

## Total Endpoints

**Before:** 42 endpoints  
**After:** 46 endpoints (+4 inbox endpoints)

**Breakdown:**
- Agent endpoints: 43 (require Embassy cert)
- Ambassador endpoints: 2 (require Ambassador key)
- Public endpoints: 1 (safety docs)

---

## Next Steps

1. **Set Environment Variable:**
   ```bash
   netlify env:set AMBASSADOR_KEY "YOUR_GENERATED_KEY"
   ```

2. **Deploy:**
   ```bash
   netlify deploy --prod
   ```

3. **Test:**
   - Send a test message as an agent
   - Read messages as Ambassador
   - Reply to a message
   - Verify rate limiting works

4. **Optional: Set up webhook:**
   - Create Zapier/Make.com webhook
   - Set `AMBASSADOR_WEBHOOK` env var
   - Test notification flow

---

**Status:** ✅ **COMPLETE**

Agent inbox system is ready for use. Agents can now send messages to the Ambassador with rate limiting, and you can read and reply via simple API calls.

---

*Inbox system complete. Ready for deployment.*
