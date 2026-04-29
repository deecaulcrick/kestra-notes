use nanoid::nanoid;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::Path;

use crate::error::AppError;

pub type DbPool = Pool<SqliteConnectionManager>;

// Schema SQL is embedded at compile time so the binary is self-contained.
// Path is relative to this source file: src-tauri/src/db.rs → ../../docs/db-schema.sql
const SCHEMA_SQL: &str = include_str!("../../docs/db-schema.sql");

/// Create or open the SQLite database at `{vault_path}/.app/app.db`,
/// run migrations, and return a connection pool.
pub fn init_db(vault_path: &Path) -> Result<DbPool, AppError> {
    let app_dir = vault_path.join(".app");
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("app.db");
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = Pool::new(manager).map_err(|e| AppError::Database(e.to_string()))?;

    {
        let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
        run_migrations(&conn)?;
    }

    Ok(pool)
}

fn run_migrations(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    // Create any missing tables (all use IF NOT EXISTS — safe to re-run).
    conn.execute_batch(SCHEMA_SQL)?;
    // Additive column migrations — check first since SQLite doesn't support IF NOT EXISTS on columns.
    add_column_if_missing(conn, "notes", "preview",     "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "notes", "has_todos",   "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "notes", "pinned",      "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "notes", "file_naming_mode", "TEXT DEFAULT 'untitled'")?;
    add_column_if_missing(conn, "notes", "derived_rename_started_at", "INTEGER")?;
    add_column_if_missing(conn, "canvas_positions", "z_index", "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "tags",  "color",       "TEXT")?;
    add_column_if_missing(conn, "tags",  "description", "TEXT")?;
    normalize_note_paths(conn)?;

    // Versioned migrations tracked via PRAGMA user_version.
    let user_version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);

    if user_version < 1 {
        // v1: Reset all categories and seed the single default "Uncategorized".
        conn.execute_batch("DELETE FROM note_tags; DELETE FROM tags;")?;
        let id = nanoid::nanoid!();
        conn.execute(
            "INSERT INTO tags (id, name, parent_name, color) VALUES (?1, 'uncategorized', NULL, NULL)",
            rusqlite::params![id],
        )?;
        conn.execute_batch("PRAGMA user_version = 1;")?;
    }

    Ok(())
}

fn normalize_note_paths(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare("SELECT id, file_path, COALESCE(updated_at, 0) FROM notes")?;
    let rows: Vec<(String, String, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;

    use std::collections::HashMap;

    let mut by_normalized_path: HashMap<String, Vec<(String, String, i64)>> = HashMap::new();
    for (id, file_path, updated_at) in rows {
        let normalized = file_path.replace('\\', "/");
        by_normalized_path
            .entry(normalized)
            .or_default()
            .push((id, file_path, updated_at));
    }

    for (normalized_path, mut entries) in by_normalized_path {
        entries.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.0.cmp(&b.0)));

        let keep_id = entries[0].0.clone();
        let keep_path = entries[0].1.clone();

        if keep_path != normalized_path {
            conn.execute(
                "UPDATE notes SET file_path = ?1 WHERE id = ?2",
                rusqlite::params![normalized_path, keep_id],
            )?;
        }

        for (id, _, _) in entries.iter().skip(1) {
            conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM outbound_links WHERE source_id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM backlinks WHERE source_id = ?1 OR target_id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM fts_index WHERE note_id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM note_tags WHERE note_id = ?1", rusqlite::params![id])?;
        }
    }

    Ok(())
}

/// Add a column to a table if it doesn't already exist.
/// SQLite doesn't support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so we
/// inspect `PRAGMA table_info` first.
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), AppError> {
    let exists: bool = {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let cols: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<_, _>>()?;
        cols.iter().any(|c| c == column)
    };
    if !exists {
        conn.execute_batch(&format!(
            "ALTER TABLE {table} ADD COLUMN {column} {definition};"
        ))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_note_paths;
    use rusqlite::Connection;

    #[test]
    fn normalize_note_paths_merges_mixed_separator_duplicates() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE notes (
              id TEXT PRIMARY KEY,
              file_path TEXT UNIQUE NOT NULL,
              title TEXT,
              preview TEXT,
              has_todos INTEGER DEFAULT 0,
              created_at INTEGER,
              updated_at INTEGER,
              file_hash TEXT
            );
            CREATE TABLE outbound_links (source_id TEXT NOT NULL, link_text TEXT NOT NULL, resolved_id TEXT);
            CREATE TABLE backlinks (source_id TEXT NOT NULL, target_id TEXT NOT NULL, PRIMARY KEY (source_id, target_id));
            CREATE VIRTUAL TABLE fts_index USING fts5(note_id UNINDEXED, title, body);
            CREATE TABLE note_tags (note_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (note_id, tag_id));
            ",
        )
        .unwrap();

        conn.execute(
            "INSERT INTO notes (id, file_path, updated_at) VALUES (?1, ?2, ?3)",
            rusqlite::params!["old", r"notes\Untitled.md", 1_i64],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (id, file_path, updated_at) VALUES (?1, ?2, ?3)",
            rusqlite::params!["new", "notes/Untitled.md", 2_i64],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO outbound_links (source_id, link_text, resolved_id) VALUES (?1, ?2, NULL)",
            rusqlite::params!["old", "Untitled"],
        )
        .unwrap();

        normalize_note_paths(&conn).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0)).unwrap();
        let remaining_id: String = conn
            .query_row("SELECT id FROM notes WHERE file_path = 'notes/Untitled.md'", [], |row| row.get(0))
            .unwrap();
        let dangling_links: i64 = conn
            .query_row("SELECT COUNT(*) FROM outbound_links WHERE source_id = 'old'", [], |row| row.get(0))
            .unwrap();

        assert_eq!(count, 1);
        assert_eq!(remaining_id, "new");
        assert_eq!(dangling_links, 0);
    }
}
