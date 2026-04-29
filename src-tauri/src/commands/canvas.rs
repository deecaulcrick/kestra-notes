use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::State;

use crate::{error::AppError, AppState};

#[derive(Debug, Serialize)]
pub struct CanvasBoard {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct CanvasPosition {
    pub note_id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub z_index: i64,
}

#[derive(Debug, Serialize)]
pub struct CanvasBoardState {
    pub board_id: String,
    pub camera_x: f64,
    pub camera_y: f64,
    pub camera_scale: f64,
    pub positions: Vec<CanvasPosition>,
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn current_workspace_id(
    conn: &rusqlite::Connection,
    vault_path: &std::path::Path,
) -> Result<String, AppError> {
    conn.query_row(
        "SELECT id FROM workspaces WHERE vault_path = ?1 LIMIT 1",
        rusqlite::params![vault_path.to_string_lossy().to_string()],
        |row| row.get(0),
    )
    .optional()?
    .ok_or(AppError::VaultNotOpen)
}

fn ensure_workspace_boards(
    conn: &rusqlite::Connection,
    workspace_id: &str,
) -> Result<String, AppError> {
    let default_board_id = "main".to_string();
    let now = now_unix();

    conn.execute(
        "INSERT OR IGNORE INTO canvas_boards (id, workspace_id, name, created_at, updated_at)
         VALUES ('main', ?1, 'Main', ?2, ?2)",
        rusqlite::params![workspace_id, now],
    )?;
    conn.execute(
        "UPDATE canvas_boards
         SET workspace_id = ?1, name = 'Main'
         WHERE id = 'main'",
        rusqlite::params![workspace_id],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO canvas_board_views (board_id, camera_x, camera_y, camera_scale)
         VALUES (?1, 120, 80, 1)",
        rusqlite::params![default_board_id],
    )?;

    let has_board_items: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM canvas_board_items items
         INNER JOIN canvas_boards boards ON boards.id = items.board_id
         WHERE boards.workspace_id = ?1",
        rusqlite::params![workspace_id],
        |row| row.get(0),
    )?;

    if has_board_items > 0 {
        return Ok(default_board_id);
    }

    let mut stmt = conn.prepare(
        "SELECT note_id, COALESCE(x, 0), COALESCE(y, 0), COALESCE(width, 280), COALESCE(z_index, 0)
         FROM canvas_positions",
    )?;

