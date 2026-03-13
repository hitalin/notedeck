use async_trait::async_trait;
use scraper::{Html, Selector};
use std::sync::LazyLock;

use super::{Plugin, PluginError, SummaryData};

static LANDING_IMAGE: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("#landingImage, #imgBlkFront, #ebooksImgBlkFront").unwrap());

static JSON_LD: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("script[type='application/ld+json']").unwrap());

pub struct AmazonPlugin;
pub const PLUGIN: AmazonPlugin = AmazonPlugin;

const AMAZON_SUFFIXES: &[&str] = &[
    "amazon.co.jp",
    "amazon.com",
    "amazon.co.uk",
    "amazon.de",
    "amazon.fr",
    "amazon.it",
    "amazon.es",
    "amazon.ca",
    "amazon.com.au",
    "amazon.in",
    "amazon.com.br",
    "amazon.sg",
];

const SHORTLINK_HOSTS: &[&str] = &["amzn.to", "amzn.asia"];

fn is_amazon_host(host: &str) -> bool {
    let bare = host.strip_prefix("www.").unwrap_or(host);
    AMAZON_SUFFIXES.contains(&bare)
}

fn is_shortlink(host: &str) -> bool {
    SHORTLINK_HOSTS.contains(&host)
}

#[async_trait]
impl Plugin for AmazonPlugin {
    fn test(&self, url: &url::Url) -> bool {
        url.host_str()
            .is_some_and(|h| is_amazon_host(h) || is_shortlink(h))
    }

    async fn summarize(
        &self,
        url: &url::Url,
        client: &reqwest::Client,
    ) -> Result<SummaryData, PluginError> {
        let fetch_url = if url.host_str().is_some_and(is_shortlink) {
            resolve_shortlink(client, url.as_str()).await?
        } else {
            canonicalize(url)
        };

        let resp = client
            .get(&fetch_url)
            .header("Accept", "text/html,application/xhtml+xml")
            .header("Accept-Language", "ja,en;q=0.9")
            .send()
            .await
            .map_err(|e| PluginError::FetchFailed(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(PluginError::HttpStatus(resp.status().as_u16()));
        }

        let final_url = resp.url().to_string();
        let html = resp
            .text()
            .await
            .map_err(|e| PluginError::FetchFailed(e.to_string()))?;

        let mut data = crate::ogp::parser::parse_html(&html, &final_url);

        if data.thumbnail.is_none() {
            data.thumbnail = extract_product_image(&html);
        }
        if let Some(ref title) = data.title {
            data.title = Some(clean_title(title));
        }
        if data.sitename.is_none() {
            data.sitename = Some(make_sitename(&final_url));
        }

        Ok(data)
    }
}

// --- URL helpers ---

/// HEAD-follow redirects from a short-link, then canonicalize the resolved URL.
async fn resolve_shortlink(
    client: &reqwest::Client,
    short_url: &str,
) -> Result<String, PluginError> {
    let resp = client
        .head(short_url)
        .send()
        .await
        .map_err(|e| PluginError::FetchFailed(e.to_string()))?;

    let resolved = url::Url::parse(resp.url().as_str())
        .map_err(|e| PluginError::ParseFailed(e.to_string()))?;

    Ok(canonicalize(&resolved))
}

/// Strip tracking params and normalize to `/dp/{ASIN}` when possible.
fn canonicalize(url: &url::Url) -> String {
    if let Some(asin) = extract_asin(url.path()) {
        let host = url.host_str().unwrap_or("www.amazon.com");
        return format!("https://{host}/dp/{asin}");
    }
    let mut clean = url.clone();
    clean.set_query(None);
    clean.set_fragment(None);
    clean.to_string()
}

fn extract_asin(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    for (i, seg) in segments.iter().enumerate() {
        if (*seg == "dp" || *seg == "product") && i + 1 < segments.len() {
            let candidate = segments[i + 1];
            if candidate.len() == 10 && candidate.chars().all(|c| c.is_ascii_alphanumeric()) {
                return Some(candidate);
            }
        }
    }
    None
}

// --- Image extraction ---

fn extract_product_image(html: &str) -> Option<String> {
    let document = Html::parse_document(html);

    image_from_landing(&document).or_else(|| image_from_jsonld(&document))
}

fn image_from_landing(doc: &Html) -> Option<String> {
    let img = doc.select(&LANDING_IMAGE).next()?;
    let el = img.value();

    // data-old-hires (high-res) → src → data-a-dynamic-image (JSON)
    el.attr("data-old-hires")
        .filter(|s| !s.is_empty())
        .or_else(|| el.attr("src"))
        .map(|s| s.trim().to_string())
        .filter(|u| u.starts_with("https://"))
        .or_else(|| {
            let json_str = el.attr("data-a-dynamic-image")?;
            let map: serde_json::Map<String, serde_json::Value> =
                serde_json::from_str(json_str).ok()?;
            map.into_iter()
                .filter(|(url, _)| url.starts_with("https://"))
                .max_by_key(|(_, dims)| {
                    dims.as_array()
                        .and_then(|a| a.first())
                        .and_then(|w| w.as_u64())
                        .unwrap_or(0)
                })
                .map(|(url, _)| url)
        })
}

fn image_from_jsonld(doc: &Html) -> Option<String> {
    for el in doc.select(&JSON_LD) {
        let text: String = el.text().collect();
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };

        let is_product =
            |v: &serde_json::Value| v.get("@type").and_then(|t| t.as_str()) == Some("Product");

        let product = if is_product(&json) {
            &json
        } else if let Some(p) = json
            .get("@graph")
            .and_then(|g| g.as_array())
            .and_then(|arr| arr.iter().find(|v| is_product(v)))
        {
            p
        } else {
            continue;
        };

        let img = match product.get("image") {
            Some(v) => v,
            None => continue,
        };
        let url = img
            .as_str()
            .map(String::from)
            .or_else(|| img.as_array()?.first()?.as_str().map(String::from));
        if let Some(url) = url.filter(|u| u.starts_with("https://")) {
            return Some(url);
        }
    }
    None
}

// --- Text helpers ---

fn clean_title(title: &str) -> String {
    let title = title.trim();
    // Remove "Amazon.co.jp: " or "Amazon.com: " prefix
    if let Some(rest) = title.strip_prefix("Amazon") {
        if let Some(idx) = rest.find(": ") {
            return rest[idx + 2..].trim().to_string();
        }
    }
    title.to_string()
}

fn make_sitename(final_url: &str) -> String {
    let host = url::Url::parse(final_url)
        .ok()
        .and_then(|u| u.host_str().map(String::from))
        .unwrap_or_else(|| "amazon.com".to_string());
    let bare = host.strip_prefix("www.").unwrap_or(&host);
    let region = bare.strip_prefix("amazon.").unwrap_or(bare);
    format!("Amazon ({region})")
}
