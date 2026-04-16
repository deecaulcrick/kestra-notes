//! Background file watcher.
//!
//! Watches `{vault}/notes/` for external edits (files created, changed, or
//! removed by other apps).  Events are collected and debounced for 500ms before
//! re-indexing, so rapid saves from our own `save_note` command don't thrash.
//!
//! After re-indexing, a `notes://changed` Tauri event is emitted so the
//! frontend can refresh the sidebar list.

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::Emitter;

use crate::{commands::notes::{extract_title, extract_preview, index_tags}, db::DbPool, wikilinks};

/// Start a file-system watcher for `{vault_path}/notes/`.
///
/// Returns the `RecommendedWatcher` handle — the caller **must** store it in
/// `AppState`.  Dropping the handle stops the watch.
pub fn start_watcher(
    vault_path: PathBuf,
    pool: DbPool,
    app_handle: tauri::AppHandle,
) -> notify::Result<RecommendedWatcher> {
    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();

    let mut watcher = notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    })?;

    let notes_dir = vault_path.join("notes");
    if notes_dir.exists() {
        watcher.watch(&notes_dir, RecursiveMode::NonRecursive)?;
    }

    // Spawn the debounce + indexing thread.
    thread::spawn(move || {
        run_indexer(rx, vault_path, pool, app_handle);
    });

    Ok(watcher)
}

// ── Background thread ─────────────────────────────────────────────────────────

const DEBOUNCE: Duration = Duration::from_millis(500);
const POLL:     Duration = Duration::from_millis(100);

fn run_indexer(
    rx: mpsc::Receiver<notify::Result<Event>>,
    vault_path: PathBuf,
    pool: DbPool,
    app_handle: tauri::AppHandle,
) {
    let mut pending: HashSet<PathBuf> = HashSet::new();
    let mut last_event: Option<Instant> = None;

    loop {
        match rx.recv_timeout(POLL) {
            Ok(Ok(event)) => {
                for path in event.paths {
                    if path.extension().and_then(|e| e.to_str()) == Some("md") {
                        let is_data_event = matches!(
                            event.kind,
                            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                        );
                        if is_data_event {
                            pending.insert(path);
                            last_event = Some(Instant::now());
                        }
                    }
                }
            }

            Ok(Err(e)) => eprintln!("[indexer] watch error: {e}"),

            Err(mpsc::RecvTimeoutError::Timeout) => {
                // Fire if debounce period has elapsed and there are pending paths.
                let ready = last_event
                    .map(|t| t.elapsed() >= DEBOUNCE)
                    .unwrap_or(false);

                if ready && !pending.is_empty() {
                    let paths: Vec<PathBuf> = pending.drain().collect();
                    index_changed_files(&paths, &vault_path, &pool);
                    let _ = app_handle.emit("notes://changed", ());
                    last_event = None;
                }
            }

            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn index_changed_files(paths: &[PathBuf], vault_path: &PathBuf, pool: &DbPool) {
    let conn = match pool.get() {
        Ok(c) => c,
        Err(e) => { eprintln!("[indexer] pool error: {e}"); return; }
    };

    for path in paths {
        if !path.exists() {
            // File was deleted — remove from notes table.
            let rel = match rel_path(path, vault_path) {
                Some(r) => r,
                None => continue,
            };
            if let Err(e) = conn.execute(
                "DELETE FROM notes WHERE file_path = ?1",
                rusqlite::params![rel],
            ) {
                eprintln!("[indexer] delete error for {}: {e}", path.display());
            }
            continue;
        }

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => { eprintln!("[indexer] read error {}: {e}", path.display()); continue; }
        };
        // Normalize escaped brackets written by older tiptap-markdown versions.
        let content = if content.contains("\\[") {
            content.replace("\\[", "[").replace("\\]", "]")
        } else {
            content
        };

        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Untitled".to_string());
        let title = extract_title(&content, &stem);

        let rel = match rel_path(path, vault_path) {
            Some(r) => r,
            None => continue,
        };

        let meta = match path.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let updated_at = meta
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0))
            .unwrap_or(0);
        let file_hash = format!("{}-{}", updated_at, meta.len());

        // Upsert the note record.
        use rusqlite::OptionalExtension;
        let existing_id: Option<String> = conn
            .query_row(
                "SELECT id FROM notes WHERE file_path = ?1",
                rusqlite::params![rel],
                |row| row.get(0),
            )
            .optional()
            .unwrap_or(None);

        let preview = extract_preview(&content);
        let has_todos = content.contains("- [ ]") as i64;

        let note_id = if let Some(id) = existing_id {
            conn.execute(
                "UPDATE notes SET title=?1, preview=?2, has_todos=?3, updated_at=?4, file_hash=?5 WHERE id=?6",
                rusqlite::params![title, preview, has_todos, updated_at, file_hash, id],
            ).ok();
            id
        } else {
            let id = nanoid::nanoid!();
            let created_at = meta
                .created()
                .unwrap_or_else(|_| meta.modified().unwrap_or(std::time::UNIX_EPOCH))
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            conn.execute(
                "INSERT INTO notes (id, file_path, title, preview, has_todos, created_at, updated_at, file_hash)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![id, rel, title, preview, has_todos, created_at, updated_at, file_hash],
            ).ok();
            id
        };

        // Re-index wikilinks + FTS + tags.
        if let Err(e) = wikilinks::index_note(&note_id, &title, &content, &conn) {
            eprintln!("[indexer] wikilink index error for {}: {e}", path.display());
        }
        index_tags(&note_id, &content, &conn);
    }
}

fn rel_path(abs: &PathBuf, vault_path: &PathBuf) -> Option<String> {
    abs.strip_prefix(vault_path)
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}
