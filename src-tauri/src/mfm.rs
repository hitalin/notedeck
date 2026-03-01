use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::OnceLock;

macro_rules! static_regex {
    ($pattern:expr) => {{
        static RE: OnceLock<Regex> = OnceLock::new();
        RE.get_or_init(|| Regex::new($pattern).unwrap())
    }};
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum MfmToken {
    #[serde(rename = "text")]
    Text { value: String },
    #[serde(rename = "url")]
    Url { value: String },
    #[serde(rename = "link")]
    Link { label: String, url: String },
    #[serde(rename = "mention")]
    Mention {
        username: String,
        host: Option<String>,
        acct: String,
    },
    #[serde(rename = "hashtag")]
    Hashtag { value: String },
    #[serde(rename = "bold")]
    Bold { value: String },
    #[serde(rename = "italic")]
    Italic { value: String },
    #[serde(rename = "strike")]
    Strike { value: String },
    #[serde(rename = "inlineCode")]
    InlineCode { value: String },
    #[serde(rename = "customEmoji")]
    CustomEmoji { shortcode: String },
    #[serde(rename = "unicodeEmoji")]
    UnicodeEmoji { value: String, url: String },
    #[serde(rename = "fn")]
    Fn {
        name: String,
        args: HashMap<String, serde_json::Value>,
        children: Vec<MfmToken>,
    },
    #[serde(rename = "small")]
    Small { children: Vec<MfmToken> },
    #[serde(rename = "center")]
    Center { children: Vec<MfmToken> },
    #[serde(rename = "plain")]
    Plain { value: String },
}

const TWEMOJI_BASE: &str = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@v15.1.0/assets/svg";

fn char_to_twemoji_url(emoji: &str) -> String {
    let codepoints: Vec<u32> = emoji.chars().map(|c| c as u32).collect();
    let has_zwj = codepoints.contains(&0x200D);
    let codes: Vec<String> = codepoints
        .iter()
        .filter(|&&cp| has_zwj || cp != 0xFE0F)
        .map(|cp| format!("{:x}", cp))
        .collect();
    format!("{}/{}.svg", TWEMOJI_BASE, codes.join("-"))
}

struct InlineMatch {
    start: usize,
    len: usize,
    token: MfmToken,
}

fn find_inline_code(text: &str) -> Option<InlineMatch> {
    let re = static_regex!(r"`([^`\n]+)`");
    re.find(text).map(|m| {
        let caps = re.captures(&text[m.start()..]).unwrap();
        InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::InlineCode {
                value: caps[1].to_string(),
            },
        }
    })
}

fn find_link(text: &str) -> Option<InlineMatch> {
    let re = static_regex!(r"\??\[([^\]]+)\]\((https?://[^\s)]+)\)");
    re.find(text).map(|m| {
        let caps = re.captures(&text[m.start()..]).unwrap();
        InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::Link {
                label: caps[1].to_string(),
                url: caps[2].to_string(),
            },
        }
    })
}

fn find_url(text: &str) -> Option<InlineMatch> {
    let re = static_regex!(r"https?://[\w\-.~:/?#\[\]@!$&'()*+,;=%]+");
    re.find(text).map(|m| InlineMatch {
        start: m.start(),
        len: m.len(),
        token: MfmToken::Url {
            value: m.as_str().to_string(),
        },
    })
}

fn find_custom_emoji(text: &str) -> Option<InlineMatch> {
    let re = static_regex!(r":([a-zA-Z0-9_]+(?:@[\w.\-]+)?):");
    re.find(text).map(|m| {
        let caps = re.captures(&text[m.start()..]).unwrap();
        InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::CustomEmoji {
                shortcode: caps[1].to_string(),
            },
        }
    })
}

fn find_bold(text: &str) -> Option<InlineMatch> {
    let re = static_regex!(r"\*\*(.+?)\*\*");
    re.find(text).map(|m| {
        let caps = re.captures(&text[m.start()..]).unwrap();
        InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::Bold {
                value: caps[1].to_string(),
            },
        }
    })
}

