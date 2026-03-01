use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tokio::sync::{Mutex, watch};

const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_FILE_SIZE: u64 = 20 * 1024 * 1024; // 20MB
const MAX_CACHE_SIZE: u64 = 500 * 1024 * 1024; // 500MB

pub struct CacheEntry {
    pub path: PathBuf,
    pub content_type: String,
}

pub struct ImageCache {
    cache_dir: PathBuf,
    inflight: Arc<Mutex<HashMap<String, watch::Receiver<Option<Result<CacheEntry, String>>>>>>,
    http_client: reqwest::Client,
}

impl ImageCache {
    pub fn new(app_dir: &Path) -> Self {
        let cache_dir = app_dir.join("image_cache");
        std::fs::create_dir_all(&cache_dir).ok();

        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Mozilla/5.0 (compatible; NoteDeck/0.0.11)")
            .build()
            .unwrap_or_default();

        Self {
            cache_dir,
            inflight: Arc::new(Mutex::new(HashMap::new())),
            http_client,
        }
    }

    pub async fn get_or_fetch(&self, url: &str) -> Result<CacheEntry, String> {
        if !url.starts_with("https://") {
            return Err("Only HTTPS URLs are allowed".to_string());
        }

        let hash = hex_hash(url);
        let meta_path = self.cache_dir.join(format!("{hash}.meta"));
        let data_path = self.cache_dir.join(format!("{hash}.dat"));

        // Cache hit check
        if let Some(entry) = self.check_cache(&meta_path, &data_path) {
            return Ok(entry);
        }

        // Inflight dedup: if another task is already fetching this URL, wait for it
        let mut inflight = self.inflight.lock().await;
        if let Some(rx) = inflight.get(&hash) {
            let mut rx = rx.clone();
            drop(inflight);
            // Wait for the inflight request to complete
            while rx.changed().await.is_ok() {
                if let Some(result) = rx.borrow().as_ref() {
                    return match result {
                        Ok(e) => Ok(CacheEntry {
                            path: e.path.clone(),
                            content_type: e.content_type.clone(),
                        }),
                        Err(e) => Err(e.clone()),
                    };
                }
            }
            return Err("Inflight request dropped".to_string());
        }

        // Register inflight
        let (tx, rx) = watch::channel(None);
        inflight.insert(hash.clone(), rx);
        drop(inflight);

        let result = self.fetch_and_cache(url, &meta_path, &data_path).await;

        // Notify waiters and remove inflight
        let notify_result = match &result {
            Ok(e) => Some(Ok(CacheEntry {
                path: e.path.clone(),
                content_type: e.content_type.clone(),
            })),
            Err(e) => Some(Err(e.clone())),
        };
        tx.send(notify_result).ok();
        self.inflight.lock().await.remove(&hash);

        result
    }

    fn check_cache(&self, meta_path: &Path, data_path: &Path) -> Option<CacheEntry> {
        if !data_path.exists() || !meta_path.exists() {
            return None;
        }

        let meta = data_path.metadata().ok()?;
        let modified = meta.modified().ok()?;
        if SystemTime::now().duration_since(modified).unwrap_or_default() > CACHE_TTL {
            return None;
        }

        let content_type = std::fs::read_to_string(meta_path).ok()?;
        Some(CacheEntry {
            path: data_path.to_path_buf(),
            content_type,
        })
    }

    async fn fetch_and_cache(
        &self,
        url: &str,
        meta_path: &Path,
        data_path: &Path,
    ) -> Result<CacheEntry, String> {
        let resp = self
            .http_client
            .get(url)
            .send()
            .await
            .map_err(|e| {
                eprintln!("[image_cache] fetch error for {url}: {e}");
                format!("Fetch failed: {e}")
            })?;

        if !resp.status().is_success() {
            eprintln!("[image_cache] HTTP {} for {url}", resp.status());
            return Err(format!("HTTP {}", resp.status()));
        }

        // Check Content-Length if available
        if let Some(cl) = resp.content_length() {
            if cl > MAX_FILE_SIZE {
                return Err("File too large".to_string());
            }
        }

        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();

        let bytes = resp.bytes().await.map_err(|e| format!("Read failed: {e}"))?;

        if bytes.len() as u64 > MAX_FILE_SIZE {
            return Err("File too large".to_string());
        }

        // Write cache files
        std::fs::write(data_path, &bytes).map_err(|e| format!("Write failed: {e}"))?;
        std::fs::write(meta_path, &content_type).map_err(|e| format!("Meta write failed: {e}"))?;

        // Evict old entries if cache is too large
        self.maybe_evict();

        Ok(CacheEntry {
            path: data_path.to_path_buf(),
            content_type,
        })
    }

    fn maybe_evict(&self) {
        let cache_dir = self.cache_dir.clone();
        std::thread::spawn(move || {
            let mut entries: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
            let mut total_size: u64 = 0;

            let Ok(dir) = std::fs::read_dir(&cache_dir) else {
                return;
            };
            for entry in dir.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("dat") {
                    continue;
                }
                if let Ok(meta) = path.metadata() {
                    let size = meta.len();
                    let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                    total_size += size;
                    entries.push((path, modified, size));
                }
            }

            if total_size <= MAX_CACHE_SIZE {
                return;
            }

            // Sort oldest first
            entries.sort_by_key(|(_, t, _)| *t);

            for (path, _, size) in &entries {
                if total_size <= MAX_CACHE_SIZE {
                    break;
                }
                let _ = std::fs::remove_file(path);
                // Remove corresponding .meta file
                let meta_path = path.with_extension("meta");
                let _ = std::fs::remove_file(meta_path);
                total_size -= size;
            }
        });
    }
}

fn hex_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}
