use crate::config::Config;
use crate::error::{Result, TriliumError};
use crate::models::*;
use reqwest::{Client, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tracing::{debug, warn};

pub struct TriliumClient {
    client: Client,
    base_url: String,
    api_token: Option<String>,
}

impl TriliumClient {
    pub fn new(config: &Config) -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .map_err(|e| TriliumError::HttpError(e))?;

        Ok(Self {
            client,
            base_url: config.server_url.clone(),
            api_token: config.api_token.clone(),
        })
    }

    fn build_url(&self, path: &str) -> String {
        format!("{}/etapi{}", self.base_url, path)
    }

    async fn send_request<T: DeserializeOwned>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<impl Serialize>,
    ) -> Result<T> {
        let url = self.build_url(path);
        debug!("Sending {} request to {}", method, url);

        let mut request = self.client.request(method, &url);

        // Add authentication header if token is available
        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        // Add JSON body if provided
        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    async fn handle_response<T: DeserializeOwned>(&self, response: Response) -> Result<T> {
        let status = response.status();
        let url = response.url().to_string();

        if status.is_success() {
            response
                .json::<T>()
                .await
                .map_err(|e| TriliumError::HttpError(e))
        } else {
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            match status {
                StatusCode::UNAUTHORIZED => Err(TriliumError::AuthError(error_text)),
                StatusCode::NOT_FOUND => Err(TriliumError::ApiError(format!("Resource not found: {}", url))),
                _ => Err(TriliumError::ApiError(format!("HTTP {}: {}", status, error_text))),
            }
        }
    }

    // Authentication
    pub async fn login(&mut self, password: &str) -> Result<String> {
        let request = LoginRequest {
            password: password.to_string(),
        };
        let response: LoginResponse = self
            .send_request(reqwest::Method::POST, "/auth/login", Some(request))
            .await?;
        self.api_token = Some(response.auth_token.clone());
        Ok(response.auth_token)
    }

    pub async fn logout(&self) -> Result<()> {
        self.send_request::<serde_json::Value>(reqwest::Method::POST, "/auth/logout", None::<()>)
            .await?;
        Ok(())
    }

    // App Info
    pub async fn get_app_info(&self) -> Result<AppInfo> {
        self.send_request(reqwest::Method::GET, "/app-info", None::<()>)
            .await
    }

    // Notes
    pub async fn create_note(&self, request: CreateNoteRequest) -> Result<Note> {
        self.send_request(reqwest::Method::POST, "/create-note", Some(request))
            .await
    }

    pub async fn get_note(&self, note_id: &str) -> Result<Note> {
        self.send_request(reqwest::Method::GET, &format!("/notes/{}", note_id), None::<()>)
            .await
    }

    pub async fn update_note(&self, note_id: &str, request: UpdateNoteRequest) -> Result<Note> {
        self.send_request(
            reqwest::Method::PATCH,
            &format!("/notes/{}", note_id),
            Some(request),
        )
        .await
    }

    pub async fn delete_note(&self, note_id: &str) -> Result<()> {
        self.send_request::<serde_json::Value>(
            reqwest::Method::DELETE,
            &format!("/notes/{}", note_id),
            None::<()>,
        )
        .await?;
        Ok(())
    }

    pub async fn get_note_content(&self, note_id: &str) -> Result<String> {
        let url = self.build_url(&format!("/notes/{}/content", note_id));
        let mut request = self.client.get(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        let response = request.send().await?;
        if response.status().is_success() {
            Ok(response.text().await?)
        } else {
            Err(TriliumError::ApiError(format!(
                "Failed to get note content: HTTP {}",
                response.status()
            )))
        }
    }

    pub async fn update_note_content(&self, note_id: &str, content: &str) -> Result<()> {
        let url = self.build_url(&format!("/notes/{}/content", note_id));
        let mut request = self.client.put(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        request = request.header("Content-Type", "text/plain").body(content.to_string());

        let response = request.send().await?;
        if !response.status().is_success() {
            return Err(TriliumError::ApiError(format!(
                "Failed to update note content: HTTP {}",
                response.status()
            )));
        }
        Ok(())
    }

    pub async fn search_notes(&self, query: &str, fast_search: bool, include_archived: bool, limit: usize) -> Result<Vec<SearchResult>> {
        let mut params = HashMap::new();
        params.insert("search", query.to_string());
        params.insert("fastSearch", fast_search.to_string());
        params.insert("includeArchivedNotes", include_archived.to_string());
        params.insert("limit", limit.to_string());

        let url = self.build_url("/notes");
        let mut request = self.client.get(&url).query(&params);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        let response = request.send().await?;
        let search_response: SearchResponse = self.handle_response(response).await?;
        Ok(search_response.results)
    }

    // Branches
    pub async fn create_branch(&self, request: CreateBranchRequest) -> Result<Branch> {
        self.send_request(reqwest::Method::POST, "/branches", Some(request))
            .await
    }

    pub async fn get_branch(&self, branch_id: &str) -> Result<Branch> {
        self.send_request(reqwest::Method::GET, &format!("/branches/{}", branch_id), None::<()>)
            .await
    }

    pub async fn update_branch(&self, branch_id: &str, request: UpdateBranchRequest) -> Result<Branch> {
        self.send_request(
            reqwest::Method::PATCH,
            &format!("/branches/{}", branch_id),
            Some(request),
        )
        .await
    }

    pub async fn delete_branch(&self, branch_id: &str) -> Result<()> {
        self.send_request::<serde_json::Value>(
            reqwest::Method::DELETE,
            &format!("/branches/{}", branch_id),
            None::<()>,
        )
        .await?;
        Ok(())
    }

    // Attributes
    pub async fn create_attribute(&self, request: CreateAttributeRequest) -> Result<Attribute> {
        self.send_request(reqwest::Method::POST, "/attributes", Some(request))
            .await
    }

    pub async fn get_attribute(&self, attribute_id: &str) -> Result<Attribute> {
        self.send_request(
            reqwest::Method::GET,
            &format!("/attributes/{}", attribute_id),
            None::<()>,
        )
        .await
    }

    pub async fn update_attribute(&self, attribute_id: &str, request: UpdateAttributeRequest) -> Result<Attribute> {
        self.send_request(
            reqwest::Method::PATCH,
            &format!("/attributes/{}", attribute_id),
            Some(request),
        )
        .await
    }

    pub async fn delete_attribute(&self, attribute_id: &str) -> Result<()> {
        self.send_request::<serde_json::Value>(
            reqwest::Method::DELETE,
            &format!("/attributes/{}", attribute_id),
            None::<()>,
        )
        .await?;
        Ok(())
    }

    pub async fn get_note_attributes(&self, note_id: &str) -> Result<Vec<Attribute>> {
        self.send_request(
            reqwest::Method::GET,
            &format!("/notes/{}/attributes", note_id),
            None::<()>,
        )
        .await
    }

    // Attachments
    pub async fn upload_attachment(&self, note_id: &str, file_path: &Path, title: Option<String>) -> Result<Attachment> {
        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("attachment");
        let title = title.unwrap_or_else(|| file_name.to_string());

        let file_content = std::fs::read(file_path)
            .map_err(|e| TriliumError::IoError(e))?;

        let url = self.build_url(&format!("/notes/{}/attachments", note_id));
        let mut request = self.client.post(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        // Detect MIME type from file extension
        let mime_type = mime_guess::from_path(file_path)
            .first_or_octet_stream()
            .to_string();

        request = request
            .header("Content-Type", &mime_type)
            .header("X-Attachment-Title", title)
            .body(file_content);

        let response = request.send().await?;
        self.handle_response(response).await
    }

    pub async fn download_attachment(&self, attachment_id: &str) -> Result<Vec<u8>> {
        let url = self.build_url(&format!("/attachments/{}/download", attachment_id));
        let mut request = self.client.get(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        let response = request.send().await?;
        if response.status().is_success() {
            Ok(response.bytes().await?.to_vec())
        } else {
            Err(TriliumError::ApiError(format!(
                "Failed to download attachment: HTTP {}",
                response.status()
            )))
        }
    }

    pub async fn get_attachment(&self, attachment_id: &str) -> Result<Attachment> {
        self.send_request(
            reqwest::Method::GET,
            &format!("/attachments/{}", attachment_id),
            None::<()>,
        )
        .await
    }

    pub async fn delete_attachment(&self, attachment_id: &str) -> Result<()> {
        self.send_request::<serde_json::Value>(
            reqwest::Method::DELETE,
            &format!("/attachments/{}", attachment_id),
            None::<()>,
        )
        .await?;
        Ok(())
    }

    pub async fn get_note_attachments(&self, note_id: &str) -> Result<Vec<Attachment>> {
        self.send_request(
            reqwest::Method::GET,
            &format!("/notes/{}/attachments", note_id),
            None::<()>,
        )
        .await
    }

    // Backup
    pub async fn create_backup(&self, backup_name: Option<String>) -> Result<String> {
        let mut params = HashMap::new();
        if let Some(name) = backup_name {
            params.insert("backupName", name);
        }

        let url = self.build_url("/backup");
        let mut request = self.client.put(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        if !params.is_empty() {
            request = request.query(&params);
        }

        let response = request.send().await?;
        let backup_response: BackupResponse = self.handle_response(response).await?;
        Ok(backup_response.backup_name)
    }

    // Calendar
    pub async fn get_calendar_note(&self, date: &str) -> Result<CalendarNote> {
        self.send_request(
            reqwest::Method::GET,
            &format!("/calendar/days/{}", date),
            None::<()>,
        )
        .await
    }

    pub async fn create_calendar_note(&self, date: &str) -> Result<CalendarNote> {
        self.send_request(
            reqwest::Method::POST,
            &format!("/calendar/days/{}", date),
            None::<()>,
        )
        .await
    }

    // Export/Import
    pub async fn export_note(&self, note_id: &str, format: &str) -> Result<Vec<u8>> {
        let url = self.build_url(&format!("/notes/{}/export", note_id));
        let mut request = self.client.get(&url)
            .query(&[("format", format)]);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        let response = request.send().await?;
        if response.status().is_success() {
            Ok(response.bytes().await?.to_vec())
        } else {
            Err(TriliumError::ApiError(format!(
                "Failed to export note: HTTP {}",
                response.status()
            )))
        }
    }

    pub async fn import_note(&self, parent_id: &str, content: Vec<u8>, format: &str) -> Result<Note> {
        let url = self.build_url(&format!("/notes/{}/import", parent_id));
        let mut request = self.client.post(&url)
            .query(&[("format", format)])
            .body(content);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token);
        }

        let response = request.send().await?;
        self.handle_response(response).await
    }

    // Helper method to get child notes
    pub async fn get_child_notes(&self, parent_id: &str) -> Result<Vec<Note>> {
        let parent = self.get_note(parent_id).await?;
        let mut children = Vec::new();

        if let Some(child_ids) = parent.child_note_ids {
            for child_id in child_ids {
                match self.get_note(&child_id).await {
                    Ok(child) => children.push(child),
                    Err(e) => warn!("Failed to get child note {}: {}", child_id, e),
                }
            }
        }

        Ok(children)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        Config {
            server_url: "http://localhost:9999".to_string(),
            api_token: Some("test_token".to_string()),
            default_parent_id: "root".to_string(),
            default_note_type: "text".to_string(),
            editor: None,
            timeout_seconds: 30,
            max_retries: 3,
        }
    }

    #[test]
    fn test_build_url() {
        let config = test_config();
        let client = TriliumClient::new(&config).unwrap();
        let url = client.build_url("/notes");
        assert_eq!(url, "http://localhost:9999/etapi/notes");
    }

    #[test]
    fn test_build_url_with_path() {
        let config = test_config();
        let client = TriliumClient::new(&config).unwrap();
        let url = client.build_url("/notes/123/content");
        assert_eq!(url, "http://localhost:9999/etapi/notes/123/content");
    }

    #[test]
    fn test_client_creation() {
        let config = test_config();
        let client = TriliumClient::new(&config);
        assert!(client.is_ok());
        let client = client.unwrap();
        assert_eq!(client.base_url, "http://localhost:9999");
        assert_eq!(client.api_token, Some("test_token".to_string()));
    }

    #[test]
    fn test_client_without_token() {
        let mut config = test_config();
        config.api_token = None;
        let client = TriliumClient::new(&config);
        assert!(client.is_ok());
        let client = client.unwrap();
        assert_eq!(client.api_token, None);
    }
}