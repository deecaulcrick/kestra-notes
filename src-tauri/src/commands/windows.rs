use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// Open a note in its own floating window.
/// If a window for this note already exists, focus it instead.
#[tauri::command]
pub async fn open_note_window(
    app: AppHandle,
    note_id: String,
    tag: String,
) -> Result<(), AppError> {
    let label = format!("note-{}", note_id);

    // If already open, focus it.
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return Ok(());
    }

    // Build query string — note_id is a nanoid (alphanumeric+hyphens, URL safe).
    // tag is alphanumeric + hyphens + underscores (URL safe).
    let url_str = format!("index.html?noteId={}&tag={}", note_id, tag);

    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(url_str.into()),
    )
    .title("")
    .inner_size(900.0, 680.0)
    .min_inner_size(480.0, 360.0);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    builder.build().map_err(|e| AppError::Other(e.to_string()))?;

    Ok(())
}
