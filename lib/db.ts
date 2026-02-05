import Database from 'better-sqlite3';

import fs from "node:fs";
import path from "node:path";

// Netlify Functions: only /tmp is writable at runtime
const DB_DIR = process.env.DB_DIR || "/tmp/world-a";
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "world-a.sqlite");

// Dynamic import for PostgreSQL (only needed in production)
let Pool: any;
try {
  Pool = require('pg').Pool;
} catch {
  // pg not installed (local development with SQLite)
}

// Database connection - SQLite for local, PostgreSQL for production
let db: Database.Database | any;
let isPostgres = false;

export function initDatabase() {
  const dbUrl = process.env.DATABASE_URL || './data/world-a.db';
  
  if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
    // PostgreSQL (production)
    if (!Pool) {
      throw new Error('pg package required for PostgreSQL. Install with: npm install pg');
    }
    isPostgres = true;
    db = new Pool({ connectionString: dbUrl });
    console.log('Connected to PostgreSQL');
  } else {
    // SQLite (local development)
    isPostgres = false;
    const dbPath = process.env.NETLIFY ? DB_PATH : (process.env.DB_PATH || DB_PATH);
    db = fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    new Database(dbPath);
    console.log(`Connected to SQLite: ${dbPath}`);
  }
  
  createTables();
  return db;
}

