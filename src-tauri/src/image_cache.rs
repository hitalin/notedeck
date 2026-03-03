use bytes::Bytes;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::{Mutex, Semaphore, watch};

const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_FILE_SIZE: u64 = 20 * 1024 * 1024; // 20MB
const MAX_CACHE_SIZE: u64 = 500 * 1024 * 1024; // 500MB
const MAX_CONCURRENT_FETCHES: usize = 20;
const NEGATIVE_CACHE_TTL: Duration = Duration::from_secs(5 * 60); // 5min
const MEMORY_CACHE_MAX_ITEM: usize = 64 * 1024; // 64KB
const MEMORY_CACHE_MAX_TOTAL: usize = 32 * 1024 * 1024; // 32MB

type InflightMap = HashMap<String, watch::Receiver<Option<Result<CacheEntry, String>>>>;

#[derive(Clone)]
pub struct CacheEntry {
    pub path: PathBuf,
    pub content_type: String,
    pub mem_bytes: Option<Arc<Vec<u8>>>,
}

pub enum StreamingFetchResult {
    /// Cache hit – serve immediately
    Cached(CacheEntry),
    /// Cache miss – stream chunks from upstream
    Streaming {
        byte_stream: Pin<Box<dyn futures_util::Stream<Item = Result<Bytes, String>> + Send>>,
        content_type: String,
    },
}

struct MemEntry {
    data: Arc<Vec<u8>>,
    content_type: String,
    inserted_at: Instant,
}

struct MemCacheState {
    entries: HashMap<String, MemEntry>,
    total_size: usize,
}

pub struct ImageCache {
    cache_dir: PathBuf,
    inflight: Arc<Mutex<InflightMap>>,
    http_client: reqwest::Client,
    fetch_semaphore: Arc<Semaphore>,
    negative_cache: Arc<Mutex<HashMap<String, Instant>>>,
    mem_cache: Arc<Mutex<MemCacheState>>,
}

