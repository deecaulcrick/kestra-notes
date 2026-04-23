use rusqlite::OptionalExtension;
use serde::Serialize;
use tauri::State;

use crate::{db::DbPool, error::AppError, wikilinks, AppState};

const DERIVED_FILENAME_SETTLE_SECS: i64 = 8;

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
    // Remove entries whose file no longer exists on disk. Note titles are not
    // unique identifiers; multiple notes may legitimately share the same title.
    {
        let mut stmt = conn.prepare("SELECT id, file_path FROM notes")?;
        let all_notes: Vec<(String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;

        let mut ids_to_delete: Vec<String> = Vec::new();

        for (id, file_path) in &all_notes {
            if !vault_path.join(file_path).exists() {
                ids_to_delete.push(id.clone());
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

/// Extract a multi-line preview: collect up to 3 non-heading body lines,
/// join them with a space, and cap the total at 300 characters.
pub(crate) fn extract_preview(content: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut in_code_block = false;

    for line in content.lines() {
        let t = line.trim();

        // Toggle code block tracking — skip content inside fences.
        if t.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if in_code_block { continue; }

        // Skip frontmatter separators, headings, and blank lines.
        if t.is_empty() || t.starts_with('#') || t.starts_with("---") { continue; }

        // Strip common markdown prefixes so the preview reads as plain text.
        let cleaned = t
            .trim_start_matches("- [ ] ")
            .trim_start_matches("- [x] ")
            .trim_start_matches("- [X] ")
            .trim_start_matches("- ")
            .trim_start_matches("* ")
            .trim_start_matches("> ")
            .trim();

        if cleaned.is_empty() { continue; }

        lines.push(cleaned.to_string());
        if lines.len() == 3 { break; }
    }

    let preview = lines.join(" ");
    // Cap total length so very long lines don't bloat the DB.
    preview.chars().take(300).collect()
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

    // Remove tags that are no longer referenced by any note.
    // This prevents partial tags (#t, #ta, #tas) from accumulating
    // when the user finishes typing a full tag name like #tasks.
    let _ = conn.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)",
        [],
    );
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

fn sanitize_derived_filename(title: &str) -> String {
    let s: String = title
        .chars()
        .filter_map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => None,
            c if c.is_control() => None,
            c if c.is_whitespace() => Some(' '),
            c => Some(c),
        })
        .collect();
    let s = s
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|c| c == ' ' || c == '.')
        .chars()
        .take(120)
        .collect::<String>();
    let s = s.trim_matches(|c| c == ' ' || c == '.');
    let s = if s.is_empty() { "Untitled" } else { s };

    if is_windows_reserved_filename(s) {
        format!("{} note", s)
    } else {
        s.to_string()
    }
}

fn is_windows_reserved_filename(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    matches!(
        upper.as_str(),
        "CON" | "PRN" | "AUX" | "NUL"
            | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9"
            | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9"
    )
}

fn is_generated_untitled_filename(file_path: &str) -> bool {
    let Some(stem) = std::path::Path::new(file_path).file_stem().and_then(|s| s.to_str()) else {
        return false;
    };

    if stem == "Untitled" {
        return true;
    }

    let Some(suffix) = stem.strip_prefix("Untitled ") else {
        return false;
    };

    !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit())
}

fn filename_exists_case_insensitive(dir: &std::path::Path, filename: &str) -> bool {
    let target = filename.to_ascii_lowercase();
    std::fs::read_dir(dir)
        .map(|entries| {
            entries.flatten().any(|entry| {
                entry.file_name().to_string_lossy().to_ascii_lowercase() == target
            })
        })
        .unwrap_or(false)
}

fn unique_markdown_filename(dir: &std::path::Path, base_name: &str, current_filename: Option<&str>) -> String {
    let mut filename = format!("{}.md", base_name);
    let mut counter = 2u32;

    while filename_exists_case_insensitive(dir, &filename) {
        if current_filename.is_some_and(|current| current.eq_ignore_ascii_case(&filename)) {
            return filename;
        }

        filename = format!("{} {}.md", base_name, counter);
        counter += 1;
    }

    filename
}

