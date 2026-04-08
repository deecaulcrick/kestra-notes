use std::path::PathBuf;

use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::State;

use crate::{error::AppError, AppState};

#[derive(Debug, Serialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub vault_path: String,
    pub last_opened: i64,
}

/// Open (or create) a vault at the given path.
///
/// 1. Creates the vault directory structure if it doesn't exist.
/// 2. Initialises the SQLite DB at `{path}/.app/app.db` and runs migrations.
/// 3. Registers (or re-opens) the workspace in the `workspaces` table.
/// 4. Scans `{path}/notes/` and upserts discovered `.md` files into `notes`.
/// 5. Stores the pool and path in app state for subsequent commands.
#[tauri::command]
pub async fn open_vault(
    path: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<Workspace, AppError> {
    let vault_path = PathBuf::from(&path);

    // Create the standard vault directory structure.
    std::fs::create_dir_all(vault_path.join("notes"))?;
    std::fs::create_dir_all(vault_path.join("attachments/images"))?;
    std::fs::create_dir_all(vault_path.join("attachments/files"))?;

    // Initialise (or reopen) the DB and run migrations.
    let pool = crate::db::init_db(&vault_path)?;

    let name = vault_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "My Vault".to_string());

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Look up existing workspace by vault_path so we don't create duplicates.
    let workspace_id = {
        let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

        let existing_id: Option<String> = conn
            .query_row(
                "SELECT id FROM workspaces WHERE vault_path = ?1",
                rusqlite::params![path],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(id) = existing_id {
            conn.execute(
                "UPDATE workspaces SET last_opened = ?1 WHERE id = ?2",
                rusqlite::params![now, id],
            )?;
            id
        } else {
            let id = nanoid::nanoid!();
            conn.execute(
                "INSERT INTO workspaces (id, name, vault_path, last_opened)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, name, path, now],
            )?;
            id
        }
    };

    // Scan notes directory and upsert .md files into the notes table.
    crate::commands::notes::scan_and_index(&vault_path, &pool)?;

    // Start (or restart) the background file watcher.
    match crate::indexer::start_watcher(vault_path.clone(), pool.clone(), app_handle) {
        Ok(watcher) => *state.watcher.lock().unwrap() = Some(watcher),
        Err(e) => eprintln!("[open_vault] watcher failed to start: {e}"),
    }

    // Commit pool and path into shared state.
    *state.db.lock().unwrap() = Some(pool);
    *state.vault_path.lock().unwrap() = Some(vault_path);

    Ok(Workspace {
        id: workspace_id,
        name,
        vault_path: path,
        last_opened: now,
    })
}

/// Return all previously opened workspaces, newest first.
#[tauri::command]
pub async fn get_workspaces(state: State<'_, AppState>) -> Result<Vec<Workspace>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT id, name, vault_path, last_opened
         FROM workspaces
         ORDER BY last_opened DESC",
    )?;

    let workspaces = stmt
        .query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                vault_path: row.get(2)?,
                last_opened: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(workspaces)
}