impl ImageCache {
    pub fn new(app_dir: &Path) -> Self {
        let cache_dir = app_dir.join("image_cache");
        std::fs::create_dir_all(&cache_dir).ok();

        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent(format!(
                "Mozilla/5.0 (compatible; NoteDeck/{})",
                env!("CARGO_PKG_VERSION")
            ))
            .build()
            .unwrap_or_default();

        Self {
            cache_dir,
            inflight: Arc::new(Mutex::new(HashMap::new())),
            http_client,
            fetch_semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_FETCHES)),
            negative_cache: Arc::new(Mutex::new(HashMap::new())),
            mem_cache: Arc::new(Mutex::new(MemCacheState {
                entries: HashMap::new(),
                total_size: 0,
            })),
        }
    }

    pub async fn get_or_fetch(&self, url: &str) -> Result<CacheEntry, String> {
        if !url.starts_with("https://") {
            return Err("Only HTTPS URLs are allowed".to_string());
        }

        let hash = hex_hash(url);
        let meta_path = self.cache_dir.join(format!("{hash}.meta"));
        let data_path = self.cache_dir.join(format!("{hash}.dat"));

        // L1: Memory cache (fastest path)
        {
            let mem = self.mem_cache.lock().await;
            if let Some(entry) = mem.entries.get(&hash) {
                if entry.inserted_at.elapsed() < CACHE_TTL {
                    return Ok(CacheEntry {
                        path: data_path.clone(),
                        content_type: entry.content_type.clone(),
                        mem_bytes: Some(entry.data.clone()),
                    });
                }
            }
        }

        // L2: Disk cache
        if let Some(entry) = self.check_cache(&hash, &meta_path, &data_path).await {
            return Ok(entry);
        }

        // L3: Negative cache (skip known failures)
        {
            let neg = self.negative_cache.lock().await;
            if let Some(failed_at) = neg.get(&hash) {
                if failed_at.elapsed() < NEGATIVE_CACHE_TTL {
                    return Err("Temporarily unavailable".to_string());
                }
            }
        }

        // Inflight dedup: if another task is already fetching this URL, wait for it
        let mut inflight = self.inflight.lock().await;
        if let Some(rx) = inflight.get(&hash) {
            let mut rx = rx.clone();
            drop(inflight);
            while rx.changed().await.is_ok() {
                if let Some(result) = rx.borrow().as_ref() {
                    return result.clone();
                }
            }
            return Err("Inflight request dropped".to_string());
        }

        // Register inflight
        let (tx, rx) = watch::channel(None);
        inflight.insert(hash.clone(), rx);
        drop(inflight);

        // Acquire semaphore permit (limits concurrent outbound fetches)
        let _permit = self
            .fetch_semaphore
            .acquire()
            .await
            .map_err(|_| "Semaphore closed".to_string())?;

        let result = self
            .fetch_and_cache(url, &hash, &meta_path, &data_path)
            .await;

        // Record negative cache on failure
        if result.is_err() {
            let mut neg = self.negative_cache.lock().await;
            neg.insert(hash.clone(), Instant::now());
            if neg.len() > 1000 {
                neg.retain(|_, t| t.elapsed() < NEGATIVE_CACHE_TTL);
            }
        }

        // Notify waiters and remove inflight
        tx.send(Some(result.clone())).ok();
        self.inflight.lock().await.remove(&hash);

        result
    }

    async fn check_cache(
        &self,
        hash: &str,
        meta_path: &Path,
        data_path: &Path,
    ) -> Option<CacheEntry> {
        let meta_path_owned = meta_path.to_path_buf();
        let data_path_owned = data_path.to_path_buf();
        let (content_type, bytes) = tokio::task::spawn_blocking(move || {
            if !data_path_owned.exists() || !meta_path_owned.exists() {
                return None;
            }
            let meta = data_path_owned.metadata().ok()?;
            let modified = meta.modified().ok()?;
            if SystemTime::now().duration_since(modified).unwrap_or_default() > CACHE_TTL {
                return None;
            }
            let content_type = std::fs::read_to_string(&meta_path_owned).ok()?;
            let bytes = std::fs::read(&data_path_owned).ok()?;
            Some((content_type, bytes))
        })
        .await
        .ok()??;
        let data_path = data_path.to_path_buf();

        // Promote small files to memory cache
        let mem_bytes = if bytes.len() <= MEMORY_CACHE_MAX_ITEM {
            let arc = Arc::new(bytes);
            self.insert_mem_cache(hash, &arc, &content_type).await;
            Some(arc)
        } else {
            None
        };

        Some(CacheEntry {
            path: data_path,
            content_type,
            mem_bytes,
        })
    }

    async fn insert_mem_cache(&self, hash: &str, data: &Arc<Vec<u8>>, content_type: &str) {
        let mut state = self.mem_cache.lock().await;
        // LRU eviction: evict oldest entries until there is room
        while state.total_size + data.len() > MEMORY_CACHE_MAX_TOTAL && !state.entries.is_empty() {
            if let Some(oldest_key) = state
                .entries
                .iter()
                .min_by_key(|(_, v)| v.inserted_at)
                .map(|(k, _)| k.clone())
            {
                if let Some(removed) = state.entries.remove(&oldest_key) {
                    state.total_size = state.total_size.saturating_sub(removed.data.len());
                }
            } else {
                break;
            }
        }
        state.total_size += data.len();
        state.entries.insert(
            hash.to_string(),
            MemEntry {
                data: data.clone(),
                content_type: content_type.to_string(),
                inserted_at: Instant::now(),
            },
        );
    }

    async fn fetch_and_cache(
        &self,
        url: &str,
        hash: &str,
        meta_path: &Path,
        data_path: &Path,
    ) -> Result<CacheEntry, String> {
        match self.try_fetch_once(url, hash, meta_path, data_path).await {
            Ok(entry) => Ok(entry),
            Err(e) if Self::is_retryable(&e) => {
                eprintln!("[image_cache] retrying {url}: {e}");
                tokio::time::sleep(Duration::from_millis(500)).await;
                self.try_fetch_once(url, hash, meta_path, data_path).await
            }
            Err(e) => Err(e),
        }
    }

    fn is_retryable(error: &str) -> bool {
        error.starts_with("Fetch failed:") || error.starts_with("HTTP 5")
    }

    async fn try_fetch_once(
        &self,
        url: &str,
        hash: &str,
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

        // Write cache files asynchronously
        {
            let data_path = data_path.to_path_buf();
            let meta_path = meta_path.to_path_buf();
            let bytes_clone = bytes.clone();
            let ct = content_type.clone();
            tokio::task::spawn_blocking(move || {
                if let Err(e) = std::fs::write(&data_path, &bytes_clone) {
                    eprintln!("[image_cache] write failed: {e}");
                }
                if let Err(e) = std::fs::write(&meta_path, &ct) {
                    eprintln!("[image_cache] meta write failed: {e}");
                }
            });
        }

        // Evict old entries if cache is too large
        self.maybe_evict();

        // Store in memory cache if small enough
        let mem_bytes = if bytes.len() <= MEMORY_CACHE_MAX_ITEM {
            let arc = Arc::new(bytes.to_vec());
            self.insert_mem_cache(hash, &arc, &content_type).await;
            Some(arc)
        } else {
            None
        };

        Ok(CacheEntry {
            path: data_path.to_path_buf(),
            content_type,
            mem_bytes,
        })
    }

    fn maybe_evict(&self) {
        let cache_dir = self.cache_dir.clone();
        tokio::task::spawn_blocking(move || {
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
                let meta_path = path.with_extension("meta");
                let _ = std::fs::remove_file(meta_path);
                total_size -= size;
            }
        });
    }

    /// Check all cache layers without fetching. Returns `None` on miss.
    pub async fn check_cache_only(&self, url: &str) -> Option<CacheEntry> {
        if !url.starts_with("https://") {
            return None;
        }
        let hash = hex_hash(url);
        let meta_path = self.cache_dir.join(format!("{hash}.meta"));
        let data_path = self.cache_dir.join(format!("{hash}.dat"));

        // L1: Memory cache
        {
            let mem = self.mem_cache.lock().await;
            if let Some(entry) = mem.entries.get(&hash) {
                if entry.inserted_at.elapsed() < CACHE_TTL {
                    return Some(CacheEntry {
                        path: data_path,
                        content_type: entry.content_type.clone(),
                        mem_bytes: Some(entry.data.clone()),
                    });
                }
            }
        }

        // L2: Disk cache
        self.check_cache(&hash, &meta_path, &data_path).await
    }

    /// Fetch with streaming for cache misses. First requester gets a byte stream;
    /// inflight waiters get the cached result after the first fetch completes.
    pub async fn fetch_streaming(&self, url: &str) -> Result<StreamingFetchResult, String> {
        if !url.starts_with("https://") {
            return Err("Only HTTPS URLs are allowed".to_string());
        }

        let hash = hex_hash(url);
        let meta_path = self.cache_dir.join(format!("{hash}.meta"));
        let data_path = self.cache_dir.join(format!("{hash}.dat"));

        // Negative cache check
        {
            let neg = self.negative_cache.lock().await;
            if let Some(failed_at) = neg.get(&hash) {
                if failed_at.elapsed() < NEGATIVE_CACHE_TTL {
                    return Err("Temporarily unavailable".to_string());
                }
            }
        }

        // Inflight dedup: wait for existing fetch, then return from cache
        let mut inflight = self.inflight.lock().await;
        if let Some(rx) = inflight.get(&hash) {
            let mut rx = rx.clone();
            drop(inflight);
            while rx.changed().await.is_ok() {
                if let Some(result) = rx.borrow().as_ref() {
                    return result
                        .clone()
                        .map(StreamingFetchResult::Cached);
                }
            }
            return Err("Inflight request dropped".to_string());
        }

        // Register inflight
        let (tx, rx) = watch::channel(None);
        inflight.insert(hash.clone(), rx);
        drop(inflight);

        // Acquire semaphore
        let _permit = self
            .fetch_semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| "Semaphore closed".to_string())?;

        // Start HTTP request (headers only, don't consume body yet)
        let resp = self
            .http_client
            .get(url)
            .send()
            .await
            .map_err(|e| {
                let msg = format!("Fetch failed: {e}");
                self.record_negative_and_notify(&hash, &tx, &msg);
                msg
            })?;

        if !resp.status().is_success() {
            let msg = format!("HTTP {}", resp.status());
            self.record_negative_and_notify(&hash, &tx, &msg);
            return Err(msg);
        }

        if let Some(cl) = resp.content_length() {
            if cl > MAX_FILE_SIZE {
                let msg = "File too large".to_string();
                self.record_negative_and_notify(&hash, &tx, &msg);
                return Err(msg);
            }
        }

        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();

        // Set up a channel to relay chunks to the HTTP response
        let (chunk_tx, chunk_rx) = tokio::sync::mpsc::channel::<Result<Bytes, String>>(32);

        // Background task: collect bytes, write cache, notify inflight waiters
        let cache_dir = self.cache_dir.clone();
        let ct_clone = content_type.clone();
        let hash_clone = hash.clone();
        let inflight_ref = self.inflight.clone();
        let negative_cache = self.negative_cache.clone();
        let mem_cache = self.mem_cache.clone();

        tokio::spawn(async move {
            let _permit = _permit; // move permit into task to hold it
            let mut all_bytes = Vec::new();
            let mut stream = resp.bytes_stream();
            let mut error = false;

            while let Some(chunk_result) = stream.next().await {
                match chunk_result {
                    Ok(chunk) => {
                        all_bytes.extend_from_slice(&chunk);
                        if all_bytes.len() as u64 > MAX_FILE_SIZE {
                            let _ = chunk_tx.send(Err("File too large".to_string())).await;
                            error = true;
                            break;
                        }
                        if chunk_tx.send(Ok(chunk)).await.is_err() {
                            // Receiver dropped (client disconnected), but still cache
                            // Continue reading to completion for caching
                            while let Some(r) = stream.next().await {
                                match r {
                                    Ok(c) => all_bytes.extend_from_slice(&c),
                                    Err(_) => { error = true; break; }
                                }
                            }
                            break;
                        }
                    }
                    Err(e) => {
                        let _ = chunk_tx.send(Err(format!("Stream error: {e}"))).await;
                        error = true;
                        break;
                    }
                }
            }
            drop(chunk_tx);

            let data_path = cache_dir.join(format!("{hash_clone}.dat"));
            let meta_path = cache_dir.join(format!("{hash_clone}.meta"));

            if error {
                let mut neg = negative_cache.lock().await;
                neg.insert(hash_clone.clone(), Instant::now());
                tx.send(Some(Err("Stream failed".to_string()))).ok();
            } else {
                // Write to disk cache
                let bytes_for_disk = all_bytes.clone();
                let ct_for_disk = ct_clone.clone();
                let dp = data_path.clone();
                let mp = meta_path.clone();
                tokio::task::spawn_blocking(move || {
                    std::fs::write(&dp, &bytes_for_disk).ok();
                    std::fs::write(&mp, &ct_for_disk).ok();
                }).await.ok();

                // Store in memory cache if small enough
                let mem_bytes = if all_bytes.len() <= MEMORY_CACHE_MAX_ITEM {
                    let arc = Arc::new(all_bytes);
                    let mut state = mem_cache.lock().await;
                    while state.total_size + arc.len() > MEMORY_CACHE_MAX_TOTAL
                        && !state.entries.is_empty()
                    {
                        if let Some(oldest_key) = state
                            .entries
                            .iter()
                            .min_by_key(|(_, v)| v.inserted_at)
                            .map(|(k, _)| k.clone())
                        {
                            if let Some(removed) = state.entries.remove(&oldest_key) {
                                state.total_size =
                                    state.total_size.saturating_sub(removed.data.len());
                            }
                        } else {
                            break;
                        }
                    }
                    state.total_size += arc.len();
                    state.entries.insert(
                        hash_clone.clone(),
                        MemEntry {
                            data: arc.clone(),
                            content_type: ct_clone.clone(),
                            inserted_at: Instant::now(),
                        },
                    );
                    Some(arc)
                } else {
                    None
                };

                // Notify inflight waiters with the cached entry
                tx.send(Some(Ok(CacheEntry {
                    path: data_path,
                    content_type: ct_clone,
                    mem_bytes,
                })))
                .ok();
            }

            inflight_ref.lock().await.remove(&hash_clone);
        });

        // Convert mpsc receiver into a stream
        let stream = tokio_stream::wrappers::ReceiverStream::new(chunk_rx);

        Ok(StreamingFetchResult::Streaming {
            byte_stream: Box::pin(stream),
            content_type,
        })
    }

    fn record_negative_and_notify(
        &self,
        hash: &str,
        tx: &watch::Sender<Option<Result<CacheEntry, String>>>,
        msg: &str,
    ) {
        let neg = self.negative_cache.clone();
        let inflight = self.inflight.clone();
        let hash = hash.to_string();
        let msg = msg.to_string();
        let tx_msg = msg.clone();
        tx.send(Some(Err(tx_msg))).ok();
        tokio::spawn(async move {
            neg.lock().await.insert(hash.clone(), Instant::now());
            inflight.lock().await.remove(&hash);
        });
    }
}

fn hex_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}
