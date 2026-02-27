use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// --- DB models ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub host: String,
    pub token: String,
    pub user_id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub software: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredServer {
    pub host: String,
    pub software: String,
    pub version: String,
    pub features_json: String,
    pub updated_at: i64,
}

// --- Normalized models (sent to frontend via IPC) ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedNote {
    pub id: String,
    #[serde(rename = "_accountId")]
    pub account_id: String,
    #[serde(rename = "_serverHost")]
    pub server_host: String,
    pub created_at: String,
    pub text: Option<String>,
    pub cw: Option<String>,
    pub user: NormalizedUser,
    pub visibility: String,
    #[serde(default)]
    pub emojis: HashMap<String, String>,
    #[serde(default)]
    pub reaction_emojis: HashMap<String, String>,
    #[serde(default)]
    pub reactions: HashMap<String, i64>,
    pub my_reaction: Option<String>,
    pub renote_count: i64,
    pub replies_count: i64,
    #[serde(default)]
    pub files: Vec<NormalizedDriveFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poll: Option<NormalizedPoll>,
    #[serde(default)]
    pub is_favorited: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply: Option<Box<NormalizedNote>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub renote: Option<Box<NormalizedNote>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedUser {
    pub id: String,
    pub username: String,
    pub host: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub is_bot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedUserDetail {
    pub id: String,
    pub username: String,
    pub host: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub followers_count: i64,
    #[serde(default)]
    pub following_count: i64,
    #[serde(default)]
    pub notes_count: i64,
    #[serde(default)]
    pub is_bot: bool,
    #[serde(default)]
    pub is_cat: bool,
    #[serde(default)]
    pub is_following: bool,
    #[serde(default)]
    pub is_followed: bool,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedPoll {
    pub choices: Vec<NormalizedPollChoice>,
    #[serde(default)]
    pub multiple: bool,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedPollChoice {
    pub text: String,
    #[serde(default)]
    pub votes: i64,
    #[serde(default)]
    pub is_voted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedDriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub url: String,
    pub thumbnail_url: Option<String>,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub is_sensitive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedNotification {
    pub id: String,
    #[serde(rename = "_accountId")]
    pub account_id: String,
    #[serde(rename = "_serverHost")]
    pub server_host: String,
    pub created_at: String,
    #[serde(rename = "type")]
    pub notification_type: String,
    pub user: Option<NormalizedUser>,
    pub note: Option<NormalizedNote>,
    pub reaction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteParams {
    pub text: Option<String>,
    pub cw: Option<String>,
    pub visibility: Option<String>,
    pub reply_id: Option<String>,
    pub renote_id: Option<String>,
    pub file_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(transparent)]
pub struct TimelineType(String);

impl TimelineType {
    pub fn api_endpoint(&self) -> String {
        match self.0.as_str() {
            "home" => "notes/timeline".to_string(),
            "local" => "notes/local-timeline".to_string(),
            "social" => "notes/hybrid-timeline".to_string(),
            "global" => "notes/global-timeline".to_string(),
            other => format!("notes/{other}-timeline"),
        }
    }

    pub fn ws_channel(&self) -> String {
        match self.0.as_str() {
            "home" => "homeTimeline".to_string(),
            "local" => "localTimeline".to_string(),
            "social" => "hybridTimeline".to_string(),
            "global" => "globalTimeline".to_string(),
            other => format!("{other}Timeline"),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineFilter {
    pub with_renotes: Option<bool>,
    pub with_replies: Option<bool>,
    pub with_files: Option<bool>,
    pub with_bots: Option<bool>,
    pub with_sensitive: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineOptions {
    #[serde(default = "default_limit")]
    limit: i64,
    pub since_id: Option<String>,
    pub until_id: Option<String>,
    #[serde(default)]
    pub filters: Option<TimelineFilter>,
}

impl TimelineOptions {
    /// Returns limit clamped to 1..=100
    pub fn limit(&self) -> i64 {
        self.limit.clamp(1, 100)
    }
}

impl Default for TimelineOptions {
    fn default() -> Self {
        Self {
            limit: 20,
            since_id: None,
            until_id: None,
            filters: None,
        }
    }
}

fn default_limit() -> i64 {
    20
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    #[serde(default = "default_limit")]
    limit: i64,
    pub since_id: Option<String>,
    pub until_id: Option<String>,
}

impl SearchOptions {
    pub fn limit(&self) -> i64 {
        self.limit.clamp(1, 100)
    }
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            limit: 20,
            since_id: None,
            until_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub session_id: String,
    pub url: String,
    pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub token: String,
    pub user: NormalizedUser,
}

// --- Raw Misskey API response types (for deserialization) ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawNote {
    pub id: String,
    pub created_at: String,
    pub text: Option<String>,
    pub cw: Option<String>,
    pub user: RawUser,
    #[serde(default)]
    pub visibility: String,
    #[serde(default)]
    pub emojis: HashMap<String, String>,
    #[serde(default)]
    pub reaction_emojis: HashMap<String, String>,
    #[serde(default)]
    pub reactions: HashMap<String, i64>,
    pub my_reaction: Option<String>,
    #[serde(default)]
    pub renote_count: i64,
    #[serde(default)]
    pub replies_count: i64,
    #[serde(default)]
    pub files: Vec<RawDriveFile>,
    pub poll: Option<RawPoll>,
    #[serde(default)]
    pub is_favorited: bool,
    pub reply: Option<Box<RawNote>>,
    pub renote: Option<Box<RawNote>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawUser {
    pub id: String,
    pub username: String,
    pub host: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub is_bot: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawPoll {
    pub choices: Vec<RawPollChoice>,
    #[serde(default)]
    pub multiple: bool,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawPollChoice {
    pub text: String,
    #[serde(default)]
    pub votes: i64,
    #[serde(default)]
    pub is_voted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawDriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub url: String,
    pub thumbnail_url: Option<String>,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub is_sensitive: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawNotification {
    pub id: String,
    pub created_at: String,
    #[serde(rename = "type")]
    pub notification_type: String,
    pub user: Option<RawUser>,
    pub note: Option<RawNote>,
    pub reaction: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawUserDetail {
    pub id: String,
    pub username: String,
    pub host: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub followers_count: i64,
    #[serde(default)]
    pub following_count: i64,
    #[serde(default)]
    pub notes_count: i64,
    #[serde(default)]
    pub is_bot: bool,
    #[serde(default)]
    pub is_cat: bool,
    #[serde(default)]
    pub is_following: bool,
    #[serde(default)]
    pub is_followed: bool,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RawMiAuthResponse {
    pub ok: bool,
    pub token: Option<String>,
    pub user: Option<RawUser>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawCreateNoteResponse {
    pub created_note: RawNote,
}

#[derive(Debug, Deserialize)]
pub struct RawEmojisResponse {
    pub emojis: Vec<RawEmoji>,
}

#[derive(Debug, Deserialize)]
pub struct RawEmoji {
    pub name: String,
    pub url: String,
}

// --- Conversion: Raw -> Normalized ---

impl RawNote {
    pub fn normalize(self, account_id: &str, server_host: &str) -> NormalizedNote {
        NormalizedNote {
            id: self.id,
            account_id: account_id.to_string(),
            server_host: server_host.to_string(),
            created_at: self.created_at,
            text: self.text,
            cw: self.cw,
            user: self.user.into(),
            visibility: self.visibility,
            emojis: self.emojis,
            reaction_emojis: self.reaction_emojis,
            reactions: self.reactions,
            my_reaction: self.my_reaction,
            renote_count: self.renote_count,
            replies_count: self.replies_count,
            files: self.files.into_iter().map(Into::into).collect(),
            is_favorited: self.is_favorited,
            poll: self.poll.map(|p| NormalizedPoll {
                choices: p
                    .choices
                    .into_iter()
                    .map(|c| NormalizedPollChoice {
                        text: c.text,
                        votes: c.votes,
                        is_voted: c.is_voted,
                    })
                    .collect(),
                multiple: p.multiple,
                expires_at: p.expires_at,
            }),
            reply: self
                .reply
                .map(|r| Box::new(r.normalize(account_id, server_host))),
            renote: self
                .renote
                .map(|r| Box::new(r.normalize(account_id, server_host))),
        }
    }
}

// --- Note reaction (who reacted) ---

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawNoteReaction {
    pub id: String,
    pub created_at: String,
    pub user: RawUser,
    #[serde(rename = "type")]
    pub reaction_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedNoteReaction {
    pub id: String,
    pub created_at: String,
    pub user: NormalizedUser,
    #[serde(rename = "type")]
    pub reaction_type: String,
}

impl From<RawNoteReaction> for NormalizedNoteReaction {
    fn from(r: RawNoteReaction) -> Self {
        Self {
            id: r.id,
            created_at: r.created_at,
            user: r.user.into(),
            reaction_type: r.reaction_type,
        }
    }
}

impl From<RawUser> for NormalizedUser {
    fn from(user: RawUser) -> Self {
        Self {
            id: user.id,
            username: user.username,
            host: user.host,
            name: user.name,
            avatar_url: user.avatar_url,
            is_bot: user.is_bot,
        }
    }
}

impl From<RawDriveFile> for NormalizedDriveFile {
    fn from(file: RawDriveFile) -> Self {
        Self {
            id: file.id,
            name: file.name,
            file_type: file.file_type,
            url: file.url,
            thumbnail_url: file.thumbnail_url,
            size: file.size,
            is_sensitive: file.is_sensitive,
        }
    }
}

impl RawUserDetail {
    pub fn normalize(self) -> NormalizedUserDetail {
        NormalizedUserDetail {
            id: self.id,
            username: self.username,
            host: self.host,
            name: self.name,
            avatar_url: self.avatar_url,
            banner_url: self.banner_url,
            description: self.description,
            followers_count: self.followers_count,
            following_count: self.following_count,
            notes_count: self.notes_count,
            is_bot: self.is_bot,
            is_cat: self.is_cat,
            is_following: self.is_following,
            is_followed: self.is_followed,
            created_at: self.created_at,
        }
    }
}

impl RawNotification {
    pub fn normalize(self, account_id: &str, server_host: &str) -> NormalizedNotification {
        NormalizedNotification {
            id: self.id,
            account_id: account_id.to_string(),
            server_host: server_host.to_string(),
            created_at: self.created_at,
            notification_type: self.notification_type,
            user: self.user.map(Into::into),
            note: self.note.map(|n| n.normalize(account_id, server_host)),
            reaction: self.reaction,
        }
    }
}