    let legacy_items = stmt
        .query_map([], |row| {
            Ok(CanvasPosition {
                note_id: row.get(0)?,
                x: row.get(1)?,
                y: row.get(2)?,
                width: row.get(3)?,
                z_index: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    for item in legacy_items {
        conn.execute(
            "INSERT OR IGNORE INTO canvas_board_items (board_id, note_id, x, y, width, z_index)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                default_board_id,
                item.note_id,
                item.x,
                item.y,
                item.width,
                item.z_index
            ],
        )?;
    }

    Ok(default_board_id)
}

#[tauri::command]
pub async fn list_canvas_boards(state: State<'_, AppState>) -> Result<Vec<CanvasBoard>, AppError> {
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let workspace_id = current_workspace_id(&conn, &vault_path)?;
    ensure_workspace_boards(&conn, &workspace_id)?;

    let mut stmt = conn.prepare(
        "SELECT id, name
         FROM canvas_boards
         WHERE workspace_id = ?1
         ORDER BY updated_at DESC, created_at DESC, id DESC",
    )?;

    let boards = stmt
        .query_map(rusqlite::params![workspace_id], |row| {
            Ok(CanvasBoard {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(boards)
}

#[tauri::command]
pub async fn create_canvas_board(
    name: String,
    state: State<'_, AppState>,
) -> Result<CanvasBoard, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Other("Board name cannot be empty".to_string()));
    }

    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let workspace_id = current_workspace_id(&conn, &vault_path)?;
    ensure_workspace_boards(&conn, &workspace_id)?;

    let base_name = trimmed.to_string();
    let mut candidate = base_name.clone();
    let mut suffix = 2;

    while conn
        .query_row(
            "SELECT 1 FROM canvas_boards WHERE workspace_id = ?1 AND lower(name) = lower(?2) LIMIT 1",
            rusqlite::params![workspace_id, candidate],
            |_| Ok(()),
        )
        .optional()?
        .is_some()
    {
        candidate = format!("{base_name} {suffix}");
        suffix += 1;
    }

    let board_id = nanoid::nanoid!();
    let now = now_unix();
    conn.execute(
        "INSERT INTO canvas_boards (id, workspace_id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![board_id, workspace_id, candidate, now],
    )?;
    conn.execute(
        "INSERT INTO canvas_board_views (board_id, camera_x, camera_y, camera_scale)
         VALUES (?1, 120, 80, 1)",
        rusqlite::params![board_id],
    )?;

    Ok(CanvasBoard {
        id: board_id,
        name: candidate,
    })
}

#[tauri::command]
pub async fn get_canvas_board_state(
    board_id: String,
    state: State<'_, AppState>,
) -> Result<CanvasBoardState, AppError> {
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let workspace_id = current_workspace_id(&conn, &vault_path)?;
    let default_board_id = ensure_workspace_boards(&conn, &workspace_id)?;
    let active_board_id = if board_id.is_empty() { default_board_id } else { board_id };

    let mut stmt = conn.prepare(
        "SELECT note_id, COALESCE(x, 0), COALESCE(y, 0), COALESCE(width, 280), COALESCE(z_index, 0)
         FROM canvas_board_items
         WHERE board_id = ?1",
    )?;

    let positions = stmt
        .query_map(rusqlite::params![active_board_id.clone()], |row| {
            Ok(CanvasPosition {
                note_id: row.get(0)?,
                x: row.get(1)?,
                y: row.get(2)?,
                width: row.get(3)?,
                z_index: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let (camera_x, camera_y, camera_scale) = conn
        .query_row(
            "SELECT COALESCE(camera_x, 120), COALESCE(camera_y, 80), COALESCE(camera_scale, 1)
             FROM canvas_board_views
             WHERE board_id = ?1",
            rusqlite::params![active_board_id.clone()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .unwrap_or((120.0, 80.0, 1.0));

    Ok(CanvasBoardState {
        board_id: active_board_id,
        camera_x,
        camera_y,
        camera_scale,
        positions,
    })
}

#[tauri::command]
pub async fn save_canvas_position(
    board_id: String,
    note_id: String,
    x: f64,
    y: f64,
    width: f64,
    z_index: i64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let workspace_id = current_workspace_id(&conn, &vault_path)?;
    ensure_workspace_boards(&conn, &workspace_id)?;
    let now = now_unix();

    conn.execute(
        "INSERT INTO canvas_board_items (board_id, note_id, x, y, width, z_index)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(board_id, note_id) DO UPDATE SET
           x = excluded.x,
           y = excluded.y,
           width = excluded.width,
           z_index = excluded.z_index",
        rusqlite::params![board_id, note_id, x, y, width, z_index],
    )?;

    conn.execute(
        "UPDATE canvas_boards SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, board_id],
    )?;

    Ok(())
}

#[tauri::command]
pub async fn save_canvas_camera(
    board_id: String,
    x: f64,
    y: f64,
    scale: f64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let workspace_id = current_workspace_id(&conn, &vault_path)?;
    ensure_workspace_boards(&conn, &workspace_id)?;
    let now = now_unix();

    conn.execute(
        "INSERT INTO canvas_board_views (board_id, camera_x, camera_y, camera_scale)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(board_id) DO UPDATE SET
           camera_x = excluded.camera_x,
           camera_y = excluded.camera_y,
           camera_scale = excluded.camera_scale",
        rusqlite::params![board_id, x, y, scale],
    )?;
    conn.execute(
        "UPDATE canvas_boards SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, board_id],
    )?;

    Ok(())
}