fn find_italic(text: &str) -> Option<InlineMatch> {
    // JS: /(?<!\*)\*([^*\n]+?)\*(?!\*)/g — no lookbehind in Rust regex
    let re = static_regex!(r"\*([^*\n]+?)\*");
    for m in re.find_iter(text) {
        let start = m.start();
        // Check: not preceded by '*' and not followed by '*'
        if start > 0 && text.as_bytes()[start - 1] == b'*' {
            continue;
        }
        let end = m.end();
        if end < text.len() && text.as_bytes()[end] == b'*' {
            continue;
        }
        let caps = re.captures(&text[start..]).unwrap();
        return Some(InlineMatch {
            start,
            len: m.len(),
            token: MfmToken::Italic {
                value: caps[1].to_string(),
            },
        });
    }
    None
}

fn find_strike(text: &str) -> Option<InlineMatch> {
    let re = static_regex!(r"~~(.+?)~~");
    re.find(text).map(|m| {
        let caps = re.captures(&text[m.start()..]).unwrap();
        InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::Strike {
                value: caps[1].to_string(),
            },
        }
    })
}

fn is_boundary(text: &str, byte_pos: usize) -> bool {
    if byte_pos == 0 {
        return true;
    }
    let prev = &text[..byte_pos];
    if let Some(ch) = prev.chars().next_back() {
        ch.is_whitespace() || ch == '('
    } else {
        true
    }
}

fn find_mention(text: &str) -> Option<InlineMatch> {
    // JS: /(?<=^|[\s(])@(\w+)(?:@([\w.-]+))?/g
    let re = static_regex!(r"@(\w+)(?:@([\w.\-]+))?");
    for m in re.find_iter(text) {
        if !is_boundary(text, m.start()) {
            continue;
        }
        let caps = re.captures(&text[m.start()..]).unwrap();
        let username = caps[1].to_string();
        let host = caps.get(2).map(|h| h.as_str().to_string());
        let acct = m.as_str().to_string();
        return Some(InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::Mention {
                username,
                host,
                acct,
            },
        });
    }
    None
}

fn find_hashtag(text: &str) -> Option<InlineMatch> {
    // JS: /(?<=^|[\s(])#([\w\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]+)/g
    let re = static_regex!(
        r"#([\w\u{3000}-\u{303f}\u{3040}-\u{309f}\u{30a0}-\u{30ff}\u{ff00}-\u{ffef}\u{4e00}-\u{9faf}]+)"
    );
    for m in re.find_iter(text) {
        if !is_boundary(text, m.start()) {
            continue;
        }
        let caps = re.captures(&text[m.start()..]).unwrap();
        return Some(InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::Hashtag {
                value: caps[1].to_string(),
            },
        });
    }
    None
}

fn find_unicode_emoji(text: &str) -> Option<InlineMatch> {
    let re = static_regex!(
        r"(?:\p{Emoji_Presentation}|\p{Emoji}\x{FE0F})(?:\x{200D}(?:\p{Emoji_Presentation}|\p{Emoji}\x{FE0F}))*"
    );
    // Filter out ASCII digits/symbols that match \p{Emoji}
    for m in re.find_iter(text) {
        let s = m.as_str();
        // Skip single ASCII characters that are technically emoji (0-9, #, *)
        if s.len() == 1 || (s.len() <= 3 && s.chars().next().map_or(false, |c| c.is_ascii())) {
            continue;
        }
        return Some(InlineMatch {
            start: m.start(),
            len: m.len(),
            token: MfmToken::UnicodeEmoji {
                url: char_to_twemoji_url(s),
                value: s.to_string(),
            },
        });
    }
    None
}

struct BlockMatch {
    index: usize,
    consume_length: usize,
    token: MfmToken,
}

