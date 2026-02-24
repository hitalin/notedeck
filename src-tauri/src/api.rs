use std::collections::HashMap;

use reqwest::Client;
use serde_json::{json, Value};

use crate::models::*;

const TIMELINE_ENDPOINTS: &[(&str, &str)] = &[
    ("home", "notes/timeline"),
    ("local", "notes/local-timeline"),
    ("social", "notes/hybrid-timeline"),
    ("global", "notes/global-timeline"),
];

fn timeline_endpoint(timeline_type: &str) -> &'static str {
    TIMELINE_ENDPOINTS
        .iter()
        .find(|(t, _)| *t == timeline_type)
        .map(|(_, e)| *e)
        .unwrap_or("notes/timeline")
}

pub struct MisskeyClient {
    client: Client,
}

impl MisskeyClient {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    async fn request(
        &self,
        host: &str,
        token: &str,
        endpoint: &str,
        mut params: Value,
    ) -> Result<Value, String> {
        if let Some(obj) = params.as_object_mut() {
            obj.insert("i".to_string(), json!(token));
        }

        let res = self
            .client
            .post(format!("https://{host}/api/{endpoint}"))
            .json(&params)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body: Value = res.json().await.unwrap_or_default();
            let detail = body
                .pointer("/error/message")
                .or_else(|| body.pointer("/error/code"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            return if detail.is_empty() {
                Err(format!("{endpoint} ({status})"))
            } else {
                Err(format!("{endpoint}: {detail}"))
            };
        }

        res.json().await.map_err(|e| e.to_string())
    }

    pub async fn get_timeline(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        timeline_type: &str,
        options: TimelineOptions,
    ) -> Result<Vec<NormalizedNote>, String> {
        let endpoint = timeline_endpoint(timeline_type);
        let mut params = json!({ "limit": options.limit });
        if let Some(ref id) = options.since_id {
            params["sinceId"] = json!(id);
        }
        if let Some(ref id) = options.until_id {
            params["untilId"] = json!(id);
        }

        let data = self.request(host, token, endpoint, params).await?;
        let raw: Vec<RawNote> = serde_json::from_value(data).map_err(|e| e.to_string())?;
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
    ) -> Result<NormalizedNote, String> {
        let data = self
            .request(host, token, "notes/show", json!({ "noteId": note_id }))
            .await?;
        let raw: RawNote = serde_json::from_value(data).map_err(|e| e.to_string())?;
        Ok(raw.normalize(account_id, host))
    }

    pub async fn create_note(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        params: CreateNoteParams,
    ) -> Result<NormalizedNote, String> {
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
            serde_json::from_value(data).map_err(|e| e.to_string())?;
        Ok(raw.created_note.normalize(account_id, host))
    }

    pub async fn create_reaction(
        &self,
        host: &str,
        token: &str,
        note_id: &str,
        reaction: &str,
    ) -> Result<(), String> {
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
    ) -> Result<(), String> {
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
    ) -> Result<NormalizedUser, String> {
        let data = self
            .request(host, token, "users/show", json!({ "userId": user_id }))
            .await?;
        let raw: RawUser = serde_json::from_value(data).map_err(|e| e.to_string())?;
        Ok(raw.into())
    }

    pub async fn get_user_detail(
        &self,
        host: &str,
        token: &str,
        user_id: &str,
    ) -> Result<NormalizedUserDetail, String> {
        let data = self
            .request(host, token, "users/show", json!({ "userId": user_id }))
            .await?;
        let raw: RawUserDetail = serde_json::from_value(data).map_err(|e| e.to_string())?;
        Ok(raw.normalize())
    }

    pub async fn get_server_emojis(
        &self,
        host: &str,
        token: &str,
    ) -> Result<HashMap<String, String>, String> {
        let data = self.request(host, token, "emojis", json!({})).await?;
        let raw: RawEmojisResponse = serde_json::from_value(data).map_err(|e| e.to_string())?;
        Ok(raw.emojis.into_iter().map(|e| (e.name, e.url)).collect())
    }

    pub async fn get_user_notes(
        &self,
        host: &str,
        token: &str,
        account_id: &str,
        user_id: &str,
        options: TimelineOptions,
    ) -> Result<Vec<NormalizedNote>, String> {
        let mut params = json!({ "userId": user_id, "limit": options.limit });
        if let Some(ref id) = options.since_id {
            params["sinceId"] = json!(id);
        }
        if let Some(ref id) = options.until_id {
            params["untilId"] = json!(id);
        }

        let data = self.request(host, token, "users/notes", params).await?;
        let raw: Vec<RawNote> = serde_json::from_value(data).map_err(|e| e.to_string())?;
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
    ) -> Result<Vec<NormalizedNotification>, String> {
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
            serde_json::from_value(data).map_err(|e| e.to_string())?;
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
    ) -> Result<AuthResult, String> {
        let res = self
            .client
            .post(format!("https://{host}/api/miauth/{session_id}/check"))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !res.status().is_success() {
            return Err(format!("MiAuth check failed: {}", res.status().as_u16()));
        }

        let data: RawMiAuthResponse = res.json().await.map_err(|e| e.to_string())?;
        if !data.ok {
            return Err("MiAuth authentication was not completed".to_string());
        }

        Ok(AuthResult {
            token: data.token,
            user: data.user.into(),
        })
    }

    pub async fn verify_token(
        &self,
        host: &str,
        token: &str,
    ) -> Result<NormalizedUser, String> {
        let data = self.request(host, token, "i", json!({})).await?;
        let raw: RawUser = serde_json::from_value(data).map_err(|e| e.to_string())?;
        Ok(raw.into())
    }
}
