use async_trait::async_trait;
use std::sync::LazyLock;

use super::{Plugin, PluginError, SummaryData};
use crate::ogp::Player;

static VIDEO_ID_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"/(sm|nm|so)\d+").unwrap());

pub struct NiconicoPlugin;
pub const PLUGIN: NiconicoPlugin = NiconicoPlugin;

#[async_trait]
impl Plugin for NiconicoPlugin {
    fn test(&self, url: &url::Url) -> bool {
        let host = url.host_str().unwrap_or("");
        let is_nico = host == "www.nicovideo.jp"
            || host == "nicovideo.jp"
            || host == "sp.nicovideo.jp"
            || host == "nico.ms";
        is_nico && VIDEO_ID_RE.is_match(url.path())
    }

    async fn summarize(
        &self,
        url: &url::Url,
        client: &reqwest::Client,
    ) -> Result<SummaryData, PluginError> {
        // Extract video ID from path
        let video_id = VIDEO_ID_RE
            .find(url.path())
            .map(|m| &m.as_str()[1..]) // strip leading '/'
            .ok_or_else(|| PluginError::ParseFailed("no video ID found".to_string()))?;

        // Fetch OGP from the page
        let resp = client
            .get(url.as_str())
            .header("Accept", "text/html")
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

        // Add embed player
        data.player = Some(Player {
            url: format!("https://embed.nicovideo.jp/watch/{video_id}"),
            width: Some(640),
            height: Some(360),
            allow: Vec::new(),
        });

        Ok(data)
    }
}