fn parse_fn_block(text: &str, pos: usize) -> Option<(usize, MfmToken)> {
    let bytes = text.as_bytes();
    if pos + 1 >= bytes.len() || bytes[pos] != b'$' || bytes[pos + 1] != b'[' {
        return None;
    }
    let mut i = pos + 2;

    let re_name = static_regex!(r"^\w+");
    let after = &text[i..];
    let name_m = re_name.find(after)?;
    let name = name_m.as_str().to_string();
    i += name_m.len();

    let mut args: HashMap<String, serde_json::Value> = HashMap::new();
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        let re_args = static_regex!(r"^[^\s\]]+");
        if let Some(args_m) = re_args.find(&text[i..]) {
            for part in args_m.as_str().split(',') {
                if let Some(eq) = part.find('=') {
                    args.insert(
                        part[..eq].to_string(),
                        serde_json::Value::String(part[eq + 1..].to_string()),
                    );
                } else {
                    args.insert(part.to_string(), serde_json::Value::Bool(true));
                }
            }
            i += args_m.len();
        }
    }

    if i >= bytes.len() || bytes[i] != b' ' {
        return None;
    }
    i += 1;

    let mut depth = 1u32;
    let content_start = i;
    while i < bytes.len() && depth > 0 {
        if i + 1 < bytes.len() && bytes[i] == b'$' && bytes[i + 1] == b'[' {
            depth += 1;
            i += 2;
        } else if bytes[i] == b']' {
            depth -= 1;
            if depth == 0 {
                break;
            }
            i += 1;
        } else {
            i += 1;
        }
    }

    if depth != 0 {
        return None;
    }

    let content = &text[content_start..i];
    let end = i + 1;
    Some((
        end,
        MfmToken::Fn {
            name,
            args,
            children: parse_tokens(content),
        },
    ))
}

fn parse_tag_block(text: &str, pos: usize) -> Option<(usize, MfmToken)> {
    for tag in &["small", "center", "plain"] {
        let open = format!("<{}>", tag);
        let close = format!("</{}>", tag);
        if !text[pos..].starts_with(&open) {
            continue;
        }
        let after_open = pos + open.len();
        let close_idx = text[after_open..].find(&close)?;
        let content = &text[after_open..after_open + close_idx];
        let end = after_open + close_idx + close.len();
        let token = match *tag {
            "plain" => MfmToken::Plain {
                value: content.to_string(),
            },
            "small" => MfmToken::Small {
                children: parse_tokens(content),
            },
            "center" => MfmToken::Center {
                children: parse_tokens(content),
            },
            _ => unreachable!(),
        };
        return Some((end, token));
    }
    None
}

fn find_first_block(
    text: &str,
    needle: &str,
    try_parse: fn(&str, usize) -> Option<(usize, MfmToken)>,
) -> Option<BlockMatch> {
    let mut from = 0;
    while from < text.len() {
        if let Some(idx) = text[from..].find(needle) {
            let abs_idx = from + idx;
            if let Some((end, token)) = try_parse(text, abs_idx) {
                return Some(BlockMatch {
                    index: abs_idx,
                    consume_length: end - abs_idx,
                    token,
                });
            }
            from = abs_idx + 1;
        } else {
            break;
        }
    }
    None
}

