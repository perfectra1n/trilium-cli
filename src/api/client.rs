use crate::config::{Config, SecureString};
use crate::error::{Result, TriliumError};
use crate::models::*;
use reqwest::{Client, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};
use tracing::{debug, warn, error, trace};

pub struct TriliumClient {
    client: Client,
    base_url: String,
    api_token: Option<SecureString>,
    debug_mode: bool,
}

impl TriliumClient {
    pub fn new(config: &Config) -> Result<Self> {
        let profile = config.current_profile()?;
        let client = Client::builder()
            .timeout(Duration::from_secs(profile.timeout_seconds))
            .build()
            .map_err(TriliumError::HttpError)?;

        // Check for debug mode from environment variables
        let debug_mode = std::env::var("TRILIUM_DEBUG")
            .map(|v| v.to_lowercase() == "true" || v == "1")
            .unwrap_or_else(|_| {
                std::env::var("RUST_LOG")
                    .map(|v| v.contains("debug") || v.contains("trace"))
                    .unwrap_or(false)
            });

        let mut client_instance = Self {
            client,
            base_url: profile.server_url.clone(),
            api_token: profile.api_token.clone(),
            debug_mode,
        };

        if debug_mode {
            debug!("TriliumClient initialized with debug mode enabled");
            debug!("Server URL: {}", client_instance.base_url);
            debug!("API token configured: {}", client_instance.api_token.is_some());
        }

        Ok(client_instance)
    }

    pub fn with_debug_mode(mut self, debug_mode: bool) -> Self {
        self.debug_mode = debug_mode;
        self
    }

    pub fn enable_debug_mode(&mut self) {
        self.debug_mode = true;
    }

    pub fn disable_debug_mode(&mut self) {
        self.debug_mode = false;
    }

    /// Log debug information about API operations
    fn log_debug_info(&self, operation: &str, details: &str) {
        if self.debug_mode {
            debug!("[API Debug] {}: {}", operation, details);
            // Also output to stderr for immediate visibility in TUI
            eprintln!("[API Debug] {}: {}", operation, details);
        }
    }

