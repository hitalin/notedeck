use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{watch, Mutex};

const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_ENTRIES: usize = 2048;
const MAX_HTML_SIZE: usize = 2 * 1024 * 1024;
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize)]
pub struct OgpData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub site_name: Option<String>,
}

struct CacheEntry {
    data: OgpData,
    fetched_at: Instant,
}

type InflightMap = HashMap<String, watch::Receiver<Option<Result<OgpData, String>>>>;

pub struct OgpCache {
    cache: Arc<Mutex<HashMap<String, CacheEntry>>>,
    inflight: Arc<Mutex<InflightMap>>,
    http_client: reqwest::Client,
}

impl OgpCache {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(FETCH_TIMEOUT)
            .user_agent(format!("Mozilla/5.0 (compatible; NoteDeck/{})", env!("CARGO_PKG_VERSION")))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_default();

        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            inflight: Arc::new(Mutex::new(HashMap::new())),
            http_client,
        }
    }

    pub async fn get_ogp(&self, url: &str) -> Result<OgpData, String> {
        if !url.starts_with("https://") {
            return Err("Only HTTPS URLs are allowed".to_string());
        }

        // Cache hit
        {
            let cache = self.cache.lock().await;
            if let Some(entry) = cache.get(url) {
                if entry.fetched_at.elapsed() < CACHE_TTL {
                    return Ok(entry.data.clone());
                }
            }
        }

        // Inflight dedup
        let mut inflight = self.inflight.lock().await;
        if let Some(rx) = inflight.get(url) {
            let mut rx = rx.clone();
            drop(inflight);
            while rx.changed().await.is_ok() {
                if let Some(result) = rx.borrow().as_ref() {
                    return result.clone();
                }
            }
            return Err("Inflight request dropped".to_string());
        }

        let (tx, rx) = watch::channel(None);
        inflight.insert(url.to_string(), rx);
        drop(inflight);

        let result = self.fetch_and_parse(url).await;

        if let Ok(ref data) = result {
            self.store_cache(url, data).await;
        }

        tx.send(Some(result.clone())).ok();
        self.inflight.lock().await.remove(url);

        result
    }

    /// Try fetching OGP via Misskey server's /api/url endpoint first,
    /// falling back to direct self-fetch on failure.
    pub async fn get_ogp_via_server(
        &self,
        url: &str,
        host: &str,
        token: &str,
    ) -> Result<OgpData, String> {
        if !url.starts_with("https://") {
            return Err("Only HTTPS URLs are allowed".to_string());
        }

        // Check local cache first (shared with self-fetch)
        {
            let cache = self.cache.lock().await;
            if let Some(entry) = cache.get(url) {
                if entry.fetched_at.elapsed() < CACHE_TTL {
                    return Ok(entry.data.clone());
                }
            }
        }

        // Try server's summary proxy
        match self.fetch_from_server(url, host, token).await {
            Ok(data) => {
                self.store_cache(url, &data).await;
                Ok(data)
            }
            Err(_) => {
                // Fallback to self-fetch
                self.get_ogp(url).await
            }
        }
    }

    async fn fetch_from_server(
        &self,
        url: &str,
        host: &str,
        token: &str,
    ) -> Result<OgpData, String> {
        let body = serde_json::json!({ "i": token, "url": url });
        let resp = self
            .http_client
            .post(format!("https://{host}/api/url"))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Server OGP fetch failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("Server OGP HTTP {}", resp.status()));
        }

        let server_data: ServerUrlResponse = resp
            .json()
            .await
            .map_err(|e| format!("Server OGP parse failed: {e}"))?;

        Ok(OgpData {
            title: server_data.title,
            description: server_data.description,
            image: server_data.thumbnail.filter(|u| u.starts_with("https://")),
            site_name: server_data.sitename,
        })
    }

    async fn store_cache(&self, url: &str, data: &OgpData) {
        let mut cache = self.cache.lock().await;
        if cache.len() >= MAX_ENTRIES {
            if let Some(oldest) = cache
                .iter()
                .min_by_key(|(_, v)| v.fetched_at)
                .map(|(k, _)| k.clone())
            {
                cache.remove(&oldest);
            }
        }
        cache.insert(
            url.to_string(),
            CacheEntry {
                data: data.clone(),
                fetched_at: Instant::now(),
            },
        );
    }

    async fn fetch_and_parse(&self, url: &str) -> Result<OgpData, String> {
        let resp = self
            .http_client
            .get(url)
            .header("Accept", "text/html")
            .send()
            .await
            .map_err(|e| format!("Fetch failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }

        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content_type.contains("text/html") && !content_type.contains("application/xhtml") {
            return Err("Not an HTML page".to_string());
        }

        if let Some(cl) = resp.content_length() {
            if cl > MAX_HTML_SIZE as u64 {
                return Err("Page too large".to_string());
            }
        }

        let bytes = resp.bytes().await.map_err(|e| format!("Read failed: {e}"))?;
        if bytes.len() > MAX_HTML_SIZE {
            return Err("Page too large".to_string());
        }

        let html = String::from_utf8_lossy(&bytes);
        Ok(parse_ogp(&html))
    }
}

/// Response from Misskey's POST /api/url endpoint
#[derive(Debug, Deserialize)]
struct ServerUrlResponse {
    title: Option<String>,
    description: Option<String>,
    thumbnail: Option<String>,
    sitename: Option<String>,
}

fn parse_ogp(html: &str) -> OgpData {
    use scraper::{Html, Selector};

    let document = Html::parse_document(html);

    let og_title = Selector::parse("meta[property='og:title']").unwrap();
    let og_desc = Selector::parse("meta[property='og:description']").unwrap();
    let og_image = Selector::parse("meta[property='og:image']").unwrap();
    let og_site = Selector::parse("meta[property='og:site_name']").unwrap();
    let title_sel = Selector::parse("title").unwrap();
    let desc_sel = Selector::parse("meta[name='description']").unwrap();

    let get_content = |sel: &Selector| -> Option<String> {
        document
            .select(sel)
            .next()
            .and_then(|el| el.value().attr("content"))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    let title = get_content(&og_title).or_else(|| {
        document
            .select(&title_sel)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty())
    });

    let description = get_content(&og_desc).or_else(|| get_content(&desc_sel));

    let image = get_content(&og_image).filter(|url| url.starts_with("https://"));

    let site_name = get_content(&og_site);

    OgpData {
        title,
        description,
        image,
        site_name,
    }
}
