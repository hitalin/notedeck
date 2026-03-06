use async_trait::async_trait;
use std::fmt;

use super::SummaryData;

/// Error type for plugin operations.
#[derive(Debug)]
pub enum PluginError {
    /// The fetched URL returned a non-success HTTP status.
    HttpStatus(u16),
    /// Network or connection error.
    FetchFailed(String),
    /// Failed to parse the response body.
    ParseFailed(String),
}

impl fmt::Display for PluginError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::HttpStatus(code) => write!(f, "HTTP {code}"),
            Self::FetchFailed(msg) => write!(f, "fetch failed: {msg}"),
            Self::ParseFailed(msg) => write!(f, "parse failed: {msg}"),
        }
    }
}

/// A plugin that handles specific URL patterns.
///
/// # Adding a new plugin
///
/// 1. Create a new file under `plugins/` (e.g. `plugins/youtube.rs`)
/// 2. Define a unit struct and implement this trait:
///
/// ```ignore
/// pub struct YouTubePlugin;
/// pub const PLUGIN: YouTubePlugin = YouTubePlugin;
///
/// #[async_trait]
/// impl Plugin for YouTubePlugin {
///     fn test(&self, url: &url::Url) -> bool {
///         matches!(url.host_str(), Some("www.youtube.com" | "youtube.com" | "youtu.be"))
///     }
///
///     async fn summarize(&self, url: &url::Url, client: &reqwest::Client)
///         -> Result<SummaryData, PluginError>
///     {
///         // fetch oEmbed, build SummaryData ...
///     }
/// }
/// ```
///
/// 3. Add `mod youtube;` and `&youtube::PLUGIN` to [`all()`] below.
#[async_trait]
pub trait Plugin: Send + Sync {
    /// Return `true` if this plugin handles the given URL.
    fn test(&self, url: &url::Url) -> bool;

    /// Fetch and return summary data for the URL.
    /// Only called when [`test`] returned `true`.
    async fn summarize(
        &self,
        url: &url::Url,
        client: &reqwest::Client,
    ) -> Result<SummaryData, PluginError>;
}

/// All registered plugins, tried in order.
pub fn all() -> &'static [&'static dyn Plugin] {
    &[]
}

// --- oEmbed helpers ---

/// Shared oEmbed response structure for plugins that use oEmbed endpoints.
#[derive(Debug, serde::Deserialize)]
pub struct OEmbedResponse {
    pub title: Option<String>,
    pub author_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub provider_name: Option<String>,
    pub html: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Fetch an oEmbed JSON response from the given endpoint URL.
pub async fn fetch_oembed(
    client: &reqwest::Client,
    endpoint: &str,
) -> Result<OEmbedResponse, PluginError> {
    let resp = client
        .get(endpoint)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| PluginError::FetchFailed(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(PluginError::HttpStatus(resp.status().as_u16()));
    }

    resp.json()
        .await
        .map_err(|e| PluginError::ParseFailed(e.to_string()))
}