    /// Create a comprehensive error message that preserves full details
    fn create_comprehensive_error_message(&self, operation: &str, status: u16, error_text: &str) -> String {
        let mut message = format!("HTTP {} Bad Request", status);
        
        if !error_text.is_empty() {
            // Try to parse as JSON and extract meaningful information
            if let Ok(api_error) = serde_json::from_str::<TriliumApiErrorResponse>(error_text) {
                message = format!("HTTP {} {}: {}", status, api_error.code, api_error.message);
                
                if self.debug_mode {
                    message.push_str(&format!("\n\nFull API Error Response:\n{:#?}", api_error));
                    if let Some(details) = &api_error.details {
                        message.push_str(&format!("\nError Details: {:#?}", details));
                    }
                }
            } else {
                // If not valid JSON, include the raw error text but ensure it's not truncated
                message.push_str(": ");
                message.push_str(error_text);
            }
        }
        
        if self.debug_mode {
            message.push_str(&format!("\n\nOperation: {}", operation));
            message.push_str(&format!("\nTimestamp: {}", chrono::Utc::now()));
        }
        
        message
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
        let start_time = Instant::now();
        let url = self.build_url(path);
        
        debug!("Sending {} request to {}", method, url);

        let mut request = self.client.request(method.clone(), &url);
        let mut debug_headers = HashMap::new();
        let mut request_body_str = None;

        // Add authentication header if token is available
        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token.as_str());
            debug_headers.insert("Authorization".to_string(), "[REDACTED]".to_string());
        }

        // Add JSON body if provided
        if let Some(body) = body {
            let serialized_body = serde_json::to_string(&body)
                .map_err(|e| TriliumError::JsonError(e))?;
            
            if self.debug_mode {
                request_body_str = Some(serialized_body.clone());
                trace!("Request body: {}", serialized_body);
            }
            
            request = request
                .header("Content-Type", "application/json")
                .body(serialized_body);
            
            debug_headers.insert("Content-Type".to_string(), "application/json".to_string());
        }

        // Log debug information if enabled
        if self.debug_mode {
            let request_debug = ApiRequestDebug {
                method: method.to_string(),
                url: url.clone(),
                headers: debug_headers,
                body: request_body_str,
                timestamp: chrono::Utc::now(),
            };
            trace!("API Request Debug: {:#?}", request_debug);
        }

        let response = request.send().await
            .map_err(|e| {
                error!("HTTP request failed for {} {}: {}", method, url, e);
                TriliumError::HttpError(e)
            })?;
        
        let duration = start_time.elapsed();
        self.handle_response(response, duration).await
    }

    async fn handle_response<T: DeserializeOwned>(&self, response: Response, duration: Duration) -> Result<T> {
        let status = response.status();
        let url = response.url().to_string();
        
        // Collect response headers for debugging
        let mut response_headers = HashMap::new();
        if self.debug_mode {
            for (name, value) in response.headers() {
                response_headers.insert(
                    name.to_string(), 
                    value.to_str().unwrap_or("[invalid UTF-8]").to_string()
                );
            }
        }

        if status.is_success() {
            let response_text = response.text().await
                .map_err(|e| {
                    error!("Failed to read response body from {}: {}", url, e);
                    TriliumError::HttpError(e)
                })?;
                
            // Log debug information if enabled
            if self.debug_mode {
                let response_debug = ApiResponseDebug {
                    status_code: status.as_u16(),
                    headers: response_headers,
                    body: response_text.clone(),
                    duration_ms: duration.as_millis() as u64,
                    timestamp: chrono::Utc::now(),
                };
                trace!("API Response Debug: {:#?}", response_debug);
            }
            
            serde_json::from_str::<T>(&response_text)
                .map_err(|e| {
                    error!("Failed to parse JSON response from {}: {}", url, e);
                    if self.debug_mode {
                        error!("Response body was: {}", response_text);
                    }
                    TriliumError::JsonError(e)
                })
        } else {
            let error_text = response.text().await
                .unwrap_or_else(|_| "Failed to read error response".to_string());
            
            // Always log detailed error information for debugging
            error!("HTTP {} error from {}: {}", status.as_u16(), url, error_text);
            
            // Use our comprehensive error message creator
            let operation = format!("API request to {}", url);
            let comprehensive_message = self.create_comprehensive_error_message(&operation, status.as_u16(), &error_text);
            
            // Log debug information for error responses
            if self.debug_mode {
                let response_debug = ApiResponseDebug {
                    status_code: status.as_u16(),
                    headers: response_headers.clone(),
                    body: error_text.clone(),
                    duration_ms: duration.as_millis() as u64,
                    timestamp: chrono::Utc::now(),
                };
                error!("API Error Response Debug: {:#?}", response_debug);
            }
            
            // Use the comprehensive error message and return appropriate error type based on status
            match status {
                StatusCode::UNAUTHORIZED => Err(TriliumError::AuthError(comprehensive_message)),
                StatusCode::NOT_FOUND => Err(TriliumError::NotFound(comprehensive_message)),
                StatusCode::BAD_REQUEST => {
                    // For bad requests, enhance PROPERTY_NOT_ALLOWED errors with specific guidance
                    if error_text.contains("PROPERTY_NOT_ALLOWED") {
                        let mut enhanced_msg = comprehensive_message;
                        enhanced_msg.push_str("\n\nTroubleshooting PROPERTY_NOT_ALLOWED errors:");
                        enhanced_msg.push_str("\n• Only use valid UpdateNoteRequest fields: title, type, mime, content, isProtected");
                        enhanced_msg.push_str("\n• Avoid read-only properties: noteId, dateCreated, dateModified, etc.");
                        enhanced_msg.push_str("\n• Check JSON field naming (use 'type' not 'noteType')");
                        enhanced_msg.push_str("\n• Enable debug mode to see the exact request payload");
                        Err(TriliumError::ValidationError(enhanced_msg))
                    } else {
                        Err(TriliumError::ValidationError(comprehensive_message))
                    }
                }
                StatusCode::FORBIDDEN => Err(TriliumError::PermissionDenied(comprehensive_message)),
                StatusCode::INTERNAL_SERVER_ERROR => Err(TriliumError::ApiError(format!("Server error: {}", comprehensive_message))),
                StatusCode::SERVICE_UNAVAILABLE => Err(TriliumError::ApiError(format!("Service unavailable: {}", comprehensive_message))),
                StatusCode::TOO_MANY_REQUESTS => Err(TriliumError::RateLimitError(comprehensive_message)),
                _ => Err(TriliumError::ApiError(comprehensive_message)),
            }
        }
    }

    // Authentication methods removed - not used in CLI application

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
        // Validate the request before sending
        request.validate()?;
        
        // Check if the request is empty
        if request.is_empty() {
            warn!("UpdateNoteRequest is empty - no changes to apply");
            return Err(TriliumError::ValidationError(
                "No fields specified for note update".to_string()
            ));
        }
        
        debug!("Updating note {} with request: {:?}", note_id, request);
        
        // In debug mode, log the serialized JSON that will be sent
        if self.debug_mode {
            match serde_json::to_string_pretty(&request) {
                Ok(json) => debug!("UpdateNoteRequest JSON payload: {}", json),
                Err(e) => warn!("Failed to serialize UpdateNoteRequest for debug: {}", e),
            }
        }
        
        // Perform the request with enhanced error context
        match self.send_request::<Note>(
            reqwest::Method::PATCH,
            &format!("/notes/{}", note_id),
            Some(request),
        ).await {
            Ok(note) => {
                debug!("Successfully updated note {} ({})", note_id, note.title);
                Ok(note)
            }
            Err(e) => {
                // Add context about what we were trying to do
                error!("Failed to update note {}: {}", note_id, e);
                
                // Check if this looks like a PROPERTY_NOT_ALLOWED error and provide additional context
                let error_str = e.to_string();
                if error_str.contains("PROPERTY_NOT_ALLOWED") || error_str.contains("Property not allowed") {
                    // Create an enhanced error with specific suggestions for this UpdateNoteRequest issue
                    let enhanced_msg = format!(
                        "{}\n\nDebugging UpdateNoteRequest issues:\n\
                        1. Ensure you're only setting valid properties: title, type, mime, content, isProtected\n\
                        2. Check that field names match the API specification exactly\n\
                        3. Avoid setting read-only properties like noteId, dateCreated, dateModified\n\
                        4. Enable debug mode (TRILIUM_DEBUG=1 or Ctrl+Alt+D) to see the full request payload",
                        error_str
                    );
                    Err(TriliumError::ValidationError(enhanced_msg))
                } else {
                    Err(e)
                }
            }
        }
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
            request = request.header("Authorization", token.as_str());
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
            request = request.header("Authorization", token.as_str());
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
        let start_time = Instant::now();
        let mut params = HashMap::new();
        params.insert("search", query.to_string());
        params.insert("fastSearch", fast_search.to_string());
        params.insert("includeArchivedNotes", include_archived.to_string());
        params.insert("limit", limit.to_string());

        let url = self.build_url("/notes");
        let mut request = self.client.get(&url).query(&params);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token.as_str());
        }

        let response = request.send().await?;
        let duration = start_time.elapsed();
        let search_response: SearchResponse = self.handle_response(response, duration).await?;
        Ok(search_response.results)
    }

    // Branches
    pub async fn create_branch(&self, request: CreateBranchRequest) -> Result<Branch> {
        self.send_request(reqwest::Method::POST, "/branches", Some(request))
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

    pub async fn get_note_branches(&self, note_id: &str) -> Result<Vec<Branch>> {
        self.send_request(
            reqwest::Method::GET,
            &format!("/notes/{}/branches", note_id),
            None::<()>,
        )
        .await
    }

    // Attributes
    pub async fn create_attribute(&self, request: CreateAttributeRequest) -> Result<Attribute> {
        self.send_request(reqwest::Method::POST, "/attributes", Some(request))
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
        let start_time = Instant::now();
        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("attachment");
        let title = title.unwrap_or_else(|| file_name.to_string());

        let file_content = std::fs::read(file_path)
            .map_err(TriliumError::IoError)?;

        let url = self.build_url(&format!("/notes/{}/attachments", note_id));
        let mut request = self.client.post(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token.as_str());
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
        let duration = start_time.elapsed();
        self.handle_response(response, duration).await
    }

    pub async fn download_attachment(&self, attachment_id: &str) -> Result<Vec<u8>> {
        let url = self.build_url(&format!("/attachments/{}/download", attachment_id));
        let mut request = self.client.get(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token.as_str());
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
        let start_time = Instant::now();
        let mut params = HashMap::new();
        if let Some(name) = backup_name {
            params.insert("backupName", name);
        }

        let url = self.build_url("/backup");
        let mut request = self.client.put(&url);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token.as_str());
        }

        if !params.is_empty() {
            request = request.query(&params);
        }

        let response = request.send().await?;
        let duration = start_time.elapsed();
        let backup_response: BackupResponse = self.handle_response(response, duration).await?;
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
            request = request.header("Authorization", token.as_str());
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
        let start_time = Instant::now();
        let url = self.build_url(&format!("/notes/{}/import", parent_id));
        let mut request = self.client.post(&url)
            .query(&[("format", format)])
            .body(content);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token.as_str());
        }

        let response = request.send().await?;
        let duration = start_time.elapsed();
        self.handle_response(response, duration).await
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

    // Enhanced search with regex and highlighting support
    pub async fn search_notes_enhanced(&self, query: &str, options: SearchOptions) -> Result<Vec<EnhancedSearchResult>> {
        let start_time = Instant::now();
        let mut params = HashMap::new();
        params.insert("search", query.to_string());
        params.insert("fastSearch", options.fast_search.to_string());
        params.insert("includeArchivedNotes", options.include_archived.to_string());
        params.insert("limit", options.limit.to_string());
        
        if options.regex_mode {
            params.insert("regexMode", "true".to_string());
        }

        let url = self.build_url("/notes");
        let mut request = self.client.get(&url).query(&params);

        if let Some(token) = &self.api_token {
            request = request.header("Authorization", token.as_str());
        }

        let response = request.send().await?;
        let duration = start_time.elapsed();
        let search_response: SearchResponse = self.handle_response(response, duration).await?;
        
        // Enhanced processing for highlighting and context
        let mut enhanced_results = Vec::new();
        for result in search_response.results {
            let content = if options.include_content {
                match self.get_note_content(&result.note_id).await {
                    Ok(content) => Some(content),
                    Err(_) => None,
                }
            } else {
                None
            };

            enhanced_results.push(EnhancedSearchResult {
                note_id: result.note_id,
                title: result.title,
                path: result.path,
                score: result.score,
                content,
                highlighted_snippets: Vec::new(), // Will be populated by utility functions
                context_lines: options.context_lines,
            });
        }
        
        Ok(enhanced_results)
    }

    // Get notes that link to a specific note (backlinks)
    pub async fn get_backlinks(&self, note_id: &str) -> Result<Vec<LinkReference>> {
        // First, search for notes containing links to this note
        let title_query = format!("[[{}]]", note_id);
        
        // Search by ID pattern
        let id_results = self.search_notes(&title_query, false, true, 1000).await?;
        
        // Also search by title if we can get the note
        let mut all_results = id_results;
        if let Ok(target_note) = self.get_note(note_id).await {
            let title_query = format!("[[{}]]", target_note.title);
            let title_results = self.search_notes(&title_query, false, true, 1000).await?;
            all_results.extend(title_results);
        }

        // Convert to LinkReference format
        let mut backlinks = Vec::new();
        for result in all_results {
            if result.note_id != note_id { // Don't include self-references
                if let Ok(_content) = self.get_note_content(&result.note_id).await {
                    backlinks.push(LinkReference {
                        from_note_id: result.note_id,
                        to_note_id: note_id.to_string(),
                        from_title: result.title,
                        link_text: String::new(), // Will be extracted from content
                        context: String::new(),   // Will be extracted from content
                    });
                }
            }
        }

        Ok(backlinks)
    }

    // Get all links from a note's content
    pub async fn get_outgoing_links(&self, note_id: &str) -> Result<Vec<LinkReference>> {
        let _content = self.get_note_content(note_id).await?;
        let _source_note = self.get_note(note_id).await?;
        
        let links = Vec::new();
        // This will be implemented with regex parsing utilities
        // For now, return empty vector
        
        Ok(links)
    }

    // Get all tags with their hierarchy
    pub async fn get_all_tags(&self) -> Result<Vec<TagInfo>> {
        // Search for all label attributes that represent tags
        let results = self.search_notes("#", false, true, 10000).await?;
        let mut tags = std::collections::HashSet::new();
        
        for result in results {
            if let Ok(attributes) = self.get_note_attributes(&result.note_id).await {
                for attr in attributes {
                    if attr.attr_type == "label" {
                        tags.insert(attr.name);
                    }
                }
            }
        }
        
        // Convert to TagInfo with hierarchy parsing
        let mut tag_infos = Vec::new();
        for tag in tags {
            let parts: Vec<&str> = tag.split('/').collect();
            tag_infos.push(TagInfo {
                name: tag.clone(),
                hierarchy: parts.iter().map(|s| s.to_string()).collect(),
                count: 0, // Will be calculated
                parent: if parts.len() > 1 { 
                    Some(parts[..parts.len()-1].join("/")) 
                } else { 
                    None 
                },
                children: Vec::new(),
            });
        }
        
        Ok(tag_infos)
    }

    // Search notes by tag pattern
    pub async fn search_by_tags(&self, tag_pattern: &str, _include_children: bool) -> Result<Vec<SearchResult>> {
        let query = if tag_pattern.starts_with('#') {
            tag_pattern.to_string()
        } else {
            format!("#{}", tag_pattern)
        };
        
        self.search_notes(&query, false, true, 1000).await
    }

    // Get notes that can be used as templates
    pub async fn get_templates(&self) -> Result<Vec<Template>> {
        // Look for notes with #template attribute or in a templates folder
        let template_results = self.search_notes("#template", false, true, 1000).await?;
        let mut templates = Vec::new();
        
        for result in template_results {
            if let Ok(content) = self.get_note_content(&result.note_id).await {
                templates.push(Template {
                    id: result.note_id,
                    title: result.title,
                    content,
                    variables: Vec::new(), // Will be extracted from content
                    description: String::new(),
                });
            }
        }
        
        Ok(templates)
    }

    // Create note from template with variable substitution
    pub async fn create_note_from_template(&self, template_id: &str, _variables: std::collections::HashMap<String, String>, parent_id: &str) -> Result<Note> {
        let template_content = self.get_note_content(template_id).await?;
        let template_note = self.get_note(template_id).await?;
        
        // Process template variables (will be implemented with template utilities)
        let processed_content = template_content; // Placeholder for now
        let processed_title = template_note.title; // Placeholder for now
        
        let request = CreateNoteRequest {
            parent_note_id: parent_id.to_string(),
            title: processed_title,
            note_type: template_note.note_type,
            content: processed_content,
            note_position: None,
            prefix: None,
            is_expanded: None,
            is_protected: None,
        };
        
        self.create_note(request).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        use crate::config::Profile;
        let mut config = Config::default();
        config.profiles.insert("default".to_string(), Profile {
            server_url: "http://localhost:9999".to_string(),
            api_token: Some(crate::config::SecureString::from("test_token")),
            default_parent_id: "root".to_string(),
            default_note_type: "text".to_string(),
            editor: None,
            timeout_seconds: 30,
            max_retries: 3,
            recent_notes: Vec::new(),
            bookmarked_notes: Vec::new(),
            max_recent_notes: 15,
        });
        config.current_profile = "default".to_string();
        config
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
        assert_eq!(client.api_token, Some(crate::config::SecureString::from("test_token")));
    }

    #[test]
    fn test_client_without_token() {
        let mut config = test_config();
        config.profiles.get_mut("default").unwrap().api_token = None;
        let client = TriliumClient::new(&config);
        assert!(client.is_ok());
        let client = client.unwrap();
        assert_eq!(client.api_token, None);
        assert_eq!(client.debug_mode, false);
    }

    #[test]
    fn test_debug_mode() {
        let config = test_config();
        let mut client = TriliumClient::new(&config).unwrap();
        assert_eq!(client.debug_mode, false);
        
        client.enable_debug_mode();
        assert_eq!(client.debug_mode, true);
        
        client.disable_debug_mode();
        assert_eq!(client.debug_mode, false);
        
        let client_with_debug = TriliumClient::new(&config).unwrap().with_debug_mode(true);
        assert_eq!(client_with_debug.debug_mode, true);
    }
}