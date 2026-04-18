use nanoid::nanoid;
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
    pub color: Option<String>,
    pub description: Option<String>,
}

/// Return all tags/categories with their note counts, alphabetical.
#[tauri::command]
pub async fn get_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.parent_name, COUNT(nt.note_id) as cnt, t.color, t.description
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
                color: row.get(4)?,
                description: row.get(5)?,
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

/// Create a new category (tag). Returns the created tag.
/// If a tag with this name already exists, returns it unchanged.
#[tauri::command]
pub async fn create_category(
    name: String,
    color: Option<String>,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<Tag, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let name = name.trim().to_lowercase();
    if name.is_empty() {
        return Err(AppError::Other("Category name cannot be empty".into()));
    }

    // Check if already exists.
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1",
            rusqlite::params![name],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        // Return existing.
        let tag = conn.query_row(
            "SELECT id, name, parent_name, 0 as cnt, color, description FROM tags WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_name: row.get(2)?,
                note_count: row.get(3)?,
                color: row.get(4)?,
                description: row.get(5)?,
            }),
        )?;
        return Ok(tag);
    }

    // Compute parent name for nested tags (e.g. "work/projects" → parent = "work").
    let parent_name: Option<String> = if let Some(pos) = name.rfind('/') {
        Some(name[..pos].to_string())
    } else {
        None
    };

    let id = nanoid!();
    conn.execute(
        "INSERT INTO tags (id, name, parent_name, color, description) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, parent_name, color, description],
    )?;

    Ok(Tag {
        id,
        name,
        parent_name,
        note_count: 0,
        color,
        description,
    })
}

/// Update a category's name, color, and/or description.
#[tauri::command]
pub async fn update_category(
    old_name: String,
    new_name: String,
    color: Option<String>,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let new_name = new_name.trim().to_lowercase();
    let new_parent: Option<String> = if let Some(pos) = new_name.rfind('/') {
        Some(new_name[..pos].to_string())
    } else {
        None
    };

    conn.execute(
        "UPDATE tags SET name = ?1, parent_name = ?2, color = ?3, description = ?4 WHERE name = ?5",
        rusqlite::params![new_name, new_parent, color, description, old_name],
    )?;

    Ok(())
}

/// Delete a category and remove it from all notes.
#[tauri::command]
pub async fn delete_category(
    name: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    // Delete note_tags entries for this tag first.
    conn.execute(
        "DELETE FROM note_tags WHERE tag_id IN (SELECT id FROM tags WHERE name = ?1)",
        rusqlite::params![name],
    )?;

    conn.execute("DELETE FROM tags WHERE name = ?1", rusqlite::params![name])?;

    Ok(())
}

/// Add a note to a category. Creates the category if it doesn't exist.
#[tauri::command]
pub async fn add_note_to_category(
    note_id: String,
    category_name: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let name = category_name.trim().to_lowercase();

    // Ensure the tag exists.
    let tag_id: Option<String> = conn
        .query_row("SELECT id FROM tags WHERE name = ?1", rusqlite::params![name], |row| row.get(0))
        .ok();

    let tag_id = if let Some(id) = tag_id {
        id
    } else {
        let id = nanoid!();
        let parent_name: Option<String> = if let Some(pos) = name.rfind('/') {
            Some(name[..pos].to_string())
        } else {
            None
        };
        conn.execute(
            "INSERT INTO tags (id, name, parent_name) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, name, parent_name],
        )?;
        id
    };

    // Insert into note_tags (ignore if already exists).
    conn.execute(
        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
        rusqlite::params![note_id, tag_id],
    )?;

    Ok(())
}

/// Remove a note from a category.
#[tauri::command]
pub async fn remove_note_from_category(
    note_id: String,
    category_name: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    conn.execute(
        "DELETE FROM note_tags WHERE note_id = ?1 AND tag_id IN (SELECT id FROM tags WHERE name = ?2)",
        rusqlite::params![note_id, category_name],
    )?;

    Ok(())
}

/// Delete ALL categories (and their note associations). Used for data reset.
#[tauri::command]
pub async fn delete_all_categories(state: State<'_, AppState>) -> Result<(), AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    conn.execute_batch("DELETE FROM note_tags; DELETE FROM tags;")?;

    Ok(())
}
