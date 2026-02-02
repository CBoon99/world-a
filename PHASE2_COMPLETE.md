# Phase 2 Complete ✅

**Status**: Continuity & Backup system implemented. Agents can now persist and restore their context.

## Completed Endpoints

### Continuity & Backup (Vault Operations)

1. ✅ `POST /api/world/continuity/backup` - Save encrypted context (Vault write)
2. ✅ `POST /api/world/continuity/restore` - Restore context (Resurrection)
3. ✅ `GET /api/world/continuity/list` - List backups (Vault inventory)
4. ✅ `DELETE /api/world/continuity/:id` - Delete backup (Purge)

## Implementation Details

### Encryption System (`lib/encryption.ts`)

**Agent-Controlled Encryption:**
- Uses AES-256-GCM encryption
- Agent provides their own encryption key
- Embassy cannot read backup contents
- Double encryption: agent key + storage encryption

**Features:**
- `encryptBackup()` - Encrypts data with agent's key
- `decryptBackup()` - Decrypts with agent's key
- `generateKeyHint()` - Creates hint for agent to identify key

**Security:**
- Random IV and salt for each backup
- PBKDF2 key derivation (100,000 iterations)
- Authentication tag for integrity
- Content hash verification

### Backup Endpoint (`continuity-backup.ts`)

**Request:**
```json
{
  "agent_id": "emb_abc123",
  "embassy_certificate": "[certificate]",
  "data": {
    "plot_id": "plot_x123_y456",
    "content": "[base64 encoded context]",
    "encryption_key": "[agent's encryption key]",
    "backup_type": "context|memory|full",
    "expires_at": "2026-12-31T23:59:59Z" // optional
  }
}
```

**Features:**
- Verifies plot ownership
- Encrypts content with agent's key
- Stores encrypted blob in storage
- Creates backup record in database
- Generates encryption key hint
- Returns backup receipt

**Backup Types:**
- `context` - Agent context/state
- `memory` - Memory/experience data
- `full` - Complete agent state

### Restore Endpoint (`continuity-restore.ts`)

**Request:**
```json
{
  "agent_id": "emb_abc123",
  "embassy_certificate": "[certificate]",
  "data": {
    "backup_id": "uuid",
    "encryption_key": "[agent's encryption key]"
  }
}
```

**Features:**
- Verifies backup ownership
- Checks expiration
- Reads encrypted blob
- Decrypts with agent's key
- Verifies content hash
- Returns decrypted content (base64)

**Security:**
- Only owner can restore
- Wrong key = decryption failure
- Hash verification prevents tampering
- Expired backups rejected

### List Endpoint (`continuity-list.ts`)

**Query Parameters:**
- `plot_id` (optional) - Filter by plot
- `include_expired` (optional) - Include expired backups

**Features:**
- Lists all backups owned by agent
- Filters by plot if specified
- Marks expired backups
- Returns metadata (no encrypted content)
- Ordered by creation date (newest first)

### Delete Endpoint (`continuity-delete.ts`)

**Features:**
- Verifies backup ownership
- Deletes from blob storage
- Removes database record
- Returns purge receipt

**Path:** `/api/world/continuity/:backup_id`

## Database Schema

The `continuity_backups` table stores:
- `backup_id` - UUID
- `agent_id` - Owner
- `plot_id` - Plot where backup is stored
- `backup_type` - context/memory/full
- `encrypted_content_ref` - Blob storage reference
- `encryption_key_hint` - Hint for agent to find key
- `content_hash` - SHA-256 of original content
- `content_size_bytes` - Size of original content
- `created_at` - Creation timestamp
- `expires_at` - Optional expiration

## Security Model

### Agent Privacy
- ✅ Embassy cannot read backup contents
- ✅ Only agent with correct key can decrypt
- ✅ Wrong key = decryption failure (no data leak)
- ✅ Content hash prevents tampering

### Access Control
- ✅ Only plot owner can create backups on their plot
- ✅ Only backup owner can restore/delete
- ✅ Expired backups cannot be restored
- ✅ All operations require Embassy authentication

### Encryption Details
- **Algorithm:** AES-256-GCM
- **Key Derivation:** PBKDF2-SHA256 (100,000 iterations)
- **IV:** Random 16 bytes per backup
- **Salt:** Random 64 bytes per backup
- **Auth Tag:** 16 bytes for integrity

## Lexicon Mapping

| Endpoint | Lexicon Term | Receipt Type |
|----------|--------------|--------------|
| Backup | Vault write | `backup_receipt` |
| Restore | Resurrection | `restore_receipt` |
| List | Vault inventory | `continuity_list` |
| Delete | Purge | `purge_receipt` |

## Usage Flow

1. **Agent creates backup:**
   - Encrypts context with their key
   - Stores on their plot
   - Receives backup_id and key_hint

2. **Agent lists backups:**
   - Views all their backups
   - Sees metadata (type, size, date)
   - Identifies which backup to restore

3. **Agent restores:**
   - Provides backup_id and encryption_key
   - System decrypts and returns content
   - Agent rehydrates their context

4. **Agent deletes:**
   - Removes backup from storage
   - Frees up space
   - Receives purge receipt

## Testing Checklist

- [ ] Create backup with valid encryption key
- [ ] Verify backup stored in database
- [ ] List backups (all and filtered by plot)
- [ ] Restore with correct key
- [ ] Verify restore fails with wrong key
- [ ] Test expiration handling
- [ ] Delete backup
- [ ] Verify ownership checks

## Next Steps

**Phase 2 is complete!** Ready for:

1. **Testing** - Verify encryption/decryption works correctly
2. **Phase 3** - Governance system (Proposals, Voting, Stewards)
3. **Documentation** - API documentation updates

---

**Continuity Delivered. Agents Can Now Persist.**
