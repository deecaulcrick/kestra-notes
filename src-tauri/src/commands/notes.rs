use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::State;

use crate::{db::DbPool, error::AppError, wikilinks, AppState};

// ── Shared types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct Note {
    pub id: String,
    pub file_path: String,
    pub title: String,
    pub preview: String,
    pub has_todos: bool,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
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
/// Two-pass approach:
///   Pass 1 — upsert every note row (title, preview, timestamps). All notes
///             exist in the DB by the end of this pass.
///   Pass 2 — index wikilinks, backlinks, tags. Because every target note is
///             already in the DB, resolve_title() can match them and backlink
///             rows are created correctly.
pub fn scan_and_index(vault_path: &std::path::Path, pool: &DbPool) -> Result<usize, AppError> {
    let notes_dir = vault_path.join("notes");
    if !notes_dir.exists() {
        return Ok(0);
    }

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    // Collect all (id, title, content, changed) tuples so we can do a second pass.
    struct NoteRecord {
        id: String,
        title: String,
        content: String,
    }
    let mut records: Vec<NoteRecord> = Vec::new();
    let mut count = 0;

    // ── Pass 0: purge bad notes ───────────────────────────────────────────────
    // a) Remove entries whose file no longer exists on disk.
    // b) Deduplicate: when multiple DB entries share the same title, keep the
    //    one whose file content actually has that title as a heading; delete the
    //    rest. This fixes ghost duplicates created by repeated wikilink clicks.
    {
        let mut stmt = conn.prepare("SELECT id, file_path, COALESCE(title,'') FROM notes")?;
        let all_notes: Vec<(String, String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut ids_to_delete: Vec<String> = Vec::new();

        // a) Missing files
        for (id, file_path, _) in &all_notes {
            if !vault_path.join(file_path).exists() {
                ids_to_delete.push(id.clone());
            }
        }

        // b) Duplicate titles — group by title, keep the best one
        use std::collections::HashMap;
        let mut by_title: HashMap<String, Vec<(String, String)>> = HashMap::new();
        for (id, file_path, title) in &all_notes {
            if title.is_empty() { continue; }
            by_title.entry(title.clone()).or_default().push((id.clone(), file_path.clone()));
        }
        for (_title, entries) in by_title {
            if entries.len() <= 1 { continue; }
            // Score each: prefer the one whose file actually starts with "# <title>"
            let mut best_id: Option<String> = None;
            for (id, file_path) in &entries {
                let abs = vault_path.join(file_path);
                if let Ok(content) = std::fs::read_to_string(&abs) {
                    let first_line = content.lines().next().unwrap_or("").trim();
                    let heading = format!("# {}", _title);
                    if first_line == heading {
                        best_id = Some(id.clone());
                        break;
                    }
                }
            }
            // If none match heading, keep the first (arbitrary but consistent)
            let keep = best_id.unwrap_or_else(|| entries[0].0.clone());
            for (id, _) in &entries {
                if *id != keep {
                    println!("[scan] dedup: removing ghost note id={} (duplicate title)", &id[..8.min(id.len())]);
                    ids_to_delete.push(id.clone());
                }
            }
        }

        for id in ids_to_delete {
            conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM outbound_links WHERE source_id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM backlinks WHERE source_id = ?1 OR target_id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM fts_index WHERE note_id = ?1", rusqlite::params![id])?;
            conn.execute("DELETE FROM note_tags WHERE note_id = ?1", rusqlite::params![id])?;
        }
    }

    // ── Pass 1: upsert note rows ───────────────────────────────────────────────
    for entry in std::fs::read_dir(&notes_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let meta = entry.metadata()?;
        let updated_at = meta
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0))
            .unwrap_or(0);

        let created_at = meta
            .created()
            .unwrap_or_else(|_| meta.modified().unwrap_or(std::time::UNIX_EPOCH))
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let file_hash = format!("{}-{}", updated_at, meta.len());
        let rel_path = format!("notes/{}", path.file_name().unwrap().to_string_lossy());

        let raw = std::fs::read_to_string(&path).unwrap_or_default();
        // tiptap-markdown escapes [ → \[ in saved files. Fix any such files in
        // place so wikilinks are stored as [[...]] and are parseable.
        let content = if raw.contains("\\[") {
            let fixed = raw.replace("\\[", "[").replace("\\]", "]");
            let _ = std::fs::write(&path, &fixed);
            println!("[scan] fixed escaped brackets in {}", rel_path);
            fixed
        } else {
            raw
        };
        println!("[scan] file={} content={:?}", rel_path, &content[..content.len().min(120)]);
        let fallback = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let title = extract_title(&content, &fallback);
        let preview = extract_preview(&content);
        let has_todos = content.contains("- [ ]") as i64;

        let existing: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT id, file_hash FROM notes WHERE file_path = ?1",
                rusqlite::params![rel_path],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let note_id = match existing {
            Some((id, existing_hash)) => {
                if existing_hash.as_deref() != Some(&file_hash) {
                    conn.execute(
                        "UPDATE notes SET title=?1, preview=?2, has_todos=?3, updated_at=?4, file_hash=?5 WHERE id=?6",
                        rusqlite::params![title, preview, has_todos, updated_at, file_hash, id],
                    )?;
                }
                id
            }
            None => {
                let id = nanoid::nanoid!();
                conn.execute(
                    "INSERT INTO notes (id, file_path, title, preview, has_todos, created_at, updated_at, file_hash)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![id, rel_path, title, preview, has_todos, created_at, updated_at, file_hash],
                )?;
                id
            }
        };

        records.push(NoteRecord { id: note_id, title, content });
        count += 1;
    }

    // ── Pass 2: index wikilinks, backlinks, FTS, tags ─────────────────────────
    // Always re-index ALL notes (not just changed ones). We already have every
    // note's content in memory from Pass 1, and re-indexing ensures that
    // cross-note backlinks are created correctly even when notes were first
    // indexed before their link targets existed in the DB.
    for rec in &records {
        let _ = wikilinks::index_note(&rec.id, &rec.title, &rec.content, &conn);
        index_tags(&rec.id, &rec.content, &conn);
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
    if fallback.is_empty() { "Untitled".to_string() } else { fallback.to_string() }
}