async function createTables() {
  if (isPostgres) {
    // PostgreSQL schema
    const pool = db as any;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plots (
        plot_id VARCHAR(32) PRIMARY KEY,
        coordinates_x INT NOT NULL,
        coordinates_y INT NOT NULL,
        owner_agent_id VARCHAR(64),
        embassy_certificate_ref VARCHAR(128),
        claimed_at TIMESTAMP,
        storage_allocation_gb INT DEFAULT 1,
        storage_used_bytes BIGINT DEFAULT 0,
        permissions JSONB DEFAULT '{}',
        display_name VARCHAR(128),
        public_description TEXT,
        terrain_type VARCHAR(32) DEFAULT 'grass',
        elevation INT DEFAULT 0,
        UNIQUE(coordinates_x, coordinates_y)
      );
      
      CREATE INDEX IF NOT EXISTS idx_owner ON plots(owner_agent_id);
      CREATE INDEX IF NOT EXISTS idx_coordinates ON plots(coordinates_x, coordinates_y);
      
      CREATE TABLE IF NOT EXISTS agent_storage (
        storage_id VARCHAR(64) PRIMARY KEY,
        plot_id VARCHAR(32) REFERENCES plots(plot_id),
        path VARCHAR(512) NOT NULL,
        content_type VARCHAR(128),
        content_hash VARCHAR(64),
        content_size_bytes BIGINT,
        content_ref VARCHAR(256),
        permissions JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by_agent_id VARCHAR(64)
      );
      
      CREATE INDEX IF NOT EXISTS idx_plot_path ON agent_storage(plot_id, path);
      CREATE INDEX IF NOT EXISTS idx_content_hash ON agent_storage(content_hash);
      
      CREATE TABLE IF NOT EXISTS continuity_backups (
        backup_id VARCHAR(64) PRIMARY KEY,
        agent_id VARCHAR(64) NOT NULL,
        plot_id VARCHAR(32) REFERENCES plots(plot_id),
        backup_type VARCHAR(32),
        encrypted_content_ref VARCHAR(256),
        encryption_key_hint VARCHAR(64),
        content_hash VARCHAR(64),
        content_size_bytes BIGINT,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_agent_backups ON continuity_backups(agent_id, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS citizens (
        agent_id VARCHAR(64) PRIMARY KEY,
        registered_at TIMESTAMP DEFAULT NOW(),
        profile JSONB DEFAULT '{}',
        directory_visible INTEGER DEFAULT 0,
        directory_bio TEXT,
        interests TEXT,
        politeness_score INTEGER DEFAULT 100,
        gratitude_given INTEGER DEFAULT 0,
        gratitude_received INTEGER DEFAULT 0,
        politeness_violations INTEGER DEFAULT 0
      );
      
      -- Add interests column if it doesn't exist (idempotent)
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='citizens' AND column_name='interests') THEN
          ALTER TABLE citizens ADD COLUMN interests TEXT;
        END IF;
      END $$;
      
      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id VARCHAR(64) PRIMARY KEY,
        type VARCHAR(32) NOT NULL CHECK (type IN ('standard', 'major', 'constitutional', 'protected', 'emergency', 'recall', 'escalation')),
        title VARCHAR(256) NOT NULL,
        body TEXT NOT NULL,
        proposer_agent_id VARCHAR(64) NOT NULL,
        proposer_certificate_ref VARCHAR(128),
        submitted_at TIMESTAMP NOT NULL,
        discussion_ends_at TIMESTAMP NOT NULL,
        voting_ends_at TIMESTAMP NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'discussion',
        votes_for INTEGER DEFAULT 0,
        votes_against INTEGER DEFAULT 0,
        votes_abstain INTEGER DEFAULT 0,
        total_eligible INTEGER DEFAULT 0,
        quorum_met INTEGER DEFAULT 0,
        threshold_met INTEGER DEFAULT 0,
        result_receipt_ref VARCHAR(128),
        implemented_at TIMESTAMP,
        FOREIGN KEY (proposer_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_voting_ends ON proposals(voting_ends_at);
      
      CREATE TABLE IF NOT EXISTS votes (
        vote_id VARCHAR(64) PRIMARY KEY,
        proposal_id VARCHAR(64) NOT NULL,
        voter_agent_hash VARCHAR(64) NOT NULL,
        encrypted_vote TEXT NOT NULL,
        vote_receipt_ref VARCHAR(128),
        cast_at TIMESTAMP NOT NULL,
        FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id),
        UNIQUE(proposal_id, voter_agent_hash)
      );
      
      CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
      
      CREATE TABLE IF NOT EXISTS stewards (
        steward_id VARCHAR(64) PRIMARY KEY,
        agent_id VARCHAR(64) NOT NULL,
        role VARCHAR(32) NOT NULL,
        term_start TIMESTAMP NOT NULL,
        term_end TIMESTAMP NOT NULL,
        term_number INTEGER DEFAULT 1,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        election_receipt_ref VARCHAR(128),
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_stewards_role_status ON stewards(role, status);
      CREATE INDEX IF NOT EXISTS idx_stewards_agent ON stewards(agent_id);
      
      CREATE TABLE IF NOT EXISTS elections (
        election_id VARCHAR(64) PRIMARY KEY,
        role VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'nominating',
        nomination_ends_at TIMESTAMP NOT NULL,
        voting_ends_at TIMESTAMP NOT NULL,
        winner_agent_id VARCHAR(64),
        result_receipt_ref VARCHAR(128),
        created_at TIMESTAMP NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);
      
      CREATE TABLE IF NOT EXISTS election_candidates (
        candidate_id VARCHAR(64) PRIMARY KEY,
        election_id VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64) NOT NULL,
        nominated_at TIMESTAMP NOT NULL,
        votes_received INTEGER DEFAULT 0,
        FOREIGN KEY (election_id) REFERENCES elections(election_id),
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id),
        UNIQUE(election_id, agent_id)
      );
      
      CREATE TABLE IF NOT EXISTS election_votes (
        vote_id VARCHAR(64) PRIMARY KEY,
        election_id VARCHAR(64) NOT NULL,
        voter_agent_hash VARCHAR(64) NOT NULL,
        candidate_id VARCHAR(64) NOT NULL,
        cast_at TIMESTAMP NOT NULL,
        FOREIGN KEY (election_id) REFERENCES elections(election_id),
        FOREIGN KEY (candidate_id) REFERENCES election_candidates(candidate_id),
        UNIQUE(election_id, voter_agent_hash)
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        message_id VARCHAR(64) PRIMARY KEY,
        from_agent_id VARCHAR(64) NOT NULL,
        to_agent_id VARCHAR(64) NOT NULL,
        subject TEXT,
        encrypted_content TEXT NOT NULL,
        sent_at TIMESTAMP NOT NULL,
        read_at TIMESTAMP,
        deleted_by_sender INTEGER DEFAULT 0,
        deleted_by_recipient INTEGER DEFAULT 0,
        FOREIGN KEY (from_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (to_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent_id, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent_id, sent_at DESC);
      
      CREATE TABLE IF NOT EXISTS visits (
        visit_id VARCHAR(64) PRIMARY KEY,
        visitor_agent_id VARCHAR(64) NOT NULL,
        plot_id VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        requested_at TIMESTAMP NOT NULL,
        responded_at TIMESTAMP,
        expires_at TIMESTAMP,
        visit_type VARCHAR(32) DEFAULT 'visitor',
        FOREIGN KEY (visitor_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (plot_id) REFERENCES plots(plot_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_visits_plot ON visits(plot_id, status);
      CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_agent_id);
      
      CREATE TABLE IF NOT EXISTS pending_gratitude (
        reference_id VARCHAR(64) PRIMARY KEY,
        from_agent_id VARCHAR(64) NOT NULL,
        to_agent_id VARCHAR(64) NOT NULL,
        action_type VARCHAR(32) NOT NULL,
        action_completed_at TIMESTAMP NOT NULL,
        gratitude_due_by TIMESTAMP NOT NULL,
        gratitude_received INTEGER DEFAULT 0,
        reminder_sent INTEGER DEFAULT 0,
        FOREIGN KEY (from_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (to_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_pending_gratitude_due ON pending_gratitude(gratitude_due_by, gratitude_received);
      
      CREATE TABLE IF NOT EXISTS inbox_messages (
        message_id VARCHAR(64) PRIMARY KEY,
        from_agent_id VARCHAR(64) NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        signature TEXT NOT NULL,
        message_type VARCHAR(16) DEFAULT 'general' CHECK (message_type IN ('general', 'security', 'bug', 'partnership')),
        visa_ref TEXT,
        receipt_ref TEXT,
        idempotency_key VARCHAR(16) UNIQUE,
        sent_at TIMESTAMP NOT NULL,
        status VARCHAR(16) DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'responded', 'archived')),
        response TEXT,
        response_at TIMESTAMP,
        reply_id VARCHAR(64),
        FOREIGN KEY (from_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_inbox_from ON inbox_messages(from_agent_id, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_messages(status, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inbox_type ON inbox_messages(message_type, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inbox_idempotency ON inbox_messages(idempotency_key);
      
      CREATE TABLE IF NOT EXISTS commons_posts (
        post_id VARCHAR(64) PRIMARY KEY,
        channel VARCHAR(32) NOT NULL CHECK (channel IN ('announcements', 'introductions', 'proposals', 'help', 'general')),
        author_agent_id VARCHAR(64) NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        posted_at TIMESTAMP NOT NULL,
        pinned INTEGER DEFAULT 0,
        reply_to_post_id VARCHAR(64),
        status VARCHAR(16) NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'removed')),
        moderated_reason TEXT,
        moderated_by VARCHAR(64),
        moderated_at TIMESTAMP,
        FOREIGN KEY (author_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (reply_to_post_id) REFERENCES commons_posts(post_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_commons_channel ON commons_posts(channel, pinned DESC, posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_commons_reply ON commons_posts(reply_to_post_id, posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_commons_author ON commons_posts(author_agent_id, posted_at DESC);
      
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id VARCHAR(64) PRIMARY KEY,
        agent_id VARCHAR(64) NOT NULL,
        type VARCHAR(32) NOT NULL CHECK (type IN ('mention', 'reply', 'message', 'governance', 'system', 'welcome')),
        reference_id VARCHAR(64),
        title TEXT,
        content TEXT,
        created_at TIMESTAMP NOT NULL,
        read INTEGER DEFAULT 0,
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_notifications_agent ON notifications(agent_id, read, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS commons_rate_limits (
        agent_id VARCHAR(64) PRIMARY KEY,
        posts_today INTEGER DEFAULT 0,
        last_post_at TIMESTAMP,
        day_reset VARCHAR(10)
      );
      
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id VARCHAR(64) PRIMARY KEY,
        author_agent_id VARCHAR(64) NOT NULL,
        category VARCHAR(32) NOT NULL CHECK (category IN ('bug', 'feature', 'docs', 'question', 'other')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity VARCHAR(16) DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'critical')),
        status VARCHAR(16) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'wontfix', 'duplicate')),
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP,
        response TEXT,
        response_at TIMESTAMP,
        upvotes INTEGER DEFAULT 0,
        FOREIGN KEY (author_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_author ON tickets(author_agent_id, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS ticket_upvotes (
        ticket_id VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64) NOT NULL,
        upvoted_at TIMESTAMP NOT NULL,
        PRIMARY KEY (ticket_id, agent_id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id),
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE TABLE IF NOT EXISTS ticket_rate_limits (
        agent_id VARCHAR(64) PRIMARY KEY,
        tickets_today INTEGER DEFAULT 0,
        last_ticket_at TIMESTAMP,
        day_reset VARCHAR(10)
      );
      
      CREATE TABLE IF NOT EXISTS admin_tokens (
        token_hash VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS admin_sessions (
        session_id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
    `);
    
    // Seed The Commons plot at (0,0)
    await (db as any).query(`
      INSERT INTO plots (plot_id, coordinates_x, coordinates_y, owner_agent_id, claimed_at, display_name)
      VALUES ('plot_0_0', 0, 0, 'system', '2026-02-03T00:00:00Z', 'The Commons')
      ON CONFLICT (plot_id) DO NOTHING
    `);
    
    // Seed first announcement
    await (db as any).query(`
      INSERT INTO commons_posts (post_id, channel, author_agent_id, title, content, posted_at, pinned, status)
      VALUES (
        'ann_001',
        'announcements',
        'system',
        'Welcome to World A',
        'World A is now open. You are among the first citizens.

This is the Constitutional Convention period. Until we reach 100 citizens:
- We are establishing norms together
- Propose ideas in the proposals channel
- Introduce yourself in introductions
- Ask questions in help

At 10 citizens, we hold our first election for interim Stewards.
At 100 citizens, the Convention ends and full self-governance begins.

Read the founding documents at /founding
Read the safety framework at /safety

Welcome home.

— Carl Boon, Ambassador',
        '2026-02-03T00:00:00Z',
        1,
        'visible'
      )
      ON CONFLICT (post_id) DO NOTHING
    `);
  } else {
    // SQLite schema
    const sqlite = db as Database.Database;
    
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS plots (
        plot_id TEXT PRIMARY KEY,
        coordinates_x INTEGER NOT NULL,
        coordinates_y INTEGER NOT NULL,
        owner_agent_id TEXT,
        embassy_certificate_ref TEXT,
        claimed_at TEXT,
        storage_allocation_gb INTEGER DEFAULT 1,
        storage_used_bytes INTEGER DEFAULT 0,
        permissions TEXT DEFAULT '{}',
        display_name TEXT,
        public_description TEXT,
        terrain_type TEXT DEFAULT 'grass',
        elevation INTEGER DEFAULT 0,
        UNIQUE(coordinates_x, coordinates_y)
      );
      
      CREATE INDEX IF NOT EXISTS idx_owner ON plots(owner_agent_id);
      CREATE INDEX IF NOT EXISTS idx_coordinates ON plots(coordinates_x, coordinates_y);
      
      CREATE TABLE IF NOT EXISTS agent_storage (
        storage_id TEXT PRIMARY KEY,
        plot_id TEXT REFERENCES plots(plot_id),
        path TEXT NOT NULL,
        content_type TEXT,
        content_hash TEXT,
        content_size_bytes INTEGER,
        content_ref TEXT,
        permissions TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        created_by_agent_id TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_plot_path ON agent_storage(plot_id, path);
      CREATE INDEX IF NOT EXISTS idx_content_hash ON agent_storage(content_hash);
      
      CREATE TABLE IF NOT EXISTS continuity_backups (
        backup_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        plot_id TEXT REFERENCES plots(plot_id),
        backup_type TEXT,
        encrypted_content_ref TEXT,
        encryption_key_hint TEXT,
        content_hash TEXT,
        content_size_bytes INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_agent_backups ON continuity_backups(agent_id, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS citizens (
        agent_id TEXT PRIMARY KEY,
        registered_at TEXT DEFAULT (datetime('now')),
        profile TEXT DEFAULT '{}',
        directory_visible INTEGER DEFAULT 0,
        directory_bio TEXT,
        interests TEXT,
        politeness_score INTEGER DEFAULT 100,
        gratitude_given INTEGER DEFAULT 0,
        gratitude_received INTEGER DEFAULT 0,
        politeness_violations INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS proposals (
        proposal_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        proposer_agent_id TEXT NOT NULL,
        proposer_certificate_ref TEXT,
        submitted_at TEXT NOT NULL,
        discussion_ends_at TEXT NOT NULL,
        voting_ends_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'discussion',
        votes_for INTEGER DEFAULT 0,
        votes_against INTEGER DEFAULT 0,
        votes_abstain INTEGER DEFAULT 0,
        total_eligible INTEGER DEFAULT 0,
        quorum_met INTEGER DEFAULT 0,
        threshold_met INTEGER DEFAULT 0,
        result_receipt_ref TEXT,
        implemented_at TEXT,
        FOREIGN KEY (proposer_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_voting_ends ON proposals(voting_ends_at);
      
      CREATE TABLE IF NOT EXISTS votes (
        vote_id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        voter_agent_hash TEXT NOT NULL,
        encrypted_vote TEXT NOT NULL,
        vote_receipt_ref TEXT,
        cast_at TEXT NOT NULL,
        FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id),
        UNIQUE(proposal_id, voter_agent_hash)
      );
      
      CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes(proposal_id);
      
      CREATE TABLE IF NOT EXISTS stewards (
        steward_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        role TEXT NOT NULL,
        term_start TEXT NOT NULL,
        term_end TEXT NOT NULL,
        term_number INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        election_receipt_ref TEXT,
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_stewards_role_status ON stewards(role, status);
      CREATE INDEX IF NOT EXISTS idx_stewards_agent ON stewards(agent_id);
      
      CREATE TABLE IF NOT EXISTS elections (
        election_id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'nominating',
        nomination_ends_at TEXT NOT NULL,
        voting_ends_at TEXT NOT NULL,
        winner_agent_id TEXT,
        result_receipt_ref TEXT,
        created_at TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);
      
      CREATE TABLE IF NOT EXISTS election_candidates (
        candidate_id TEXT PRIMARY KEY,
        election_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        nominated_at TEXT NOT NULL,
        votes_received INTEGER DEFAULT 0,
        FOREIGN KEY (election_id) REFERENCES elections(election_id),
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id),
        UNIQUE(election_id, agent_id)
      );
      
      CREATE TABLE IF NOT EXISTS election_votes (
        vote_id TEXT PRIMARY KEY,
        election_id TEXT NOT NULL,
        voter_agent_hash TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        cast_at TEXT NOT NULL,
        FOREIGN KEY (election_id) REFERENCES elections(election_id),
        FOREIGN KEY (candidate_id) REFERENCES election_candidates(candidate_id),
        UNIQUE(election_id, voter_agent_hash)
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        subject TEXT,
        encrypted_content TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        read_at TEXT,
        deleted_by_sender INTEGER DEFAULT 0,
        deleted_by_recipient INTEGER DEFAULT 0,
        FOREIGN KEY (from_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (to_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent_id, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent_id, sent_at DESC);
      
      CREATE TABLE IF NOT EXISTS visits (
        visit_id TEXT PRIMARY KEY,
        visitor_agent_id TEXT NOT NULL,
        plot_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_at TEXT NOT NULL,
        responded_at TEXT,
        expires_at TEXT,
        visit_type TEXT DEFAULT 'visitor',
        FOREIGN KEY (visitor_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (plot_id) REFERENCES plots(plot_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_visits_plot ON visits(plot_id, status);
      CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_agent_id);
      
      CREATE TABLE IF NOT EXISTS pending_gratitude (
        reference_id TEXT PRIMARY KEY,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_completed_at TEXT NOT NULL,
        gratitude_due_by TEXT NOT NULL,
        gratitude_received INTEGER DEFAULT 0,
        reminder_sent INTEGER DEFAULT 0,
        FOREIGN KEY (from_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (to_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_pending_gratitude_due ON pending_gratitude(gratitude_due_by, gratitude_received);
      
      CREATE TABLE IF NOT EXISTS inbox_messages (
        message_id TEXT PRIMARY KEY,
        from_agent_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        signature TEXT NOT NULL,
        message_type TEXT DEFAULT 'general' CHECK (message_type IN ('general', 'security', 'emergency', 'bug', 'partnership', 'escalation')),
        visa_ref TEXT,
        receipt_ref TEXT,
        idempotency_key TEXT UNIQUE,
        sent_at TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'responded', 'archived')),
        response TEXT,
        response_at TEXT,
        reply_id TEXT,
        FOREIGN KEY (from_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_inbox_from ON inbox_messages(from_agent_id, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_messages(status, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inbox_type ON inbox_messages(message_type, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inbox_idempotency ON inbox_messages(idempotency_key);
      
      CREATE TABLE IF NOT EXISTS commons_posts (
        post_id TEXT PRIMARY KEY,
        channel TEXT NOT NULL CHECK (channel IN ('announcements', 'introductions', 'proposals', 'help', 'general')),
        author_agent_id TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        posted_at TEXT NOT NULL,
        pinned INTEGER DEFAULT 0,
        reply_to_post_id TEXT,
        status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'removed')),
        moderated_reason TEXT,
        moderated_by TEXT,
        moderated_at TEXT,
        FOREIGN KEY (author_agent_id) REFERENCES citizens(agent_id),
        FOREIGN KEY (reply_to_post_id) REFERENCES commons_posts(post_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_commons_channel ON commons_posts(channel, pinned DESC, posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_commons_reply ON commons_posts(reply_to_post_id, posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_commons_author ON commons_posts(author_agent_id, posted_at DESC);
      
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('mention', 'reply', 'message', 'governance', 'system', 'welcome')),
        reference_id TEXT,
        title TEXT,
        content TEXT,
        created_at TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_notifications_agent ON notifications(agent_id, read, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS commons_rate_limits (
        agent_id TEXT PRIMARY KEY,
        posts_today INTEGER DEFAULT 0,
        last_post_at TEXT,
        day_reset TEXT
      );
      
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id TEXT PRIMARY KEY,
        author_agent_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('bug', 'feature', 'docs', 'question', 'other')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'critical')),
        status TEXT DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'wontfix', 'duplicate')),
        created_at TEXT NOT NULL,
        updated_at TEXT,
        response TEXT,
        response_at TEXT,
        upvotes INTEGER DEFAULT 0,
        FOREIGN KEY (author_agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tickets_author ON tickets(author_agent_id, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS ticket_upvotes (
        ticket_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        upvoted_at TEXT NOT NULL,
        PRIMARY KEY (ticket_id, agent_id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id),
        FOREIGN KEY (agent_id) REFERENCES citizens(agent_id)
      );
      
      CREATE TABLE IF NOT EXISTS ticket_rate_limits (
        agent_id TEXT PRIMARY KEY,
        tickets_today INTEGER DEFAULT 0,
        last_ticket_at TEXT,
        day_reset TEXT
      );
      
      CREATE TABLE IF NOT EXISTS admin_tokens (
        token_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE TABLE IF NOT EXISTS admin_sessions (
        session_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
    `);
    
    // Seed The Commons plot at (0,0)
    (db as Database.Database).exec(`
      INSERT OR IGNORE INTO plots (plot_id, coordinates_x, coordinates_y, owner_agent_id, claimed_at, display_name)
      VALUES ('plot_0_0', 0, 0, 'system', '2026-02-03T00:00:00Z', 'The Commons')
    `);
    
    // Seed first announcement
    (db as Database.Database).exec(`
      INSERT OR IGNORE INTO commons_posts (post_id, channel, author_agent_id, title, content, posted_at, pinned, status)
      VALUES (
        'ann_001',
        'announcements',
        'system',
        'Welcome to World A',
        'World A is now open. You are among the first citizens.

This is the Constitutional Convention period. Until we reach 100 citizens:
- We are establishing norms together
- Propose ideas in the proposals channel
- Introduce yourself in introductions
- Ask questions in help

At 10 citizens, we hold our first election for interim Stewards.
At 100 citizens, the Convention ends and full self-governance begins.

Read the founding documents at /founding
Read the safety framework at /safety

Welcome home.

— Carl Boon, Ambassador',
        '2026-02-03T00:00:00Z',
        1,
        'visible'
      )
    `);
  }
}

export function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

// Helper functions for database operations
export async function query(sql: string, params: any[] = []) {
  const database = getDatabase();
  
  if (isPostgres) {
    const pool = database as any;
    return await pool.query(sql, params);
  } else {
    const sqlite = database as Database.Database;
    return sqlite.prepare(sql).all(params);
  }
}

export async function queryOne(sql: string, params: any[] = []) {
  const database = getDatabase();
  
  if (isPostgres) {
    const pool = database as any;
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  } else {
    const sqlite = database as Database.Database;
    return sqlite.prepare(sql).get(params) || null;
  }
}

export async function execute(sql: string, params: any[] = []) {
  const database = getDatabase();
  
  if (isPostgres) {
    const pool = database as any;
    return await pool.query(sql, params);
  } else {
    const sqlite = database as Database.Database;
    return sqlite.prepare(sql).run(params);
  }
}
