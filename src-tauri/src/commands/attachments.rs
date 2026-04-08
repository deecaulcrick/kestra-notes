use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::{error::AppError, AppState};

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct Attachment {
    pub id: String,
    /// Relative to vault root, e.g. "attachments/images/abc123.png"
    pub file_path: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub note_id: String,
    pub created_at: i64,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Copy a file from `source_path` into the vault's attachments directory,
/// register it in the DB, and return the record.
///
/// Used by the `/image` slash command and any file-picker flow where we have
/// a native file-system path.
#[tauri::command]
pub async fn import_attachment(
    source_path: String,
    note_id: String,
    state: State<'_, AppState>,
) -> Result<Attachment, AppError> {
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let source = PathBuf::from(&source_path);
    let original_name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "attachment".to_string());

    let ext = source
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();

    let size_bytes = source.metadata()?.len() as i64;
    if size_bytes > 50 * 1024 * 1024 {
        return Err(AppError::Other("File exceeds 50 MB limit".to_string()));
    }

    let (subfolder, mime_type) = categorize(&ext);
    let id = nanoid::nanoid!();
    let dest_name = if ext.is_empty() {
        id.clone()
    } else {
        format!("{}.{}", id, ext)
    };
    let dest_rel = format!("attachments/{}/{}", subfolder, dest_name);
    let dest_abs = vault_path.join(&dest_rel);

    std::fs::create_dir_all(dest_abs.parent().unwrap())?;
    std::fs::copy(&source, &dest_abs)?;

    let now = now_secs();
    let attachment = Attachment {
        id: id.clone(),
        file_path: dest_rel.clone(),
        file_name: original_name,
        mime_type,
        size_bytes,
        note_id: note_id.clone(),
        created_at: now,
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute(
        "INSERT INTO attachments (id, file_path, file_name, mime_type, size_bytes, note_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            attachment.id,
            attachment.file_path,
            attachment.file_name,
            attachment.mime_type,
            attachment.size_bytes,
            attachment.note_id,
            attachment.created_at,
        ],
    )?;

    Ok(attachment)
}

/// Accept raw bytes (e.g. from paste or drag-drop without a native path),
/// write them to the vault's attachments directory, and return the record.
///
/// The frontend must enforce a size cap before calling this to avoid large
/// JSON payloads (recommended max ~10 MB for paste).
#[tauri::command]
pub async fn import_attachment_data(
    data: Vec<u8>,
    filename: String,
    note_id: String,
    state: State<'_, AppState>,
) -> Result<Attachment, AppError> {
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };
    let pool = {
        let g = state.db.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let size_bytes = data.len() as i64;
    if size_bytes > 10 * 1024 * 1024 {
        return Err(AppError::Other(
            "Pasted image exceeds 10 MB limit".to_string(),
        ));
    }

    let ext = PathBuf::from(&filename)
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();

    let (subfolder, mime_type) = categorize(&ext);
    let id = nanoid::nanoid!();
    let dest_name = if ext.is_empty() {
        id.clone()
    } else {
        format!("{}.{}", id, ext)
    };
    let dest_rel = format!("attachments/{}/{}", subfolder, dest_name);
    let dest_abs = vault_path.join(&dest_rel);

    std::fs::create_dir_all(dest_abs.parent().unwrap())?;
    std::fs::write(&dest_abs, &data)?;

    let now = now_secs();
    let attachment = Attachment {
        id: id.clone(),
        file_path: dest_rel.clone(),
        file_name: filename,
        mime_type,
        size_bytes,
        note_id: note_id.clone(),
        created_at: now,
    };

    let conn = pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute(
        "INSERT INTO attachments (id, file_path, file_name, mime_type, size_bytes, note_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            attachment.id,
            attachment.file_path,
            attachment.file_name,
            attachment.mime_type,
            attachment.size_bytes,
            attachment.note_id,
            attachment.created_at,
        ],
    )?;

    Ok(attachment)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Returns `(subfolder, mime_type)` for a given file extension.
fn categorize(ext: &str) -> (&'static str, String) {
    let ext_lc = ext.to_lowercase();
    match ext_lc.as_str() {
        "png" => ("images", "image/png".into()),
        "jpg" | "jpeg" => ("images", "image/jpeg".into()),
        "gif" => ("images", "image/gif".into()),
        "webp" => ("images", "image/webp".into()),
        "svg" => ("images", "image/svg+xml".into()),
        "pdf" => ("files", "application/pdf".into()),
        other => ("files", format!("application/{}", other)),
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