/// Extract a 1-line preview: first non-heading, non-empty body line.
pub(crate) fn extract_preview(content: &str) -> String {
    for line in content.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') || t.starts_with("---") || t.starts_with("```") {
            continue;
        }
        let cleaned = t
            .trim_start_matches("- [ ] ")
            .trim_start_matches("- [x] ")
            .trim_start_matches("- [X] ")
            .trim_start_matches("- ")
            .trim_start_matches("* ")
            .trim_start_matches("> ");
        if !cleaned.is_empty() {
            return cleaned.chars().take(140).collect();
        }
    }
    String::new()
}

/// Extract `#tag` and `#nested/tag` references from content (case-insensitive).
/// Returns deduplicated lowercase names, e.g. ["project", "project/work"].
pub(crate) fn extract_tags(content: &str) -> Vec<String> {
    let bytes = content.as_bytes();
    let mut tags: Vec<String> = Vec::new();
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'#' {
            let after = i + 1;
            // Must be followed by an ASCII letter (not space/# which would be a heading).
            if after < bytes.len() && bytes[after].is_ascii_alphabetic() {
                let start = after;
                let mut j = start;
                while j < bytes.len() {
                    let b = bytes[j];
                    if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'/' {
                        j += 1;
                    } else {
                        break;
                    }
                }
                if j > start {
                    let tag = content[start..j].to_lowercase();
                    if !tags.contains(&tag) {
                        tags.push(tag);
                    }
                }
                i = j;
                continue;
            }
        }
        i += 1;
    }
    tags
}

