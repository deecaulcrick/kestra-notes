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
    // Enable WAL mode for better concurrent read/write performance.
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    // Enforce foreign key constraints.
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    // Run the schema (all statements use IF NOT EXISTS — safe to re-run).
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(())
}
