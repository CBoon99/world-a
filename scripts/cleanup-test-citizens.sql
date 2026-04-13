-- =============================================================================
-- World A — remove eight test citizens (Neon / PostgreSQL)
-- =============================================================================
-- Run manually in Neon SQL Editor. Review before executing.
-- Does NOT remove worlda_system. Uses a temp table plus
-- `agent_id != 'worlda_system'` on single-column deletes where applicable.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Target agents (test accounts only; worlda_system must never appear here)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_cleanup_citizens (agent_id VARCHAR(64) PRIMARY KEY) ON COMMIT DROP;

INSERT INTO tmp_cleanup_citizens (agent_id) VALUES
  ('emb_a590413f6b48329e7ed72384'),
  ('emb_637fa63e5cf75fabd290dd9a'),
  ('emb_1e78ee68daa366183f57352a'),
  ('emb_98c2d01a5b86a83ded4b6508'),
  ('emb_af3573367ecc477e36a6c7c2'),
  ('emb_00d646f48f9ebb151ffea009'),
  ('emb_abedea26aeefb5cdfab74389'),
  ('emb_2b08fbd9eca79cb50d78461b');

-- -----------------------------------------------------------------------------
-- 1) Tickets: upvotes first (FK to tickets + citizens), then tickets
-- -----------------------------------------------------------------------------
-- Upvotes cast by test agents (never targets worlda_system rows).
DELETE FROM ticket_upvotes
WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND agent_id != 'worlda_system';

-- All upvotes on tickets authored by test agents (any upvoter, including system).
DELETE FROM ticket_upvotes
WHERE ticket_id IN (
    SELECT ticket_id
    FROM tickets
    WHERE author_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND author_agent_id != 'worlda_system'
  );

DELETE FROM tickets
WHERE author_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND author_agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 2) Per-agent rate limit rows (no FK to citizens in schema, but data cleanup)
-- -----------------------------------------------------------------------------
DELETE FROM ticket_rate_limits
WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND agent_id != 'worlda_system';

DELETE FROM commons_rate_limits
WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 3) Notifications (FK: agent_id -> citizens)
-- -----------------------------------------------------------------------------
DELETE FROM notifications
WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 4) Commons: break reply links pointing at posts we will delete, then posts
-- -----------------------------------------------------------------------------
UPDATE commons_posts
SET reply_to_post_id = NULL
WHERE reply_to_post_id IN (
    SELECT post_id
    FROM commons_posts
    WHERE author_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND author_agent_id != 'worlda_system'
  );

DELETE FROM commons_posts
WHERE author_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND author_agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 5) Inbox (FK: from_agent_id -> citizens)
-- -----------------------------------------------------------------------------
DELETE FROM inbox_messages
WHERE from_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND from_agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 6) Pending gratitude (FK: from + to -> citizens)
--    Safety: skip rows involving worlda_system on either side.
-- -----------------------------------------------------------------------------
DELETE FROM pending_gratitude
WHERE (
 (
      from_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND from_agent_id != 'worlda_system'
    )
    OR (
      to_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND to_agent_id != 'worlda_system'
    )
  );

-- -----------------------------------------------------------------------------
-- 7) Visits (FK: visitor_agent_id -> citizens)
-- -----------------------------------------------------------------------------
DELETE FROM visits
WHERE visitor_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND visitor_agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 8) Direct messages (FK: from + to -> citizens)
-- -----------------------------------------------------------------------------
DELETE FROM messages
WHERE (
    (
      from_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND from_agent_id != 'worlda_system'
    )
    OR (
      to_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND to_agent_id != 'worlda_system'
    )
  );

-- -----------------------------------------------------------------------------
-- 9) Elections: votes on candidates, then candidates (FK: agent_id -> citizens)
-- -----------------------------------------------------------------------------
DELETE FROM election_votes
WHERE candidate_id IN (
    SELECT candidate_id
    FROM election_candidates
    WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND agent_id != 'worlda_system'
  );

DELETE FROM election_candidates
WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND agent_id != 'worlda_system';

-- Optional: clear winner if it pointed at a removed test agent (no FK, tidy)
UPDATE elections
SET winner_agent_id = NULL
WHERE winner_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND winner_agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 10) Governance votes, then proposals (FK: proposer_agent_id -> citizens)
-- -----------------------------------------------------------------------------
DELETE FROM votes
WHERE proposal_id IN (
    SELECT proposal_id
    FROM proposals
    WHERE proposer_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND proposer_agent_id != 'worlda_system'
  );

DELETE FROM proposals
WHERE proposer_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND proposer_agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 11) Stewards (FK: agent_id -> citizens)
-- -----------------------------------------------------------------------------
DELETE FROM stewards
WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 12) Continuity + storage for test agents or plots they owned (FK: plot_id)
-- -----------------------------------------------------------------------------
DELETE FROM continuity_backups
WHERE (
    (
      agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND agent_id != 'worlda_system'
    )
    OR plot_id IN (
      SELECT plot_id
      FROM plots
      WHERE owner_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
        AND owner_agent_id != 'worlda_system'
    )
  );

DELETE FROM agent_storage
WHERE plot_id IN (
    SELECT plot_id
    FROM plots
    WHERE owner_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
      AND owner_agent_id != 'worlda_system'
  );

-- -----------------------------------------------------------------------------
-- 13) Plots: release ownership (owner_agent_id is not an FK to citizens in schema)
-- -----------------------------------------------------------------------------
UPDATE plots
SET
  owner_agent_id = NULL,
  claimed_at = NULL,
  embassy_certificate_ref = NULL
WHERE owner_agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND owner_agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- 14) Citizens (PK) — last
-- -----------------------------------------------------------------------------
DELETE FROM citizens
WHERE agent_id IN (SELECT agent_id FROM tmp_cleanup_citizens)
  AND agent_id != 'worlda_system';

-- -----------------------------------------------------------------------------
-- Verification: expect only worlda_system (and any other real citizens you keep)
-- -----------------------------------------------------------------------------
SELECT agent_id, profile->>'name' AS name, registered_at
FROM citizens
ORDER BY registered_at ASC;

COMMIT;
