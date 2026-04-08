use std::sync::Mutex;

pub mod commands;
pub mod db;
pub mod error;
pub mod indexer;
pub mod wikilinks;

use db::DbPool;

/// Shared application state injected into every Tauri command via `State<'_, AppState>`.
pub struct AppState {
    pub db: Mutex<Option<DbPool>>,
    pub vault_path: Mutex<Option<std::path::PathBuf>>,
    /// The file-system watcher — kept alive here so it isn't dropped.
    /// Dropping it would stop the watch.
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            db: Mutex::new(None),
            vault_path: Mutex::new(None),
            watcher: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault::open_vault,
            commands::vault::get_workspaces,
            commands::notes::get_note,
            commands::notes::save_note,
            commands::notes::create_note,
            commands::notes::list_notes,
            commands::notes::resolve_wikilinks,
            commands::attachments::import_attachment,
            commands::attachments::import_attachment_data,
            commands::graph::get_backlinks,
            commands::graph::get_outbound_links,
            commands::search::search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
