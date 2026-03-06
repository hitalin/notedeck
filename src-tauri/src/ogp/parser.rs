use scraper::{Html, Selector};
use std::sync::LazyLock;

use super::SummaryData;

static OG_TITLE: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[property='og:title']").unwrap());
static OG_DESC: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[property='og:description']").unwrap());
static OG_IMAGE: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[property='og:image']").unwrap());
static OG_SITE: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[property='og:site_name']").unwrap());
static OG_VIDEO_URL: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("meta[property='og:video'], meta[property='og:video:url'], meta[property='og:video:secure_url']").unwrap()
});
static OG_VIDEO_WIDTH: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[property='og:video:width']").unwrap());
static OG_VIDEO_HEIGHT: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[property='og:video:height']").unwrap());
static TITLE_SEL: LazyLock<Selector> = LazyLock::new(|| Selector::parse("title").unwrap());
static DESC_SEL: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[name='description']").unwrap());
static TWITTER_CARD: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[name='twitter:card']").unwrap());
static TWITTER_PLAYER: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[name='twitter:player']").unwrap());
static TWITTER_PLAYER_WIDTH: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[name='twitter:player:width']").unwrap());
static TWITTER_PLAYER_HEIGHT: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[name='twitter:player:height']").unwrap());
static OEMBED_LINK: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("link[type='application/json+oembed']").unwrap());
static MIXI_CONTENT_RATING: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("meta[property='mixi:content-rating']").unwrap());
static ICON_SEL: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']")
        .unwrap()
});

/// Parse an HTML document into a SummaryData struct.
/// `final_url` is the URL after any redirects.
pub fn parse_html(html: &str, final_url: &str) -> SummaryData {
    let document = Html::parse_document(html);

    let get_content = |sel: &Selector| -> Option<String> {
        document
            .select(sel)
            .next()
            .and_then(|el| el.value().attr("content"))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    let title = get_content(&OG_TITLE).or_else(|| {
        document
            .select(&TITLE_SEL)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty())
    });

    let description = get_content(&OG_DESC).or_else(|| get_content(&DESC_SEL));

    let sitename = get_content(&OG_SITE);

    // Collect all og:image URLs (HTTPS only)
    let medias: Vec<String> = document
        .select(&OG_IMAGE)
        .filter_map(|el| el.value().attr("content"))
        .map(|s| s.trim().to_string())
        .filter(|u| u.starts_with("https://"))
        .collect();
    let thumbnail = medias.first().cloned();

    // Player detection: og:video → twitter:player (same priority as summaly)
    let player = get_content(&OG_VIDEO_URL)
        .filter(|u| u.starts_with("https://"))
        .map(|video_url| {
            let width = get_content(&OG_VIDEO_WIDTH).and_then(|w| w.parse().ok());
            let height = get_content(&OG_VIDEO_HEIGHT).and_then(|h| h.parse().ok());
            super::Player {
                url: video_url,
                width,
                height,
                allow: default_player_allow(),
            }
        })
        .or_else(|| {
            // twitter:player (skip if card is summary_large_image)
            let card = get_content(&TWITTER_CARD).unwrap_or_default();
            if card == "summary_large_image" {
                return None;
            }
            get_content(&TWITTER_PLAYER)
                .filter(|u| u.starts_with("https://"))
                .map(|player_url| {
                    let width = get_content(&TWITTER_PLAYER_WIDTH).and_then(|w| w.parse().ok());
                    let height = get_content(&TWITTER_PLAYER_HEIGHT).and_then(|h| h.parse().ok());
                    super::Player {
                        url: player_url,
                        width,
                        height,
                        allow: default_player_allow(),
                    }
                })
        });

    // Sensitive detection via mixi:content-rating
    let sensitive = get_content(&MIXI_CONTENT_RATING)
        .map(|r| r != "1")
        .unwrap_or(false);

    // Favicon: resolve relative URLs against final_url
    let icon = document
        .select(&ICON_SEL)
        .next()
        .and_then(|el| el.value().attr("href"))
        .map(|href| resolve_url(href, final_url))
        .filter(|u| u.starts_with("https://"));

    SummaryData {
        title,
        description,
        icon,
        sitename,
        thumbnail,
        medias,
        player,
        url: final_url.to_string(),
        sensitive,
    }
}

/// Extract oEmbed endpoint URL from HTML `<link>` tag (if present).
pub fn extract_oembed_url(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    document
        .select(&OEMBED_LINK)
        .next()
        .and_then(|el| el.value().attr("href"))
        .map(|s| s.trim().to_string())
        .filter(|s| s.starts_with("https://") || s.starts_with("http://"))
}

/// Default `allow` attributes for player iframes (matches summaly).
pub fn default_player_allow() -> Vec<String> {
    vec![
        "autoplay".to_string(),
        "encrypted-media".to_string(),
        "fullscreen".to_string(),
    ]
}

/// Resolve a potentially relative URL against a base URL.
fn resolve_url(href: &str, base: &str) -> String {
    if href.starts_with("https://") || href.starts_with("http://") {
        return href.to_string();
    }
    if href.starts_with("//") {
        return format!("https:{href}");
    }
    // Try to parse as relative URL
    if let Ok(base_url) = url::Url::parse(base) {
        if let Ok(resolved) = base_url.join(href) {
            return resolved.to_string();
        }
    }
    href.to_string()
}
