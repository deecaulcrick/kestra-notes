-- Limitless notes app — SQLite schema
-- This is the source of truth for the database schema.
-- The Rust migration runner executes this on every open_vault call (idempotent).

CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,        -- nanoid, stable across renames
  file_path   TEXT UNIQUE NOT NULL,    -- relative to vault root
  title       TEXT,
  created_at  INTEGER,
  updated_at  INTEGER,
  file_hash   TEXT
);

CREATE TABLE IF NOT EXISTS backlinks (
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id)
);

CREATE TABLE IF NOT EXISTS outbound_links (
  source_id   TEXT NOT NULL,
  link_text   TEXT NOT NULL,           -- raw [[text]] as written
  resolved_id TEXT                     -- NULL if unresolved
);

CREATE TABLE IF NOT EXISTS canvas_positions (
  note_id       TEXT PRIMARY KEY,
  x             REAL,
  y             REAL,
  width         REAL DEFAULT 280,
  workspace_id  TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_index USING fts5(
  note_id UNINDEXED,
  title,
  body
);

CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  vault_path    TEXT,
  last_opened   INTEGER
);

CREATE TABLE IF NOT EXISTS attachments (
  id          TEXT PRIMARY KEY,        -- nanoid
  file_path   TEXT UNIQUE NOT NULL,    -- relative to vault root, e.g. "attachments/images/foo.png"
  file_name   TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  note_id     TEXT,                    -- note it was first attached to (informational only)
  created_at  INTEGER
);

CREATE TABLE IF NOT EXISTS sync_state (
  note_id       TEXT PRIMARY KEY,
  remote_hash   TEXT,
  last_synced   INTEGER,
  conflict      INTEGER DEFAULT 0
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notes_file_path ON notes(file_path);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_backlinks_target ON backlinks(target_id);
CREATE INDEX IF NOT EXISTS idx_outbound_source ON outbound_links(source_id);
CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id);
