use std::collections::HashMap;
use std::time::Duration;

use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde_json::{json, Value};

use crate::error::NoteDeckError;
use crate::models::{
    AuthResult, CreateNoteParams, NormalizedDriveFile, NormalizedNote, NormalizedNoteReaction,
    NormalizedNotification, NormalizedUser, NormalizedUserDetail, RawCreateNoteResponse,
    RawDriveFile, RawEmojisResponse, RawMiAuthResponse, RawNote, RawNoteReaction, RawNotification,
    RawUser, RawUserDetail, SearchOptions, TimelineOptions, TimelineType,
};


/// Maximum response body size (50 MB) to prevent memory exhaustion from malicious servers.
const MAX_RESPONSE_BYTES: usize = 50 * 1024 * 1024;

pub struct MisskeyClient {
    client: Client,
}

impl MisskeyClient {
    pub fn new() -> Result<Self, NoteDeckError> {
        Ok(Self {
            client: Client::builder()
                .user_agent("NoteDeck/0.0.5")
                .timeout(Duration::from_secs(30))
                .connect_timeout(Duration::from_secs(10))
                .pool_max_idle_per_host(4)
                .build()?,
        })
    }

    /// Read the response body with a size limit to prevent DoS.
    async fn read_body_limited(
        res: reqwest::Response,
        endpoint: &str,
    ) -> Result<String, NoteDeckError> {
        if let Some(len) = res.content_length() {
            if len > MAX_RESPONSE_BYTES as u64 {
                return Err(NoteDeckError::Api {
                    endpoint: endpoint.to_string(),
                    status: 0,
                    message: "Response too large".to_string(),
                });
            }
        }
        let bytes = res
            .bytes()
            .await
            .map_err(NoteDeckError::from)?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(NoteDeckError::Api {
                endpoint: endpoint.to_string(),
                status: 0,
                message: "Response too large".to_string(),
            });
        }
        String::from_utf8(bytes.to_vec()).map_err(|_| NoteDeckError::Api {
            endpoint: endpoint.to_string(),
            status: 0,
            message: "Invalid UTF-8 in response".to_string(),
        })
    }

    async fn request(
        &self,
        host: &str,
        token: &str,
        endpoint: &str,
        mut params: Value,
    ) -> Result<Value, NoteDeckError> {
        if let Some(obj) = params.as_object_mut() {
            obj.insert("i".to_string(), json!(token));
        }

        let res = self
            .client
            .post(format!("https://{host}/api/{endpoint}"))
            .json(&params)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let detail = match res.json::<Value>().await {
                Ok(body) => body
                    .pointer("/error/message")
                    .or_else(|| body.pointer("/error/code"))
                    .and_then(|v| v.as_str())
                    .map(String::from),
                Err(_) => None,
            };
            let message = match detail {
                Some(d) => format!("{endpoint}: {d}"),
                None => format!("{endpoint} ({status})"),
            };
            return Err(NoteDeckError::Api {
                endpoint: endpoint.to_string(),
                status,
                message,
            });
        }

        let text = Self::read_body_limited(res, endpoint).await?;
        if text.is_empty() {
            Ok(Value::Null)
        } else {
            serde_json::from_str(&text).map_err(NoteDeckError::from)
        }
    }

    pub async fn get_timeline(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        timeline_type: TimelineType,
        options: TimelineOptions,
    ) -> Result<Vec<NormalizedNote>, NoteDeckError> {
        let endpoint = timeline_type.api_endpoint();
        let mut params = json!({ "limit": options.limit() });
        if let Some(ref id) = options.since_id {
            params["sinceId"] = json!(id);
        }
        if let Some(ref id) = options.until_id {
            params["untilId"] = json!(id);
        }
        if let Some(ref f) = options.filters {
            if let Some(v) = f.with_renotes {
                params["withRenotes"] = json!(v);
            }
            if let Some(v) = f.with_replies {
                params["withReplies"] = json!(v);
            }
            if let Some(v) = f.with_files {
                params["withFiles"] = json!(v);
            }
            if let Some(v) = f.with_bots {
                params["withBots"] = json!(v);
                // Some forks use excludeBots (inverse semantics)
                params["excludeBots"] = json!(!v);
            }
            if let Some(v) = f.with_sensitive {
                params["withSensitive"] = json!(v);
                params["excludeNsfw"] = json!(!v);
            }
        }

        let data = self.request(host, token, &endpoint, params).await?;
        let raw: Vec<RawNote> = serde_json::from_value(data)?;
        Ok(raw
            .into_iter()
            .map(|n| n.normalize(account_id, host))
            .collect())
    }

    pub async fn get_note(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        note_id: &str,
    ) -> Result<NormalizedNote, NoteDeckError> {
        let data = self
            .request(host, token, "notes/show", json!({ "noteId": note_id }))
            .await?;
        let raw: RawNote = serde_json::from_value(data)?;
        Ok(raw.normalize(account_id, host))
    }

    pub async fn create_note(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        params: CreateNoteParams,
    ) -> Result<NormalizedNote, NoteDeckError> {
        let mut body = json!({});
        if let Some(ref text) = params.text {
            body["text"] = json!(text);
        }
        if let Some(ref cw) = params.cw {
            body["cw"] = json!(cw);
        }
        if let Some(ref vis) = params.visibility {
            body["visibility"] = json!(vis);
        }
        if let Some(local_only) = params.local_only {
            body["localOnly"] = json!(local_only);
        }
        if let Some(ref flags) = params.mode_flags {
            for (key, value) in flags {
                body[key] = json!(value);
            }
        }
        if let Some(ref id) = params.reply_id {
            body["replyId"] = json!(id);
        }
        if let Some(ref id) = params.renote_id {
            body["renoteId"] = json!(id);
        }
        if let Some(ref ids) = params.file_ids {
            body["fileIds"] = json!(ids);
        }

        let data = self.request(host, token, "notes/create", body).await?;
        let raw: RawCreateNoteResponse =
            serde_json::from_value(data)?;
        Ok(raw.created_note.normalize(account_id, host))
    }

    pub async fn create_reaction(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
        reaction: &str,
    ) -> Result<(), NoteDeckError> {
        self.request(
            host,
            token,
            "notes/reactions/create",
            json!({ "noteId": note_id, "reaction": reaction }),
        )
        .await?;
        Ok(())
    }

    pub async fn delete_reaction(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
    ) -> Result<(), NoteDeckError> {
        self.request(
            host,
            token,
            "notes/reactions/delete",
            json!({ "noteId": note_id }),
        )
        .await?;
        Ok(())
    }

    pub async fn get_note_reactions(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
        reaction_type: Option<&str>,
        limit: u32,
    ) -> Result<Vec<NormalizedNoteReaction>, NoteDeckError> {
        let mut params = json!({ "noteId": note_id, "limit": limit });
        if let Some(rt) = reaction_type {
            params["type"] = json!(rt);
        }
        let data = self.request(host, token, "notes/reactions", params).await?;
        let raw: Vec<RawNoteReaction> = serde_json::from_value(data)?;
        Ok(raw.into_iter().map(Into::into).collect())
    }

    pub async fn update_note(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
        params: CreateNoteParams,
    ) -> Result<(), NoteDeckError> {
        let mut body = json!({ "noteId": note_id });
        if let Some(ref text) = params.text {
            body["text"] = json!(text);
        }
        if let Some(ref cw) = params.cw {
            body["cw"] = json!(cw);
        }
        if let Some(ref ids) = params.file_ids {
            body["fileIds"] = json!(ids);
        }
        self.request(host, token, "notes/update", body).await?;
        Ok(())
    }

    pub async fn upload_file(
        &self,
        host: &str,
        token: &str,
        file_name: &str,
        file_data: Vec<u8>,
        content_type: &str,
        is_sensitive: bool,
    ) -> Result<NormalizedDriveFile, NoteDeckError> {
        let file_part = Part::bytes(file_data)
            .file_name(file_name.to_string())
            .mime_str(content_type)
            .map_err(|e| NoteDeckError::Api {
                endpoint: "drive/files/create".to_string(),
                status: 0,
                message: e.to_string(),
            })?;

        let form = Form::new()
            .text("i", token.to_string())
            .text("isSensitive", is_sensitive.to_string())
            .part("file", file_part);

        let url = format!("https://{}/api/drive/files/create", host);
        let resp = self.client.post(&url).multipart(form).send().await?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let message = resp.text().await.unwrap_or_default();
            return Err(NoteDeckError::Api {
                endpoint: "drive/files/create".to_string(),
                status,
                message,
            });
        }

        let raw: RawDriveFile = resp.json().await?;
        Ok(NormalizedDriveFile::from(raw))
    }

    pub async fn create_favorite(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
    ) -> Result<(), NoteDeckError> {
        self.request(
            host,
            token,
            "notes/favorites/create",
            json!({ "noteId": note_id }),
        )
        .await?;
        Ok(())
    }

    pub async fn delete_favorite(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
    ) -> Result<(), NoteDeckError> {
        self.request(
            host,
            token,
            "notes/favorites/delete",
            json!({ "noteId": note_id }),
        )
        .await?;
        Ok(())
    }

    pub async fn delete_note(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
    ) -> Result<(), NoteDeckError> {
        self.request(
            host,
            token,
            "notes/delete",
            json!({ "noteId": note_id }),
        )
        .await?;
        Ok(())
    }

    pub async fn get_user(
        &self,
        host: &str,
        token: &str,
        user_id: &str,
    ) -> Result<NormalizedUser, NoteDeckError> {
        let data = self
            .request(host, token, "users/show", json!({ "userId": user_id }))
            .await?;
        let raw: RawUser = serde_json::from_value(data)?;
        Ok(raw.into())
    }

    pub async fn get_user_detail(
        &self,
        host: &str,
        token: &str,
        user_id: &str,
    ) -> Result<NormalizedUserDetail, NoteDeckError> {
        let data = self
            .request(host, token, "users/show", json!({ "userId": user_id }))
            .await?;
        let raw: RawUserDetail = serde_json::from_value(data)?;
        Ok(raw.normalize())
    }

    pub async fn get_server_emojis(
        &self,
        host: &str,
        token: &str,
    ) -> Result<HashMap<String, String>, NoteDeckError> {
        let data = self.request(host, token, "emojis", json!({})).await?;
        let raw: RawEmojisResponse = serde_json::from_value(data)?;
        Ok(raw.emojis.into_iter().map(|e| (e.name, e.url)).collect())
    }

    pub async fn get_user_notes(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        user_id: &str,
        options: TimelineOptions,
    ) -> Result<Vec<NormalizedNote>, NoteDeckError> {
        let mut params = json!({ "userId": user_id, "limit": options.limit() });
        if let Some(ref id) = options.since_id {
            params["sinceId"] = json!(id);
        }
        if let Some(ref id) = options.until_id {
            params["untilId"] = json!(id);
        }

        let data = self.request(host, token, "users/notes", params).await?;
        let raw: Vec<RawNote> = serde_json::from_value(data)?;
        Ok(raw
            .into_iter()
            .map(|n| n.normalize(account_id, host))
            .collect())
    }

    pub async fn search_notes(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        query: &str,
        options: SearchOptions,
    ) -> Result<Vec<NormalizedNote>, NoteDeckError> {
        let mut params = json!({ "query": query, "limit": options.limit() });
        if let Some(ref id) = options.since_id {
            params["sinceId"] = json!(id);
        }
        if let Some(ref id) = options.until_id {
            params["untilId"] = json!(id);
        }

        let data = self.request(host, token, "notes/search", params).await?;
        let raw: Vec<RawNote> = serde_json::from_value(data)?;
        Ok(raw
            .into_iter()
            .map(|n| n.normalize(account_id, host))
            .collect())
    }

    pub async fn get_notifications(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        options: TimelineOptions,
    ) -> Result<Vec<NormalizedNotification>, NoteDeckError> {
        let mut params = json!({ "limit": options.limit() });
        if let Some(ref id) = options.since_id {
            params["sinceId"] = json!(id);
        }
        if let Some(ref id) = options.until_id {
            params["untilId"] = json!(id);
        }

        let data = self
            .request(host, token, "i/notifications", params)
            .await?;
        let raw: Vec<RawNotification> =
            serde_json::from_value(data)?;
        Ok(raw
            .into_iter()
            .map(|n| n.normalize(account_id, host))
            .collect())
    }

    // --- Auth ---

    pub async fn complete_auth(
        &self,
        host: &str,
        session_id: &str,
    ) -> Result<AuthResult, NoteDeckError> {
        let res = self
            .client
            .post(format!("https://{host}/api/miauth/{session_id}/check"))
            .json(&json!({}))
            .send()
            .await?;

        if !res.status().is_success() {
            return Err(NoteDeckError::Auth(format!(
                "MiAuth check failed: {}",
                res.status().as_u16()
            )));
        }

        let data: RawMiAuthResponse = res.json().await?;
        if !data.ok {
            return Err(NoteDeckError::Auth(
                "MiAuth authentication was not completed".to_string(),
            ));
        }

        let token = data
            .token
            .ok_or_else(|| NoteDeckError::Auth("MiAuth response missing token".to_string()))?;
        let user = data
            .user
            .ok_or_else(|| NoteDeckError::Auth("MiAuth response missing user".to_string()))?;

        Ok(AuthResult {
            token,
            user: user.into(),
        })
    }

    /// Fetch all keys in a registry scope. Returns None if empty or not found (API error).
    /// Propagates network and other non-API errors.
    pub async fn get_registry_all(
        &self,
        host: &str,
        token: &str,
        scope: &[String],
    ) -> Result<Option<Value>, NoteDeckError> {
        let data = self
            .request(host, token, "i/registry/get-all", json!({ "scope": scope }))
            .await;
        match data {
            Ok(v) => {
                if let Some(obj) = v.as_object() {
                    if obj.is_empty() {
                        return Ok(None);
                    }
                }
                Ok(Some(v))
            }
            Err(NoteDeckError::Api { .. }) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub async fn get_note_children(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        note_id: &str,
        limit: u32,
    ) -> Result<Vec<NormalizedNote>, NoteDeckError> {
        let data = self
            .request(
                host,
                token,
                "notes/children",
                json!({ "noteId": note_id, "limit": limit }),
            )
            .await?;
        let raw: Vec<RawNote> = serde_json::from_value(data)?;
        Ok(raw
            .into_iter()
            .map(|n| n.normalize(account_id, host))
            .collect())
    }

    pub async fn get_note_conversation(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        note_id: &str,
        limit: u32,
    ) -> Result<Vec<NormalizedNote>, NoteDeckError> {
        let data = self
            .request(
                host,
                token,
                "notes/conversation",
                json!({ "noteId": note_id, "limit": limit }),
            )
            .await?;
        let raw: Vec<RawNote> = serde_json::from_value(data)?;
        Ok(raw
            .into_iter()
            .map(|n| n.normalize(account_id, host))
            .collect())
    }

    pub async fn lookup_user(
        &self,
        host: &str,
        token: &str,
        username: &str,
        user_host: Option<&str>,
    ) -> Result<NormalizedUser, NoteDeckError> {
        let mut params = json!({ "username": username });
        if let Some(h) = user_host {
            params["host"] = json!(h);
        }
        let data = self.request(host, token, "users/show", params).await?;
        let raw: RawUser = serde_json::from_value(data)?;
        Ok(raw.into())
    }

    pub async fn follow_user(
        &self,
        host: &str,
        token: &str,
        user_id: &str,
    ) -> Result<(), NoteDeckError> {
        self.request(host, token, "following/create", json!({ "userId": user_id }))
            .await?;
        Ok(())
    }

    pub async fn unfollow_user(
        &self,
        host: &str,
        token: &str,
        user_id: &str,
    ) -> Result<(), NoteDeckError> {
        self.request(host, token, "following/delete", json!({ "userId": user_id }))
            .await?;
        Ok(())
    }

    /// Fetch server meta information.
    pub async fn get_meta(
        &self,
        host: &str,
        token: &str,
    ) -> Result<Value, NoteDeckError> {
        self.request(host, token, "meta", json!({})).await
    }

    /// Fetch boolean policy flags and mode flags from /api/i.
    /// Returns policies (e.g. ltlAvailable, yamiTlAvailable) and
    /// top-level mode flags matching isIn*Mode (e.g. isInYamiMode).
    pub async fn get_user_policies(
        &self,
        host: &str,
        token: &str,
    ) -> Result<HashMap<String, bool>, NoteDeckError> {
        let data = self.request(host, token, "i", json!({})).await?;
        let mut result = HashMap::new();
        if let Some(policies) = data.get("policies").and_then(|v| v.as_object()) {
            for (key, value) in policies {
                if let Some(b) = value.as_bool() {
                    result.insert(key.clone(), b);
                }
            }
        }
        // Extract top-level mode flags (fork features like yami/hanami mode)
        if let Some(obj) = data.as_object() {
            for (key, value) in obj {
                if key.starts_with("isIn") && key.ends_with("Mode") {
                    if let Some(b) = value.as_bool() {
                        result.insert(key.clone(), b);
                    }
                }
            }
        }
        Ok(result)
    }

    /// Update a user setting via /api/i/update.
    pub async fn update_user_setting(
        &self,
        host: &str,
        token: &str,
        key: &str,
        value: bool,
    ) -> Result<(), NoteDeckError> {
        let mut params = json!({});
        params[key] = json!(value);
        self.request(host, token, "i/update", params).await?;
        Ok(())
    }

    /// Fetch parameter names for a specific API endpoint (public, no auth required).
    pub async fn get_endpoint_params(
        &self,
        host: &str,
        endpoint: &str,
    ) -> Result<Vec<String>, NoteDeckError> {
        let res = self
            .client
            .post(format!("https://{host}/api/endpoint"))
            .json(&json!({ "endpoint": endpoint }))
            .send()
            .await?;

        if !res.status().is_success() {
            return Err(NoteDeckError::Api {
                endpoint: "endpoint".to_string(),
                status: res.status().as_u16(),
                message: "Failed to fetch endpoint info".to_string(),
            });
        }

        let data: Value = res.json().await?;
        let mut params = Vec::new();

        // Misskey 2024+: params.properties is an object keyed by param name
        if let Some(props) = data
            .pointer("/params/properties")
            .and_then(|v| v.as_object())
        {
            for key in props.keys() {
                params.push(key.clone());
            }
        }
        // Older Misskey: params is a flat array with { name, ... } items
        if params.is_empty() {
            if let Some(arr) = data.get("params").and_then(|v| v.as_array()) {
                for item in arr {
                    if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                        params.push(name.to_string());
                    }
                }
            }
        }

        Ok(params)
    }

    /// Fetch available API endpoints (public, no auth required).
    pub async fn get_endpoints(&self, host: &str) -> Result<Vec<String>, NoteDeckError> {
        let res = self
            .client
            .post(format!("https://{host}/api/endpoints"))
            .json(&json!({}))
            .send()
            .await?;

        if !res.status().is_success() {
            return Err(NoteDeckError::Api {
                endpoint: "endpoints".to_string(),
                status: res.status().as_u16(),
                message: "Failed to fetch endpoints".to_string(),
            });
        }

        let endpoints: Vec<String> = res.json().await?;
        Ok(endpoints)
    }
}
