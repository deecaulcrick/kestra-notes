use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::State;

use crate::{db::DbPool, error::AppError, wikilinks, AppState};

// ── Shared types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct Note {
    pub id: String,
    pub file_path: String, // relative to vault root, e.g. "notes/my-note.md"
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct NoteDetail {
    pub id: String,
    pub title: String,
    pub content: String,
    pub updated_at: i64,
}

// ── Vault scanning ────────────────────────────────────────────────────────────

/// Scan `{vault}/notes/` for `.md` files and upsert them into the notes table.
///
/// - New files get a fresh nanoid.
/// - Existing files are only re-read when their mtime+size hash changes.
/// Returns the number of files found.
pub fn scan_and_index(vault_path: &std::path::Path, pool: &DbPool) -> Result<usize, AppError> {
    let notes_dir = vault_path.join("notes");
    if !notes_dir.exists() {
        return Ok(0);
    }

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let mut count = 0;

    for entry in std::fs::read_dir(&notes_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let meta = entry.metadata()?;
        let updated_at = meta
            .modified()
            .map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0)
            })
            .unwrap_or(0);

        // created_at falls back to mtime on platforms without birthtime (Linux).
        let created_at = meta
            .created()
            .unwrap_or_else(|_| meta.modified().unwrap_or(std::time::UNIX_EPOCH))
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let file_hash = format!("{}-{}", updated_at, meta.len());

        let rel_path = format!("notes/{}", path.file_name().unwrap().to_string_lossy());

        let existing: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT id, file_hash FROM notes WHERE file_path = ?1",
                rusqlite::params![rel_path],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        match existing {
            Some((id, existing_hash)) => {
                if existing_hash.as_deref() != Some(&file_hash) {
                    let content = std::fs::read_to_string(&path).unwrap_or_default();
                    let fallback = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_else(|| "Untitled".to_string());
                    let title = extract_title(&content, &fallback);
                    conn.execute(
                        "UPDATE notes SET title=?1, updated_at=?2, file_hash=?3 WHERE id=?4",
                        rusqlite::params![title, updated_at, file_hash, id],
                    )?;
                    let _ = wikilinks::index_note(&id, &title, &content, &conn);
                }
            }
            None => {
                let content = std::fs::read_to_string(&path).unwrap_or_default();
                let fallback = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "Untitled".to_string());
                let title = extract_title(&content, &fallback);
                let id = nanoid::nanoid!();
                conn.execute(
                    "INSERT INTO notes (id, file_path, title, created_at, updated_at, file_hash)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![id, rel_path, title, created_at, updated_at, file_hash],
                )?;
                let _ = wikilinks::index_note(&id, &title, &content, &conn);
            }
        }

        count += 1;
    }

    Ok(count)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Extract a title from note content: first `# Heading` in the first 10 lines,
/// or `fallback` (usually the filename stem).
pub(crate) fn extract_title(content: &str, fallback: &str) -> String {
    for line in content.lines().take(10) {
        if let Some(heading) = line.strip_prefix("# ") {
            let t = heading.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    if fallback.is_empty() {
        "Untitled".to_string()
    } else {
        fallback.to_string()
    }
}

fn sanitize_filename(title: &str) -> String {
    let s: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c => c,
        })
        .collect();
    let s = s.trim();
    if s.is_empty() {
        "Untitled".to_string()
    } else {
        s.to_string()
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Return the full content of a note by ID, reading the `.md` file from disk.
#[tauri::command]
pub async fn get_note(id: String, state: State<'_, AppState>) -> Result<NoteDetail, AppError> {
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let (file_path, title, updated_at): (String, String, i64) = conn.query_row(
        "SELECT file_path, COALESCE(title,'Untitled'), updated_at FROM notes WHERE id=?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let content = std::fs::read_to_string(vault_path.join(&file_path))?;

    Ok(NoteDetail {
        id,
        title,
        content,
        updated_at,
    })
}

/// Write updated markdown content to disk and refresh the DB metadata.
/// This is fire-and-forget from the frontend — called on the 300ms debounce.
#[tauri::command]
pub async fn save_note(
    id: String,
    content: String,
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

    let file_path: String = conn.query_row(
        "SELECT file_path FROM notes WHERE id=?1",
        rusqlite::params![id],
        |row| row.get(0),
    )?;

    // Write the file — this is the canonical source of truth.
    std::fs::write(vault_path.join(&file_path), content.as_bytes())?;

    let now = now_secs();
    let file_hash = format!("{}-{}", now, content.len());

    // Re-extract the title in case the user changed the H1.
    let stem = std::path::Path::new(&file_path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".to_string());
    let title = extract_title(&content, &stem);

    conn.execute(
        "UPDATE notes SET title=?1, updated_at=?2, file_hash=?3 WHERE id=?4",
        rusqlite::params![title, now, file_hash, id],
    )?;

    let _ = wikilinks::index_note(&id, &title, &content, &conn);

    Ok(())
}

/// Create a new note with the given title, write an empty `.md` file to disk,
/// and register it in the notes table.
#[tauri::command]
pub async fn create_note(title: String, state: State<'_, AppState>) -> Result<Note, AppError> {
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let notes_dir = vault_path.join("notes");
    let safe_name = sanitize_filename(&title);

    let mut filename = format!("{}.md", safe_name);
    let mut counter = 1u32;
    while notes_dir.join(&filename).exists() {
        filename = format!("{} {}.md", safe_name, counter);
        counter += 1;
    }

    let file_path_rel = format!("notes/{}", filename);
    let content = format!("# {}\n\n", title);
    std::fs::write(vault_path.join(&file_path_rel), &content)?;

    let id = nanoid::nanoid!();
    let now = now_secs();
    let file_hash = format!("{}-{}", now, content.len());

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute(
        "INSERT INTO notes (id, file_path, title, created_at, updated_at, file_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, file_path_rel, title, now, now, file_hash],
    )?;

    Ok(Note {
        id,
        file_path: file_path_rel,
        title,
        created_at: now,
        updated_at: now,
    })
}

/// Batch-resolve wikilink titles to note IDs.
/// Returns one entry per input title — `id` is `None` for ghost (unresolved) links.
#[derive(Debug, Serialize)]
pub struct WikiLinkResolution {
    pub title: String,
    pub id: Option<String>,
}

#[tauri::command]
pub async fn resolve_wikilinks(
    titles: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<WikiLinkResolution>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut results = Vec::with_capacity(titles.len());
    for title in titles {
        let id = wikilinks::resolve_title(&title, &conn)?;
        results.push(WikiLinkResolution { title, id });
    }
    Ok(results)
}

/// List all notes in the open vault, newest first.
#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>) -> Result<Vec<Note>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT id, file_path, COALESCE(title,'Untitled'), created_at, updated_at
         FROM notes
         ORDER BY updated_at DESC",
    )?;

    let notes = stmt
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}
