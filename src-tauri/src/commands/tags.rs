use serde::Serialize;
use tauri::State;

use crate::{error::AppError, AppState};
use crate::commands::notes::Note;

#[derive(Debug, Serialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub parent_name: Option<String>,
    pub note_count: i64,
}

/// Return all tags with their note counts, alphabetical.
#[tauri::command]
pub async fn get_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.parent_name, COUNT(nt.note_id) as cnt
         FROM tags t
         LEFT JOIN note_tags nt ON nt.tag_id = t.id
         GROUP BY t.id
         ORDER BY t.name ASC",
    )?;

    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_name: row.get(2)?,
                note_count: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tags)
}

/// Return all notes that have the given tag (exact name match).
#[tauri::command]
pub async fn get_notes_by_tag(
    tag_name: String,
    state: State<'_, AppState>,
) -> Result<Vec<Note>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT n.id, n.file_path, COALESCE(n.title,'Untitled'), COALESCE(n.preview,''),
                n.has_todos, COALESCE(n.pinned,0), n.created_at, n.updated_at
         FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         JOIN tags t ON t.id = nt.tag_id
         WHERE t.name = ?1
         ORDER BY n.updated_at DESC",
    )?;

    let mut notes: Vec<Note> = stmt
        .query_map(rusqlite::params![tag_name], |row| {
            Ok(Note {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                preview: row.get(3)?,
                has_todos: row.get::<_, i64>(4)? != 0,
                pinned: row.get::<_, i64>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                tags: vec![],
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Attach tags to each note.
    if !notes.is_empty() {
        let mut tag_stmt = conn.prepare(
            "SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id",
        )?;
        let pairs: Vec<(String, String)> = tag_stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        for note in &mut notes {
            note.tags = pairs.iter()
                .filter(|(nid, _)| nid == &note.id)
                .map(|(_, t)| t.clone())
                .collect();
        }
    }

    Ok(notes)
}