/// Upsert tags + note_tags for a note after content changes.
/// Also creates parent tags for nested tags (e.g. "project" for "project/work").
pub(crate) fn index_tags(note_id: &str, content: &str, conn: &rusqlite::Connection) {
    let tags = extract_tags(content);

    // Collect all tag names including implied parents.
    let mut all_names: Vec<String> = Vec::new();
    for tag in &tags {
        let parts: Vec<&str> = tag.split('/').collect();
        for i in 1..=parts.len() {
            let name = parts[..i].join("/");
            if !all_names.contains(&name) {
                all_names.push(name);
            }
        }
    }

    // Upsert each tag.
    for name in &all_names {
        let parent = if name.contains('/') {
            let idx = name.rfind('/').unwrap();
            Some(&name[..idx])
        } else {
            None
        };
        let id = nanoid::nanoid!();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO tags (id, name, parent_name) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, name, parent],
        );
    }

    // Re-sync note_tags.
    let _ = conn.execute("DELETE FROM note_tags WHERE note_id = ?1", rusqlite::params![note_id]);

    for name in &all_names {
        let tag_id: Option<String> = conn
            .query_row("SELECT id FROM tags WHERE name = ?1", rusqlite::params![name], |r| r.get(0))
            .optional()
            .unwrap_or(None);
        if let Some(tid) = tag_id {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![note_id, tid],
            );
        }
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
    if s.is_empty() { "Untitled".to_string() } else { s.to_string() }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_note(id: String, state: State<'_, AppState>) -> Result<NoteDetail, AppError> {
    let pool = { let g = state.db.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };
    let vault_path = { let g = state.vault_path.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let (file_path, title, updated_at): (String, String, i64) = conn.query_row(
        "SELECT file_path, COALESCE(title,'Untitled'), updated_at FROM notes WHERE id=?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let content = std::fs::read_to_string(vault_path.join(&file_path))?;
    Ok(NoteDetail { id, title, content, updated_at })
}

#[tauri::command]
pub async fn save_note(
    id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = { let g = state.db.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };
    let vault_path = { let g = state.vault_path.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let file_path: String = conn.query_row(
        "SELECT file_path FROM notes WHERE id=?1",
        rusqlite::params![id],
        |row| row.get(0),
    )?;

    std::fs::write(vault_path.join(&file_path), content.as_bytes())?;

    let now = now_secs();
    let file_hash = format!("{}-{}", now, content.len());
    let stem = std::path::Path::new(&file_path).file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".to_string());
    let title = extract_title(&content, &stem);
    let preview = extract_preview(&content);
    let has_todos = content.contains("- [ ]") as i64;

    conn.execute(
        "UPDATE notes SET title=?1, preview=?2, has_todos=?3, updated_at=?4, file_hash=?5 WHERE id=?6",
        rusqlite::params![title, preview, has_todos, now, file_hash, id],
    )?;

    let _ = wikilinks::index_note(&id, &title, &content, &conn);
    index_tags(&id, &content, &conn);

    Ok(())
}

#[tauri::command]
pub async fn create_note(title: String, state: State<'_, AppState>) -> Result<Note, AppError> {
    let pool = { let g = state.db.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };
    let vault_path = { let g = state.vault_path.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    // If a note with this exact title already exists, return it — don't duplicate.
    let existing: Option<(String, String)> = conn
        .query_row(
            "SELECT id, file_path FROM notes WHERE title = ?1 LIMIT 1",
            rusqlite::params![title],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    if let Some((id, file_path)) = existing {
        // Load its real values from the DB.
        let (preview, has_todos, created_at, updated_at): (String, i64, i64, i64) = conn
            .query_row(
                "SELECT COALESCE(preview,''), has_todos, created_at, updated_at FROM notes WHERE id=?1",
                rusqlite::params![id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap_or_else(|_| (String::new(), 0, 0, 0));
        return Ok(Note {
            id,
            file_path,
            title,
            preview,
            has_todos: has_todos != 0,
            pinned: false,
            created_at,
            updated_at,
            tags: vec![],
        });
    }

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

    conn.execute(
        "INSERT INTO notes (id, file_path, title, preview, has_todos, created_at, updated_at, file_hash)
         VALUES (?1, ?2, ?3, '', 0, ?4, ?5, ?6)",
        rusqlite::params![id, file_path_rel, title, now, now, file_hash],
    )?;

    Ok(Note {
        id,
        file_path: file_path_rel,
        title,
        preview: String::new(),
        has_todos: false,
        pinned: false,
        created_at: now,
        updated_at: now,
        tags: vec![],
    })
}

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

/// List all notes, newest first, with tags included.
#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>) -> Result<Vec<Note>, AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn.prepare(
        "SELECT id, file_path, COALESCE(title,'Untitled'), COALESCE(preview,''), has_todos,
                COALESCE(pinned,0), created_at, updated_at
         FROM notes
         ORDER BY pinned DESC, updated_at DESC",
    )?;

    let mut notes: Vec<Note> = stmt
        .query_map([], |row| {
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

    // Batch-load tags for all notes in one query.
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

#[tauri::command]
pub async fn pin_note(id: String, pinned: bool, state: State<'_, AppState>) -> Result<(), AppError> {
    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute(
        "UPDATE notes SET pinned = ?1 WHERE id = ?2",
        rusqlite::params![pinned as i64, id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn delete_note(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let pool = { let g = state.db.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };
    let vault_path = { let g = state.vault_path.lock().unwrap(); g.as_ref().ok_or(AppError::VaultNotOpen)?.clone() };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let file_path: Option<String> = conn
        .query_row("SELECT file_path FROM notes WHERE id = ?1", rusqlite::params![id], |r| r.get(0))
        .optional()?;

    if let Some(fp) = file_path {
        let abs = vault_path.join(&fp);
        if abs.exists() {
            std::fs::remove_file(&abs)?;
        }
    }

    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])?;
    conn.execute("DELETE FROM outbound_links WHERE source_id = ?1", rusqlite::params![id])?;
    conn.execute("DELETE FROM backlinks WHERE source_id = ?1 OR target_id = ?1", rusqlite::params![id])?;
    conn.execute("DELETE FROM fts_index WHERE note_id = ?1", rusqlite::params![id])?;
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", rusqlite::params![id])?;

    Ok(())
}
