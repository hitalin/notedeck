//! アプリデータディレクトリの解決 (#702)。
//!
//! 通常は Tauri の `app_data_dir()`。デバッグビルドに限り環境変数
//! `NOTEDECK_APP_DIR` で上書きできる — E2E テストや動作検証が隔離
//! プロファイルでアプリを起動するための seam (リリースビルドでは無視)。
//!
//! `notecli.db` / `api-token` / `api-tokens.json` / `notedeck/` (settings)
//! など app_data_dir 基点の全ファイルがまとめて隔離される。

use std::path::PathBuf;

use tauri::Manager;

pub fn resolve_app_dir<M: Manager<tauri::Wry>>(app: &M) -> tauri::Result<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(dir) = std::env::var_os("NOTEDECK_APP_DIR") {
        if !dir.is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    Ok(app.path().app_data_dir()?)
}
