use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rusqlite::{params_from_iter, types::Value as RValue, Connection};
use serde::Serialize;
use serde_json::Value as JValue;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub struct CurrentDb {
    pub name: String,
    pub conn: Connection,
}

pub struct AppState {
    pub dbs_dir: PathBuf,
    pub current: Arc<Mutex<Option<CurrentDb>>>,
}

impl AppState {
    pub fn new(dbs_dir: PathBuf) -> Self {
        Self {
            dbs_dir,
            current: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub values: Vec<Vec<JValue>>,
}

fn err_str(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn json_to_value(v: &JValue) -> RValue {
    match v {
        JValue::Null => RValue::Null,
        JValue::Bool(b) => RValue::Integer(*b as i64),
        JValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                RValue::Integer(i)
            } else if let Some(u) = n.as_u64() {
                RValue::Integer(u as i64)
            } else {
                RValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        JValue::String(s) => RValue::Text(s.clone()),
        JValue::Object(o) => {
            if let Some(b64) = o.get("__b").and_then(|x| x.as_str()) {
                match B64.decode(b64) {
                    Ok(bytes) => RValue::Blob(bytes),
                    Err(_) => RValue::Blob(Vec::new()),
                }
            } else {
                RValue::Text(v.to_string())
            }
        }
        JValue::Array(_) => RValue::Text(v.to_string()),
    }
}

fn value_to_json(v: rusqlite::types::ValueRef) -> JValue {
    match v {
        rusqlite::types::ValueRef::Null => JValue::Null,
        rusqlite::types::ValueRef::Integer(i) => JValue::from(i),
        rusqlite::types::ValueRef::Real(f) => JValue::from(f),
        rusqlite::types::ValueRef::Text(s) => {
            JValue::String(String::from_utf8_lossy(&s).into_owned())
        }
        rusqlite::types::ValueRef::Blob(b) => JValue::Object(serde_json::Map::from_iter([(
            "__b".to_string(),
            JValue::String(B64.encode(b)),
        )])),
    }
}

fn with_current<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = state.current.lock().map_err(|e| err_str(e))?;
    match guard.as_ref() {
        Some(cur) => f(&cur.conn),
        None => Err("Немає відкритої бази даних".into()),
    }
}

#[tauri::command]
pub fn open_db(state: State<AppState>, name: String) -> Result<bool, String> {
    let path = state.dbs_dir.join(format!("{name}.sqlite"));
    let existed = path.exists();
    let conn = Connection::open(&path).map_err(err_str)?;
    let mut guard = state.current.lock().map_err(|e| err_str(e))?;
    *guard = Some(CurrentDb { name, conn });
    Ok(existed)
}

#[tauri::command]
pub fn close_db(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.current.lock().map_err(|e| err_str(e))?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn current_db(state: State<AppState>) -> Result<Option<String>, String> {
    let guard = state.current.lock().map_err(|e| err_str(e))?;
    Ok(guard.as_ref().map(|c| c.name.clone()))
}

#[tauri::command]
pub fn sql_exec(
    state: State<AppState>,
    sql: String,
    params: Vec<JValue>,
) -> Result<Vec<QueryResult>, String> {
    with_current(&state, |conn| {
        let mut results = Vec::new();
        let values: Vec<RValue> = params.iter().map(json_to_value).collect();
        let mut stmt = conn.prepare(&sql).map_err(err_str)?;
        let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut out: Vec<Vec<JValue>> = Vec::new();
        if !columns.is_empty() {
            let mut rows = stmt
                .query(params_from_iter(values.iter()))
                .map_err(err_str)?;
            while let Some(row) = rows.next().map_err(err_str)? {
                let mut vals = Vec::with_capacity(columns.len());
                for i in 0..columns.len() {
                    vals.push(value_to_json(row.get_ref(i).map_err(err_str)?));
                }
                out.push(vals);
            }
            results.push(QueryResult {
                columns,
                values: out,
            });
        } else {
            stmt.execute(params_from_iter(values.iter()))
                .map_err(err_str)?;
        }
        Ok(results)
    })
}

#[tauri::command]
pub fn sql_run(state: State<AppState>, sql: String, params: Vec<JValue>) -> Result<u64, String> {
    with_current(&state, |conn| {
        let values: Vec<RValue> = params.iter().map(json_to_value).collect();
        let n = conn
            .execute(&sql, params_from_iter(values.iter()))
            .map_err(err_str)?;
        Ok(n as u64)
    })
}

#[tauri::command]
pub fn db_export(state: State<AppState>) -> Result<String, String> {
    with_current(&state, |conn| {
        let tmp = std::env::temp_dir().join(format!(
            "data_a_export_{}_{}.sqlite",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));
        let escaped = tmp.to_string_lossy().replace('\'', "''");
        conn.execute_batch(&format!("VACUUM INTO '{escaped}';"))
            .map_err(err_str)?;
        let bytes = std::fs::read(&tmp).map_err(err_str)?;
        let _ = std::fs::remove_file(&tmp);
        Ok(B64.encode(bytes))
    })
}

#[tauri::command]
pub fn db_import_bytes(
    state: State<AppState>,
    name: String,
    file_bytes: String,
) -> Result<bool, String> {
    let bytes = B64.decode(file_bytes).map_err(err_str)?;
    let path = state.dbs_dir.join(format!("{name}.sqlite"));
    let existed = path.exists();
    std::fs::write(&path, &bytes).map_err(err_str)?;
    let conn = Connection::open(&path).map_err(err_str)?;
    let mut guard = state.current.lock().map_err(|e| err_str(e))?;
    *guard = Some(CurrentDb { name, conn });
    Ok(existed)
}

#[tauri::command]
pub fn list_databases(state: State<AppState>) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    let entries = std::fs::read_dir(&state.dbs_dir).map_err(err_str)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("sqlite") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn delete_database(state: State<AppState>, name: String) -> Result<(), String> {
    let mut guard = state.current.lock().map_err(|e| err_str(e))?;
    if let Some(cur) = guard.as_ref() {
        if cur.name == name {
            *guard = None;
        }
    }
    let path = state.dbs_dir.join(format!("{name}.sqlite"));
    if path.exists() {
        std::fs::remove_file(path).map_err(err_str)?;
    }
    Ok(())
}

fn path_to_str(p: tauri_plugin_dialog::FilePath) -> Option<String> {
    match p {
        tauri_plugin_dialog::FilePath::Path(p) => Some(p.to_string_lossy().into_owned()),
        tauri_plugin_dialog::FilePath::Url(_) => None,
    }
}

#[tauri::command]
pub async fn pick_open_file(
    app: AppHandle,
    ext: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app.dialog().file();
        if let Some(exts) = ext {
            if !exts.is_empty() {
                let name = exts
                    .first()
                    .map(|e| e.trim_start_matches('.').to_uppercase())
                    .unwrap_or_else(|| "File".into());
                let ext_refs: Vec<&str> = exts.iter().map(String::as_str).collect();
                builder = builder.add_filter(name, &ext_refs);
            }
        }
        match builder.blocking_pick_file() {
            Some(p) => Ok(path_to_str(p)),
            None => Ok(None),
        }
    })
    .await
    .map_err(err_str)?
}

#[tauri::command]
pub async fn pick_save_file(
    app: AppHandle,
    default_name: Option<String>,
    ext: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app.dialog().file();
        if let Some(dn) = default_name {
            builder = builder.set_file_name(dn);
        }
        if let Some(exts) = ext {
            if !exts.is_empty() {
                let name = exts
                    .first()
                    .map(|e| e.trim_start_matches('.').to_uppercase())
                    .unwrap_or_else(|| "File".into());
                let ext_refs: Vec<&str> = exts.iter().map(String::as_str).collect();
                builder = builder.add_filter(name, &ext_refs);
            }
        }
        match builder.blocking_save_file() {
            Some(p) => Ok(path_to_str(p)),
            None => Ok(None),
        }
    })
    .await
    .map_err(err_str)?
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(err_str)?;
    Ok(B64.encode(bytes))
}

#[tauri::command]
pub fn write_file_bytes(path: String, file_bytes: String) -> Result<(), String> {
    let bytes = B64.decode(file_bytes).map_err(err_str)?;
    std::fs::write(&path, &bytes).map_err(err_str)
}

#[tauri::command]
pub fn write_file_text(path: String, text: String) -> Result<(), String> {
    std::fs::write(&path, text).map_err(err_str)
}

#[tauri::command]
pub fn open_file_with_system(path: String) -> Result<(), String> {
    open::that(&path).map_err(err_str)
}

#[tauri::command]
pub fn app_storage_path(state: State<AppState>) -> Result<String, String> {
    Ok(state
        .dbs_dir
        .join("_app_localstorage.json")
        .to_string_lossy()
        .into_owned())
}
