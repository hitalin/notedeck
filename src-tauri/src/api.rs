use std::collections::HashMap;
use std::time::Duration;

use reqwest::Client;
use serde_json::{json, Value};

use crate::error::NoteDeckError;
use crate::models::*;


pub struct MisskeyClient {
    client: Client,
}

impl MisskeyClient {
    pub fn new() -> Result<Self, NoteDeckError> {
        Ok(Self {
            client: Client::builder()
                .user_agent("NoteDeck/0.0.3")
                .timeout(Duration::from_secs(30))
                .connect_timeout(Duration::from_secs(10))
                .pool_max_idle_per_host(4)
                .build()?,
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
            let body: Value = res.json().await.unwrap_or_default();
            let detail = body
                .pointer("/error/message")
                .or_else(|| body.pointer("/error/code"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let message = if detail.is_empty() {
                format!("{endpoint} ({status})")
            } else {
                format!("{endpoint}: {detail}")
            };
            return Err(NoteDeckError::Api {
                endpoint: endpoint.to_string(),
                status,
                message,
            });
        }

        Ok(res.json().await?)
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
        let mut params = json!({ "limit": options.limit });
        if let Some(ref id) = options.since_id {
            params["sinceId"] = json!(id);
        }
        if let Some(ref id) = options.until_id {
            params["untilId"] = json!(id);
        }

        let data = self.request(host, token, endpoint, params).await?;
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
        let mut params = json!({ "userId": user_id, "limit": options.limit });
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

    pub async fn get_notifications(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        options: TimelineOptions,
    ) -> Result<Vec<NormalizedNotification>, NoteDeckError> {
        let mut params = json!({ "limit": options.limit });
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

    pub async fn verify_token(
        &self,
        host: &str,
        token: &str,
    ) -> Result<NormalizedUser, NoteDeckError> {
        let data = self.request(host, token, "i", json!({})).await?;
        let raw: RawUser = serde_json::from_value(data)?;
        Ok(raw.into())
    }

    /// Fetch all keys in a registry scope. Returns null if empty or error.
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
            Err(_) => Ok(None),
        }
    }

    /// Fetch server meta information.
    pub async fn get_meta(
        &self,
        host: &str,
        token: &str,
    ) -> Result<Value, NoteDeckError> {
        self.request(host, token, "meta", json!({})).await
    }
}
