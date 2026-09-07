mod sqlite;

use sqlite::AppState;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn open_help_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("help") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "help", WebviewUrl::App("help.html".into()))
        .title("dat.A — Підказка")
        .inner_size(980.0, 720.0)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dbs_dir = app.path().app_data_dir()?.join("databases");
            std::fs::create_dir_all(&dbs_dir)?;
            app.manage(AppState::new(dbs_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sqlite::open_db,
            sqlite::close_db,
            sqlite::current_db,
            sqlite::sql_exec,
            sqlite::sql_run,
            sqlite::db_export,
            sqlite::db_import_bytes,
            sqlite::list_databases,
            sqlite::delete_database,
            sqlite::pick_open_file,
            sqlite::pick_save_file,
            sqlite::read_file_bytes,
            sqlite::write_file_bytes,
            sqlite::write_file_text,
            sqlite::open_file_with_system,
            sqlite::app_storage_path,
            open_help_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
