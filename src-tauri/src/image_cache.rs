use bytes::Bytes;
use futures_util::StreamExt;
use lru::LruCache;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::{watch, Mutex, RwLock, Semaphore};

const CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60); // 7 days
const MAX_FILE_SIZE: u64 = 20 * 1024 * 1024; // 20MB
const MAX_CONCURRENT_FETCHES: usize = 20;
// Negative cache TTLs by error class
const NEGATIVE_TTL_CLIENT: Duration = Duration::from_secs(24 * 60 * 60); // 4xx: 24h
const NEGATIVE_TTL_SERVER: Duration = Duration::from_secs(2 * 60); // 5xx: 2min
const NEGATIVE_TTL_NETWORK: Duration = Duration::from_secs(30); // timeout/conn: 30s
const MEMORY_CACHE_MAX_ITEM: usize = 64 * 1024; // 64KB
const MEMORY_CACHE_MAX_TOTAL: usize = 8 * 1024 * 1024; // 8MB

/// Circuit breaker: block an entire host after this many consecutive failures.
const CIRCUIT_BREAKER_THRESHOLD: u32 = 3;
/// How long a tripped circuit breaker blocks the host.
const CIRCUIT_BREAKER_DURATION: Duration = Duration::from_secs(60);

struct HostCircuitState {
    consecutive_failures: u32,
    tripped_at: Option<Instant>,
}

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
}

struct MemCacheState {
    entries: LruCache<String, MemEntry>,
    total_size: usize,
}

const MEM_CACHE_CAPACITY: usize = MEMORY_CACHE_MAX_TOTAL / (MEMORY_CACHE_MAX_ITEM / 2);

pub struct ImageCache {
    cache_dir: PathBuf,
    inflight: Arc<Mutex<InflightMap>>,
    http_client: reqwest::Client,
    fetch_semaphore: Arc<Semaphore>,
    negative_cache: Arc<RwLock<HashMap<String, (Instant, Duration)>>>,
    mem_cache: Arc<RwLock<MemCacheState>>,
    host_circuits: Arc<RwLock<HashMap<String, HostCircuitState>>>,
}

impl ImageCache {
    /// Create with a default HTTP client (used in tests).
    #[cfg(test)]
    pub fn new(app_dir: &Path) -> Self {
        Self::with_client(app_dir, reqwest::Client::default())
    }