fn parse_tokens(text: &str) -> Vec<MfmToken> {
    if text.is_empty() {
        return Vec::new();
    }

    let mut tokens: Vec<MfmToken> = Vec::new();
    let mut remaining = text;

    while !remaining.is_empty() {
        let mut earliest_idx = usize::MAX;
        let mut earliest_len = 0usize;
        let mut earliest_token: Option<MfmToken> = None;

        // Block-level patterns
        let block_candidates = [
            find_first_block(remaining, "$[", parse_fn_block),
            find_first_block(remaining, "<small>", parse_tag_block),
            find_first_block(remaining, "<center>", parse_tag_block),
            find_first_block(remaining, "<plain>", parse_tag_block),
        ];
        for c in block_candidates.into_iter().flatten() {
            if c.index < earliest_idx {
                earliest_idx = c.index;
                earliest_len = c.consume_length;
                earliest_token = Some(c.token);
            }
        }

        // Inline patterns — order matches TS priority
        let inline_finders: &[fn(&str) -> Option<InlineMatch>] = &[
            find_inline_code,
            find_link,
            find_url,
            find_custom_emoji,
            find_bold,
            find_italic,
            find_strike,
            find_mention,
            find_hashtag,
            find_unicode_emoji,
        ];
        for finder in inline_finders {
            if let Some(im) = finder(remaining) {
                if im.start < earliest_idx {
                    earliest_idx = im.start;
                    earliest_len = im.len;
                    earliest_token = Some(im.token);
                }
            }
        }

        match earliest_token {
            None => {
                tokens.push(MfmToken::Text {
                    value: remaining.to_string(),
                });
                break;
            }
            Some(token) => {
                if earliest_idx > 0 {
                    tokens.push(MfmToken::Text {
                        value: remaining[..earliest_idx].to_string(),
                    });
                }
                tokens.push(token);
                remaining = &remaining[earliest_idx + earliest_len..];
            }
        }
    }

    tokens
}

const MAX_MFM_LENGTH: usize = 10000;

pub fn parse_mfm(text: &str) -> Vec<MfmToken> {
    if text.is_empty() {
        return Vec::new();
    }
    if text.len() > MAX_MFM_LENGTH {
        return vec![MfmToken::Text {
            value: text.to_string(),
        }];
    }
    parse_tokens(text)
}

