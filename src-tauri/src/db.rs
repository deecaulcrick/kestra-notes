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
    // Additive column migrations — SQLite ignores these if the column already exists
    // would error, so we check first and add only when missing.
    add_column_if_missing(conn, "notes", "preview",   "TEXT DEFAULT ''")?;
    add_column_if_missing(conn, "notes", "has_todos", "INTEGER DEFAULT 0")?;
    add_column_if_missing(conn, "notes", "pinned",    "INTEGER DEFAULT 0")?;
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