fn maybe_rename_auto_named_note(
    vault_path: &std::path::Path,
    file_path: &str,
    title: &str,
    naming_mode: &str,
    derived_rename_started_at: Option<i64>,
    now: i64,
) -> (String, String, Option<i64>) {
    let is_settling = naming_mode == "settling"
        && derived_rename_started_at
            .map(|started| now - started <= DERIVED_FILENAME_SETTLE_SECS)
            .unwrap_or(false);

    if title.trim().is_empty() {
        return (file_path.to_string(), naming_mode.to_string(), derived_rename_started_at);
    }

    if !is_generated_untitled_filename(file_path) && !is_settling {
        let mode = if naming_mode == "settling" { "locked" } else { naming_mode };
        return (file_path.to_string(), mode.to_string(), derived_rename_started_at);
    }

    let notes_dir = vault_path.join("notes");
    let base_name = sanitize_derived_filename(title);

    if base_name == "Untitled" || base_name.starts_with("Untitled ") {
        return (file_path.to_string(), naming_mode.to_string(), derived_rename_started_at);
    }

    let current_filename = std::path::Path::new(file_path)
        .file_name()
        .and_then(|s| s.to_str());
    let filename = unique_markdown_filename(&notes_dir, &base_name, current_filename);
    let new_file_path = format!("notes/{}", filename);

    let started_at = derived_rename_started_at.unwrap_or(now);
    let next_mode = if now - started_at <= DERIVED_FILENAME_SETTLE_SECS {
        "settling"
    } else {
        "locked"
    };

    if new_file_path == file_path {
        return (file_path.to_string(), next_mode.to_string(), Some(started_at));
    }

    let old_abs = vault_path.join(file_path);
    let new_abs = vault_path.join(&new_file_path);

    match std::fs::rename(&old_abs, &new_abs) {
        Ok(()) => (new_file_path, next_mode.to_string(), Some(started_at)),
        Err(err) => {
            eprintln!(
                "[save_note] failed to rename generated note file from {:?} to {:?}: {}",
                old_abs, new_abs, err
            );
            (file_path.to_string(), naming_mode.to_string(), derived_rename_started_at)
        }
    }
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

    let (mut file_path, mut file_naming_mode, mut derived_rename_started_at): (String, String, Option<i64>) = conn.query_row(
        "SELECT file_path, COALESCE(file_naming_mode, 'untitled'), derived_rename_started_at FROM notes WHERE id=?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
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
    (file_path, file_naming_mode, derived_rename_started_at) = maybe_rename_auto_named_note(
        &vault_path,
        &file_path,
        &title,
        &file_naming_mode,
        derived_rename_started_at,
        now,
    );

    conn.execute(
        "UPDATE notes SET title=?1, preview=?2, has_todos=?3, updated_at=?4, file_hash=?5, file_path=?6, file_naming_mode=?7, derived_rename_started_at=?8 WHERE id=?9",
        rusqlite::params![title, preview, has_todos, now, file_hash, file_path, file_naming_mode, derived_rename_started_at, id],
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

#[cfg(test)]
mod tests {
    use super::{
        is_generated_untitled_filename, maybe_rename_auto_named_note, sanitize_derived_filename,
        scan_and_index, unique_markdown_filename, DERIVED_FILENAME_SETTLE_SECS,
    };
    use crate::db::DbPool;
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;

    fn unique_test_vault(prefix: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "{}-{}",
            prefix,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn test_pool() -> DbPool {
        let manager = SqliteConnectionManager::memory();
        let pool = Pool::new(manager).unwrap();
        let conn = pool.get().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE notes (
              id TEXT PRIMARY KEY,
              file_path TEXT UNIQUE NOT NULL,
              title TEXT,
              preview TEXT,
              has_todos INTEGER DEFAULT 0,
              created_at INTEGER,
              updated_at INTEGER,
              file_hash TEXT
            );
            CREATE TABLE outbound_links (source_id TEXT NOT NULL, link_text TEXT NOT NULL, resolved_id TEXT);
            CREATE TABLE backlinks (source_id TEXT NOT NULL, target_id TEXT NOT NULL, PRIMARY KEY (source_id, target_id));
            CREATE VIRTUAL TABLE fts_index USING fts5(note_id UNINDEXED, title, body);
            CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, parent_name TEXT, color TEXT, description TEXT);
            CREATE TABLE note_tags (note_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (note_id, tag_id));
            ",
        )
        .unwrap();
        drop(conn);
        pool
    }

    #[test]
    fn generated_untitled_detection_is_narrow() {
        assert!(is_generated_untitled_filename("notes/Untitled.md"));
        assert!(is_generated_untitled_filename("notes/Untitled 6.md"));
        assert!(!is_generated_untitled_filename("notes/Untitled todos.md"));
        assert!(!is_generated_untitled_filename("notes/Today's todos.md"));
    }

    #[test]
    fn sanitize_derived_filename_keeps_readable_names_safe() {
        assert_eq!(sanitize_derived_filename("  Today's   todos  "), "Today's todos");
        assert_eq!(sanitize_derived_filename("Project / Notes?"), "Project Notes");
        assert_eq!(sanitize_derived_filename("CON"), "CON note");
    }

    #[test]
    fn derived_filename_can_settle_before_locking() {
        let vault = unique_test_vault("limitless-rename-test");
        let notes_dir = vault.join("notes");
        std::fs::create_dir_all(&notes_dir).unwrap();
        std::fs::write(notes_dir.join("Untitled.md"), "# Personal\n").unwrap();

        let (file_path, mode, started_at) = maybe_rename_auto_named_note(
            &vault,
            "notes/Untitled.md",
            "Personal",
            "untitled",
            None,
            100,
        );
        assert_eq!(file_path, "notes/Personal.md");
        assert_eq!(mode, "settling");
        assert_eq!(started_at, Some(100));

        let (file_path, mode, started_at) = maybe_rename_auto_named_note(
            &vault,
            &file_path,
            "Personal Software",
            &mode,
            started_at,
            102,
        );
        assert_eq!(file_path, "notes/Personal Software.md");
        assert_eq!(mode, "settling");
        assert_eq!(started_at, Some(100));

        let (locked_path, mode, _) = maybe_rename_auto_named_note(
            &vault,
            &file_path,
            "Personal Software Project",
            &mode,
            started_at,
            100 + DERIVED_FILENAME_SETTLE_SECS + 1,
        );
        assert_eq!(locked_path, file_path);
        assert_eq!(mode, "locked");

        std::fs::remove_dir_all(vault).unwrap();
    }

    #[test]
    fn scan_keeps_distinct_notes_with_duplicate_titles() {
        let vault = unique_test_vault("limitless-duplicate-title-test");
        let notes_dir = vault.join("notes");
        std::fs::create_dir_all(&notes_dir).unwrap();
        std::fs::write(notes_dir.join("Untitled.md"), "# Untitled\n\nFirst").unwrap();
        std::fs::write(notes_dir.join("Untitled 2.md"), "# Untitled\n\nSecond").unwrap();

        let pool = test_pool();
        let count = scan_and_index(&vault, &pool).unwrap();
        assert_eq!(count, 2);

        let conn = pool.get().unwrap();
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0)).unwrap();
        let duplicate_title_total: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes WHERE title = 'Untitled'", [], |row| row.get(0))
            .unwrap();
        let distinct_paths: i64 = conn
            .query_row("SELECT COUNT(DISTINCT file_path) FROM notes", [], |row| row.get(0))
            .unwrap();

        assert_eq!(total, 2);
        assert_eq!(duplicate_title_total, 2);
        assert_eq!(distinct_paths, 2);

        std::fs::remove_dir_all(vault).unwrap();
    }

    #[test]
    fn duplicate_filenames_get_readable_suffixes() {
        let vault = unique_test_vault("limitless-filename-test");
        let notes_dir = vault.join("notes");
        std::fs::create_dir_all(&notes_dir).unwrap();
        std::fs::write(notes_dir.join("Untitled.md"), "").unwrap();
        std::fs::write(notes_dir.join("Untitled 2.md"), "").unwrap();

        assert_eq!(unique_markdown_filename(&notes_dir, "Untitled", None), "Untitled 3.md");

        std::fs::remove_dir_all(vault).unwrap();
    }
}
