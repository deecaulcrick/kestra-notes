use serde::Serialize;
use tauri::State;

use crate::{error::AppError, AppState};

#[derive(Debug, Serialize)]
pub struct BacklinkNote {
    pub id: String,
    pub title: String,
    pub file_path: String,
}

#[derive(Debug, Serialize)]
pub struct OutboundLink {
    pub link_text: String,
    pub resolved_id: Option<String>,
    pub resolved_title: Option<String>,
}

/// Return all notes that contain a wikilink pointing to `id`.
#[tauri::command]
pub async fn get_backlinks(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<BacklinkNote>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT n.id, COALESCE(n.title, 'Untitled'), n.file_path
         FROM backlinks b
         JOIN notes n ON n.id = b.source_id
         WHERE b.target_id = ?1
         ORDER BY n.updated_at DESC",
    )?;

    let notes = stmt
        .query_map(rusqlite::params![id], |row| {
            Ok(BacklinkNote {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}

/// Return all wikilinks written in `id`, with resolved titles where available.
#[tauri::command]
pub async fn get_outbound_links(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<OutboundLink>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT ol.link_text, ol.resolved_id, n.title
         FROM outbound_links ol
         LEFT JOIN notes n ON n.id = ol.resolved_id
         WHERE ol.source_id = ?1
         ORDER BY rowid ASC",
    )?;

    let links = stmt
        .query_map(rusqlite::params![id], |row| {
            Ok(OutboundLink {
                link_text: row.get(0)?,
                resolved_id: row.get(1)?,
                resolved_title: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(links)
}
