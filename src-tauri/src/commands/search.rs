use serde::Serialize;
use tauri::State;

use crate::{error::AppError, AppState};

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub file_path: String,
    /// Highlighted excerpt from the body, with `<b>` tags around matched terms.
    pub snippet: String,
}

/// Full-text search via FTS5.
///
/// Each word in `query` is turned into a prefix match (`word*`) so "hel wor"
/// matches "hello world". Results are ranked by FTS5 relevance (BM25).
#[tauri::command]
pub async fn search(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let db_guard = state.db.lock().unwrap();
    let pool = db_guard.as_ref().ok_or(AppError::VaultNotOpen)?;
    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    // Build a prefix-match FTS5 query: "foo bar" → "foo* bar*"
    let fts_query = query
        .split_whitespace()
        .map(|w| {
            // Escape any FTS5 special characters by quoting the term.
            format!("\"{}\"*", w.replace('"', "\"\""))
        })
        .collect::<Vec<_>>()
        .join(" ");

    let mut stmt = conn.prepare(
        "SELECT
           f.note_id,
           COALESCE(n.title, 'Untitled'),
           n.file_path,
           snippet(fts_index, 2, '<b>', '</b>', '…', 32)
         FROM fts_index f
         JOIN notes n ON n.id = f.note_id
         WHERE fts_index MATCH ?1
         ORDER BY rank
         LIMIT 30",
    )?;

    let results = stmt
        .query_map(rusqlite::params![fts_query], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                snippet: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}
