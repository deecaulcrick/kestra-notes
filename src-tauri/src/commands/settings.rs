use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{error::AppError, AppState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
    pub text_font: String,
    pub headings_font: String,
    pub code_font: String,
    pub font_size: f64,
    pub line_height: f64,
    pub line_width: f64,
    pub paragraph_spacing: f64,
    pub paragraph_indent: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark-graphite".to_string(),
            text_font: "Lora".to_string(),
            headings_font: "Fraunces".to_string(),
            code_font: "JetBrains Mono".to_string(),
            font_size: 17.0,
            line_height: 1.75,
            line_width: 48.0,
            paragraph_spacing: 0.0,
            paragraph_indent: 0.0,
        }
    }
}

fn settings_path(vault_path: &std::path::Path) -> std::path::PathBuf {
    vault_path.join(".app").join("settings.json")
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        match g.as_ref() {
            Some(p) => p.clone(),
            None => return Ok(Settings::default()),
        }
    };

    let path = settings_path(&vault_path);
    if !path.exists() {
        return Ok(Settings::default());
    }

    let json = std::fs::read_to_string(&path)?;
    let settings: Settings = serde_json::from_str(&json)
        .unwrap_or_else(|_| Settings::default());
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(
    settings: Settings,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let vault_path = {
        let g = state.vault_path.lock().unwrap();
        g.as_ref().ok_or(AppError::VaultNotOpen)?.clone()
    };

    let path = settings_path(&vault_path);
    std::fs::create_dir_all(path.parent().unwrap())?;
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::Other(e.to_string()))?;
    std::fs::write(&path, json)?;
    Ok(())
}
