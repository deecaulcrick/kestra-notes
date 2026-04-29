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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            commands::notes::pin_note,
            commands::notes::delete_note,
            commands::notes::resolve_wikilinks,
            commands::attachments::import_attachment,
            commands::attachments::import_attachment_data,
            commands::canvas::list_canvas_boards,
            commands::canvas::create_canvas_board,
            commands::canvas::get_canvas_board_state,
            commands::canvas::save_canvas_position,
            commands::canvas::save_canvas_camera,
            commands::graph::get_backlinks,
            commands::graph::get_outbound_links,
            commands::search::search,
            commands::tags::get_tags,
            commands::tags::get_notes_by_tag,
            commands::tags::create_category,
            commands::tags::update_category,
            commands::tags::delete_category,
            commands::tags::add_note_to_category,
            commands::tags::remove_note_from_category,
            commands::tags::delete_all_categories,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::windows::open_note_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