#[tauri::command]
pub fn parse_mfm_batch(texts: Vec<String>) -> Vec<Vec<MfmToken>> {
    texts.iter().map(|t| parse_mfm(t)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plain_text() {
        let tokens = parse_mfm("hello world");
        assert_eq!(tokens.len(), 1);
        assert!(matches!(&tokens[0], MfmToken::Text { value } if value == "hello world"));
    }

    #[test]
    fn test_bold() {
        let tokens = parse_mfm("before **bold** after");
        assert_eq!(tokens.len(), 3);
        assert!(matches!(&tokens[1], MfmToken::Bold { value } if value == "bold"));
    }

    #[test]
    fn test_italic() {
        let tokens = parse_mfm("before *italic* after");
        assert_eq!(tokens.len(), 3);
        assert!(matches!(&tokens[1], MfmToken::Italic { value } if value == "italic"));
    }

    #[test]
    fn test_bold_not_italic() {
        let tokens = parse_mfm("**bold**");
        assert_eq!(tokens.len(), 1);
        assert!(matches!(&tokens[0], MfmToken::Bold { .. }));
    }

    #[test]
    fn test_inline_code() {
        let tokens = parse_mfm("say `hello`!");
        assert_eq!(tokens.len(), 3);
        assert!(matches!(&tokens[1], MfmToken::InlineCode { value } if value == "hello"));
    }

    #[test]
    fn test_url() {
        let tokens = parse_mfm("visit https://example.com ok");
        assert_eq!(tokens.len(), 3);
        assert!(matches!(&tokens[1], MfmToken::Url { value } if value == "https://example.com"));
    }

    #[test]
    fn test_link() {
        let tokens = parse_mfm("[label](https://example.com)");
        assert_eq!(tokens.len(), 1);
        assert!(
            matches!(&tokens[0], MfmToken::Link { label, url } if label == "label" && url == "https://example.com")
        );
    }

    #[test]
    fn test_mention() {
        let tokens = parse_mfm("hello @user@host.example");
        assert_eq!(tokens.len(), 2);
        assert!(
            matches!(&tokens[1], MfmToken::Mention { username, host, .. } if username == "user" && host.as_deref() == Some("host.example"))
        );
    }

    #[test]
    fn test_mention_boundary() {
        let tokens = parse_mfm("email@example.com");
        // Should not parse as mention because 'l' is not boundary
        assert_eq!(tokens.len(), 1);
        assert!(matches!(
            &tokens[0],
            MfmToken::Text { .. } | MfmToken::Url { .. }
        ));
    }

    #[test]
    fn test_hashtag() {
        let tokens = parse_mfm("post #tag here");
        assert_eq!(tokens.len(), 3);
        assert!(matches!(&tokens[1], MfmToken::Hashtag { value } if value == "tag"));
    }

    #[test]
    fn test_custom_emoji() {
        let tokens = parse_mfm("hello :emoji_name: world");
        assert_eq!(tokens.len(), 3);
        assert!(
            matches!(&tokens[1], MfmToken::CustomEmoji { shortcode } if shortcode == "emoji_name")
        );
    }

    #[test]
    fn test_strike() {
        let tokens = parse_mfm("~~deleted~~");
        assert_eq!(tokens.len(), 1);
        assert!(matches!(&tokens[0], MfmToken::Strike { value } if value == "deleted"));
    }

    #[test]
    fn test_fn_block() {
        let tokens = parse_mfm("$[spin hello]");
        assert_eq!(tokens.len(), 1);
        if let MfmToken::Fn { name, children, .. } = &tokens[0] {
            assert_eq!(name, "spin");
            assert_eq!(children.len(), 1);
        } else {
            panic!("Expected Fn token");
        }
    }

    #[test]
    fn test_fn_with_args() {
        let tokens = parse_mfm("$[spin.speed=2s,direction text]");
        assert_eq!(tokens.len(), 1);
        if let MfmToken::Fn { name, args, .. } = &tokens[0] {
            assert_eq!(name, "spin");
            assert_eq!(
                args.get("speed"),
                Some(&serde_json::Value::String("2s".to_string()))
            );
            assert_eq!(args.get("direction"), Some(&serde_json::Value::Bool(true)));
        } else {
            panic!("Expected Fn token");
        }
    }

    #[test]
    fn test_plain_tag() {
        let tokens = parse_mfm("<plain>**not bold**</plain>");
        assert_eq!(tokens.len(), 1);
        assert!(matches!(&tokens[0], MfmToken::Plain { value } if value == "**not bold**"));
    }

    #[test]
    fn test_small_tag() {
        let tokens = parse_mfm("<small>tiny</small>");
        assert_eq!(tokens.len(), 1);
        if let MfmToken::Small { children } = &tokens[0] {
            assert_eq!(children.len(), 1);
            assert!(matches!(&children[0], MfmToken::Text { value } if value == "tiny"));
        } else {
            panic!("Expected Small token");
        }
    }

    #[test]
    fn test_center_tag() {
        let tokens = parse_mfm("<center>middle</center>");
        assert_eq!(tokens.len(), 1);
        if let MfmToken::Center { children } = &tokens[0] {
            assert_eq!(children.len(), 1);
        } else {
            panic!("Expected Center token");
        }
    }

    #[test]
    fn test_twemoji_url() {
        let url = char_to_twemoji_url("😀");
        assert!(url.ends_with("/1f600.svg"));
    }

    #[test]
    fn test_max_length() {
        let long = "a".repeat(MAX_MFM_LENGTH + 1);
        let tokens = parse_mfm(&long);
        assert_eq!(tokens.len(), 1);
        assert!(matches!(&tokens[0], MfmToken::Text { .. }));
    }

    #[test]
    fn test_batch() {
        let results = parse_mfm_batch(vec!["hello".to_string(), "**bold**".to_string()]);
        assert_eq!(results.len(), 2);
        assert!(matches!(&results[0][0], MfmToken::Text { .. }));
        assert!(matches!(&results[1][0], MfmToken::Bold { .. }));
    }
}
