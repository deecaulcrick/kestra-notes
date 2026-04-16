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

    // DEBUG
    {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM backlinks", [], |r| r.get(0)).unwrap_or(0);
        let ol_count: i64 = conn.query_row("SELECT COUNT(*) FROM outbound_links", [], |r| r.get(0)).unwrap_or(0);
        println!("[get_backlinks] called for id={}", &id[..8.min(id.len())]);
        println!("[get_backlinks] backlinks table has {} rows, outbound_links has {} rows", count, ol_count);
        let mut s = conn.prepare("SELECT source_id, link_text, resolved_id FROM outbound_links").unwrap();
        let rows: Vec<(String,String,Option<String>)> = s.query_map([], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap().filter_map(|r|r.ok()).collect();
        for (src, lt, rid) in &rows {
            println!("  outbound: {} [[{}]] -> {:?}", &src[..8.min(src.len())], lt, rid.as_deref().map(|s| &s[..8.min(s.len())]));
        }
    }

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

    println!("[get_backlinks] returning {} notes for target={}", notes.len(), &id[..8.min(id.len())]);
    for n in &notes { println!("  <- '{}' ({})", n.title, &n.id[..8.min(n.id.len())]); }

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
