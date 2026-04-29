-- Limitless notes app — SQLite schema
-- This is the source of truth for the database schema.
-- The Rust migration runner executes this on every open_vault call (idempotent).

CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,        -- nanoid, stable across renames
  file_path   TEXT UNIQUE NOT NULL,    -- relative to vault root
  title       TEXT,
  preview     TEXT,                    -- first non-heading line for note list display
  has_todos   INTEGER DEFAULT 0,       -- 1 if note contains unchecked task items
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
  z_index       INTEGER DEFAULT 0,
  workspace_id  TEXT
);

CREATE TABLE IF NOT EXISTS canvas_boards (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    INTEGER,
  updated_at    INTEGER
);

CREATE TABLE IF NOT EXISTS canvas_board_items (
  board_id      TEXT NOT NULL,
  note_id       TEXT NOT NULL,
  x             REAL,
  y             REAL,
  width         REAL DEFAULT 280,
  z_index       INTEGER DEFAULT 0,
  PRIMARY KEY (board_id, note_id)
);

CREATE TABLE IF NOT EXISTS canvas_board_views (
  board_id      TEXT PRIMARY KEY,
  camera_x      REAL DEFAULT 120,
  camera_y      REAL DEFAULT 80,
  camera_scale  REAL DEFAULT 1
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

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,   -- full tag, e.g. "project/work"
  parent_name TEXT                    -- "project" for "project/work", NULL for roots
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id     TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_notes_file_path ON notes(file_path);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_backlinks_target ON backlinks(target_id);
CREATE INDEX IF NOT EXISTS idx_outbound_source ON outbound_links(source_id);
CREATE INDEX IF NOT EXISTS idx_canvas_boards_workspace ON canvas_boards(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canvas_board_items_board ON canvas_board_items(board_id);
CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_name);
