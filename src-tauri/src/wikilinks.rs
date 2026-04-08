//! Wikilink parsing and DB indexing.
//!
//! Resolution rules (from CLAUDE.md):
//!   1. `[[My Note]]` → query `notes` WHERE `title = 'My Note'`
//!   2. If no title match → try `WHERE file_path LIKE '%My Note.md'`
//!   3. Multiple matches → pick first (disambiguation UI is a later feature)
//!   4. Unresolved → stored with `resolved_id = NULL`

use rusqlite::{Connection, OptionalExtension};

// ── Parsing ───────────────────────────────────────────────────────────────────

/// Extract every `[[title]]` from a markdown string.
/// Returns the inner text, trimmed, in order of appearance.
pub fn extract_wikilinks(content: &str) -> Vec<String> {
    let bytes = content.as_bytes();
    let mut links: Vec<String> = Vec::new();
    let mut i = 0;

    while i + 1 < bytes.len() {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            i += 2;
            let start = i;
            // Scan for closing `]]`, don't cross newlines.
            while i + 1 < bytes.len()
                && !(bytes[i] == b']' && bytes[i + 1] == b']')
                && bytes[i] != b'\n'
            {
                i += 1;
            }
            if i + 1 < bytes.len() && bytes[i] == b']' && bytes[i + 1] == b']' {
                let title = content[start..i].trim();
                if !title.is_empty() {
                    links.push(title.to_string());
                }
                i += 2;
            }
        } else {
            i += 1;
        }
    }

    links
}

// ── DB indexing ───────────────────────────────────────────────────────────────

/// Parse wikilinks from `content` and update `outbound_links`, `backlinks`,
/// and `fts_index` tables for the given note.
///
/// Called after every write (save_note, scan_and_index) and by the file watcher.
pub fn index_note(
    note_id: &str,
    title: &str,
    content: &str,
    conn: &Connection,
) -> Result<(), rusqlite::Error> {
    let titles = extract_wikilinks(content);

    // ── outbound_links ────────────────────────────────────────────────────────
    conn.execute(
        "DELETE FROM outbound_links WHERE source_id = ?1",
        rusqlite::params![note_id],
    )?;

    for link_text in &titles {
        let resolved_id = resolve_title(link_text, conn)?;
        conn.execute(
            "INSERT INTO outbound_links (source_id, link_text, resolved_id)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![note_id, link_text, resolved_id],
        )?;
    }

    // ── backlinks ─────────────────────────────────────────────────────────────
    // Remove existing backlinks where this note is the source.
    conn.execute(
        "DELETE FROM backlinks WHERE source_id = ?1",
        rusqlite::params![note_id],
    )?;

    let mut stmt = conn.prepare(
        "SELECT resolved_id FROM outbound_links
         WHERE source_id = ?1 AND resolved_id IS NOT NULL",
    )?;
    let target_ids: Vec<String> = stmt
        .query_map(rusqlite::params![note_id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;

    for target_id in target_ids {
        conn.execute(
            "INSERT OR IGNORE INTO backlinks (source_id, target_id) VALUES (?1, ?2)",
            rusqlite::params![note_id, target_id],
        )?;
    }

    // ── fts_index ─────────────────────────────────────────────────────────────
    conn.execute(
        "DELETE FROM fts_index WHERE note_id = ?1",
        rusqlite::params![note_id],
    )?;
    conn.execute(
        "INSERT INTO fts_index(note_id, title, body) VALUES (?1, ?2, ?3)",
        rusqlite::params![note_id, title, content],
    )?;

    Ok(())
}

// ── Resolution ────────────────────────────────────────────────────────────────

/// Resolve a wikilink title to a note ID using the two-step lookup from CLAUDE.md.
/// Returns `None` if the note doesn't exist yet (ghost link).
pub fn resolve_title(
    title: &str,
    conn: &Connection,
) -> Result<Option<String>, rusqlite::Error> {
    // Step 1 — exact title match.
    let by_title: Option<String> = conn
        .query_row(
            "SELECT id FROM notes WHERE title = ?1 LIMIT 1",
            rusqlite::params![title],
            |row| row.get(0),
        )
        .optional()?;

    if by_title.is_some() {
        return Ok(by_title);
    }

    // Step 2 — file_path suffix match.
    let pattern = format!("%{}.md", title);
    conn.query_row(
        "SELECT id FROM notes WHERE file_path LIKE ?1 LIMIT 1",
        rusqlite::params![pattern],
        |row| row.get(0),
    )
    .optional()
}