    pub fn with_client(app_dir: &Path, http_client: reqwest::Client) -> Self {
        let cache_dir = app_dir.join("image_cache");
        std::fs::create_dir_all(&cache_dir).ok();

        Self {
            cache_dir,
            inflight: Arc::new(Mutex::new(HashMap::new())),
            http_client,
            fetch_semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_FETCHES)),
            negative_cache: Arc::new(RwLock::new(HashMap::new())),
            mem_cache: Arc::new(RwLock::new(MemCacheState {
                entries: LruCache::new(NonZeroUsize::new(MEM_CACHE_CAPACITY).unwrap()),
                total_size: 0,
            })),
            host_circuits: Arc::new(RwLock::new(HashMap::new())),
        }
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
            if SystemTime::now()
                .duration_since(modified)
                .unwrap_or_default()
                > CACHE_TTL
            {
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
        let mut state = self.mem_cache.write().await;
        // LRU eviction: pop least-recently-used until there is room
        while state.total_size + data.len() > MEMORY_CACHE_MAX_TOTAL && !state.entries.is_empty() {
            if let Some((_key, removed)) = state.entries.pop_lru() {
                state.total_size = state.total_size.saturating_sub(removed.data.len());
            } else {
                break;
            }
        }
        // If key already exists, subtract old size
        if let Some(old) = state.entries.pop(hash) {
            state.total_size = state.total_size.saturating_sub(old.data.len());
        }
        state.total_size += data.len();
        state.entries.push(
            hash.to_string(),
            MemEntry {
                data: data.clone(),
                content_type: content_type.to_string(),
            },
        );
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
            let mut mem = self.mem_cache.write().await;
            if let Some(entry) = mem.entries.get(&hash) {
                return Some(CacheEntry {
                    path: data_path,
                    content_type: entry.content_type.clone(),
                    mem_bytes: Some(entry.data.clone()),
                });
            }
        }

        // L2: Disk cache
        self.check_cache(&hash, &meta_path, &data_path).await
    }

    /// Extract host from a URL for circuit breaker keying.
    fn extract_host(url: &str) -> Option<String> {
        url::Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.to_string()))
    }

    /// Check if a host's circuit breaker is tripped.
    async fn is_host_blocked(&self, host: &str) -> bool {
        let circuits = self.host_circuits.read().await;
        if let Some(state) = circuits.get(host) {
            if let Some(tripped_at) = state.tripped_at {
                if tripped_at.elapsed() < CIRCUIT_BREAKER_DURATION {
                    return true;
                }
            }
        }
        false
    }

    /// Fetch with streaming for cache misses. First requester gets a byte stream;
    /// inflight waiters get the cached result after the first fetch completes.
    pub async fn fetch_streaming(&self, url: &str) -> Result<StreamingFetchResult, String> {
        if !url.starts_with("https://") {
            return Err("Only HTTPS URLs are allowed".to_string());
        }

        // SSRF protection: block private/loopback IPs
        if let Ok(parsed) = url::Url::parse(url) {
            if let Some(host) = parsed.host_str() {
                if let Ok(ip) = host.parse::<std::net::IpAddr>() {
                    if ip.is_loopback()
                        || matches!(ip, std::net::IpAddr::V4(v4) if v4.is_private()
                            || v4.is_link_local())
                    {
                        return Err("Private/loopback addresses are not allowed".to_string());
                    }
                }
            }
        }

        // Circuit breaker: reject early if host is known-down
        if let Some(host) = Self::extract_host(url) {
            if self.is_host_blocked(&host).await {
                return Err(format!("Host {host} temporarily blocked (circuit breaker)"));
            }
        }

        let hash = hex_hash(url);

        // Negative cache check
        {
            let neg = self.negative_cache.read().await;
            if let Some((failed_at, ttl)) = neg.get(&hash) {
                if failed_at.elapsed() < *ttl {
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
                    return result.clone().map(StreamingFetchResult::Cached);
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
        // Some hosts (e.g. i.pximg.net) require a valid Referer header
        let referer = url::Url::parse(url)
            .ok()
            .map(|u| format!("{}://{}/", u.scheme(), u.host_str().unwrap_or_default()));

        let mut req = self.http_client.get(url);
        if let Some(ref referer) = referer {
            req = req.header(reqwest::header::REFERER, referer);
        }
        let resp = req.send().await.map_err(|e| {
            let msg = format!("Fetch failed: {e}");
            self.record_negative_and_notify(url, &hash, &tx, &msg, NEGATIVE_TTL_NETWORK);
            msg
        })?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let ttl = if (400..500).contains(&status) {
                NEGATIVE_TTL_CLIENT
            } else {
                NEGATIVE_TTL_SERVER
            };
            let msg = format!("HTTP {status}");
            self.record_negative_and_notify(url, &hash, &tx, &msg, ttl);
            return Err(msg);
        }

        if let Some(cl) = resp.content_length() {
            if cl > MAX_FILE_SIZE {
                let msg = "File too large".to_string();
                self.record_negative_and_notify(url, &hash, &tx, &msg, NEGATIVE_TTL_CLIENT);
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
        let host_circuits = self.host_circuits.clone();
        let url_host = Self::extract_host(url).unwrap_or_default();

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
                                    Err(_) => {
                                        error = true;
                                        break;
                                    }
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
                let mut neg = negative_cache.write().await;
                neg.insert(hash_clone.clone(), (Instant::now(), NEGATIVE_TTL_NETWORK));
                tx.send(Some(Err("Stream failed".to_string()))).ok();
                // Update host circuit breaker on stream failure
                if !url_host.is_empty() {
                    let mut circuits = host_circuits.write().await;
                    let state = circuits.entry(url_host.clone()).or_insert(HostCircuitState {
                        consecutive_failures: 0,
                        tripped_at: None,
                    });
                    state.consecutive_failures += 1;
                    if state.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD {
                        state.tripped_at = Some(Instant::now());
                    }
                }
            } else {
                // Wrap in Arc first to avoid cloning the full buffer for disk I/O
                let bytes_arc = Arc::new(all_bytes);

                // Write to disk cache (Arc clone = ref-count bump only)
                let bytes_for_disk = bytes_arc.clone();
                let ct_for_disk = ct_clone.clone();
                let dp = data_path.clone();
                let mp = meta_path.clone();
                tokio::task::spawn_blocking(move || {
                    std::fs::write(&dp, &*bytes_for_disk).ok();
                    std::fs::write(&mp, &ct_for_disk).ok();
                })
                .await
                .ok();

                // Store in memory cache if small enough
                let mem_bytes = if bytes_arc.len() <= MEMORY_CACHE_MAX_ITEM {
                    let mut state = mem_cache.write().await;
                    while state.total_size + bytes_arc.len() > MEMORY_CACHE_MAX_TOTAL
                        && !state.entries.is_empty()
                    {
                        if let Some((_key, removed)) = state.entries.pop_lru() {
                            state.total_size = state.total_size.saturating_sub(removed.data.len());
                        } else {
                            break;
                        }
                    }
                    if let Some(old) = state.entries.pop(&hash_clone) {
                        state.total_size = state.total_size.saturating_sub(old.data.len());
                    }
                    state.total_size += bytes_arc.len();
                    state.entries.push(
                        hash_clone.clone(),
                        MemEntry {
                            data: bytes_arc.clone(),
                            content_type: ct_clone.clone(),
                        },
                    );
                    Some(bytes_arc)
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

                // Reset host circuit breaker on success
                if !url_host.is_empty() {
                    host_circuits.write().await.remove(&url_host);
                }
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
        url: &str,
        hash: &str,
        tx: &watch::Sender<Option<Result<CacheEntry, String>>>,
        msg: &str,
        ttl: Duration,
    ) {
        let neg = self.negative_cache.clone();
        let inflight = self.inflight.clone();
        let host_circuits = self.host_circuits.clone();
        let host = Self::extract_host(url).unwrap_or_default();
        let hash = hash.to_string();
        let msg = msg.to_string();
        let tx_msg = msg.clone();
        tx.send(Some(Err(tx_msg))).ok();
        tokio::spawn(async move {
            neg.write()
                .await
                .insert(hash.clone(), (Instant::now(), ttl));
            inflight.lock().await.remove(&hash);
            // Update host circuit breaker
            if !host.is_empty() {
                let mut circuits = host_circuits.write().await;
                let state = circuits.entry(host).or_insert(HostCircuitState {
                    consecutive_failures: 0,
                    tripped_at: None,
                });
                state.consecutive_failures += 1;
                if state.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD {
                    state.tripped_at = Some(Instant::now());
                }
            }
        });
    }
}

pub fn hex_hash(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_hash_deterministic() {
        let a = hex_hash("https://example.com/image.png");
        let b = hex_hash("https://example.com/image.png");
        assert_eq!(a, b);
    }

    #[test]
    fn hex_hash_different_inputs() {
        let a = hex_hash("https://example.com/a.png");
        let b = hex_hash("https://example.com/b.png");
        assert_ne!(a, b);
    }

    #[test]
    fn hex_hash_is_64_chars() {
        let h = hex_hash("test");
        assert_eq!(h.len(), 64); // SHA256 = 32 bytes = 64 hex chars
    }

    #[test]
    fn image_cache_creates_dir() {
        let dir = tempfile::tempdir().unwrap();
        let _cache = ImageCache::new(dir.path());
        assert!(dir.path().join("image_cache").exists());
    }

    #[tokio::test]
    async fn check_cache_only_returns_none_for_http() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path());
        assert!(cache.check_cache_only("http://insecure.com/img.png").await.is_none());
    }

    #[tokio::test]
    async fn check_cache_only_miss() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path());
        assert!(cache.check_cache_only("https://example.com/missing.png").await.is_none());
    }

    #[tokio::test]
    async fn mem_cache_insert_and_retrieve() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path());
        let data = Arc::new(vec![1u8, 2, 3]);
        cache.insert_mem_cache("test-hash", &data, "image/png").await;

        let mut mem = cache.mem_cache.write().await;
        let entry = mem.entries.get("test-hash").unwrap();
        assert_eq!(entry.content_type, "image/png");
        assert_eq!(&**entry.data, &[1u8, 2, 3]);
    }

    #[tokio::test]
    async fn mem_cache_lru_eviction() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path());

        // Insert entries that fill the memory budget
        let big = Arc::new(vec![0u8; MEMORY_CACHE_MAX_TOTAL / 2]);
        cache.insert_mem_cache("a", &big, "image/png").await;
        cache.insert_mem_cache("b", &big, "image/png").await;

        // Third insert should evict "a"
        cache.insert_mem_cache("c", &big, "image/png").await;

        let mem = cache.mem_cache.read().await;
        assert!(mem.entries.peek("a").is_none(), "LRU entry 'a' should be evicted");
        assert!(mem.entries.peek("b").is_some() || mem.entries.peek("c").is_some());
    }

    #[tokio::test]
    async fn fetch_streaming_rejects_http() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ImageCache::new(dir.path());
        let result = cache.fetch_streaming("http://insecure.com/img.png").await;
        match result {
            Err(msg) => assert!(msg.contains("HTTPS")),
            Ok(_) => panic!("Expected error for HTTP URL"),
        }
    }
}
