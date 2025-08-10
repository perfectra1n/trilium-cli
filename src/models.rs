use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub note_id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub mime: Option<String>,
    pub is_protected: bool,
    pub date_created: DateTime<Utc>,
    pub date_modified: DateTime<Utc>,
    pub utc_date_created: DateTime<Utc>,
    pub utc_date_modified: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_note_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub child_note_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attributes: Option<Vec<Attribute>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub parent_note_id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_position: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_expanded: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_protected: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub note_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_protected: Option<bool>,
}

impl UpdateNoteRequest {
    /// Validate that the request doesn't contain read-only or invalid properties
    pub fn validate(&self) -> Result<(), crate::error::TriliumError> {
        use crate::error::TriliumError;
        
        // Check for empty title
        if let Some(ref title) = self.title {
            if title.trim().is_empty() {
                return Err(TriliumError::ValidationError(
                    "Note title cannot be empty".to_string()
                ));
            }
            
            // Check title length (reasonable limit)
            if title.len() > 1000 {
                return Err(TriliumError::ValidationError(
                    "Note title is too long (max 1000 characters)".to_string()
                ));
            }
        }
        
        // Check for valid note type
        if let Some(ref note_type) = self.note_type {
            let valid_types = ["text", "code", "file", "image", "search", "book", "relationMap", "canvas"];
            if !valid_types.contains(&note_type.as_str()) {
                return Err(TriliumError::ValidationError(
                    format!("Invalid note type '{}'. Valid types are: {}", 
                            note_type, 
                            valid_types.join(", "))
                ));
            }
        }
        
        // Check for valid MIME type format
        if let Some(ref mime) = self.mime {
            if !mime.contains('/') || mime.split('/').count() != 2 {
                return Err(TriliumError::ValidationError(
                    format!("Invalid MIME type format '{}'. Expected format: 'type/subtype'", mime)
                ));
            }
        }
        
        
        Ok(())
    }
    
    /// Create a safe UpdateNoteRequest builder to prevent invalid property setting
    pub fn builder() -> UpdateNoteRequestBuilder {
        UpdateNoteRequestBuilder::new()
    }
    
    /// Check if the request is empty (no fields set)
    pub fn is_empty(&self) -> bool {
        self.title.is_none() 
            && self.note_type.is_none() 
            && self.mime.is_none() 
            && self.is_protected.is_none()
    }
    
    /// Get a debug representation of the JSON that will be serialized
    pub fn debug_json(&self) -> String {
        match serde_json::to_string_pretty(self) {
            Ok(json) => json,
            Err(e) => format!("Failed to serialize to JSON: {}", e),
        }
    }
    
    /// Count how many fields are set in this request
    pub fn field_count(&self) -> usize {
        let mut count = 0;
        if self.title.is_some() { count += 1; }
        if self.note_type.is_some() { count += 1; }
        if self.mime.is_some() { count += 1; }
        if self.is_protected.is_some() { count += 1; }
        count
    }
}

/// Builder for UpdateNoteRequest that provides validation and prevents setting invalid properties
#[derive(Debug, Default)]
pub struct UpdateNoteRequestBuilder {
    title: Option<String>,
    note_type: Option<String>,
    mime: Option<String>,
    is_protected: Option<bool>,
}

impl UpdateNoteRequestBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn title<S: Into<String>>(mut self, title: S) -> Self {
        self.title = Some(title.into());
        self
    }
    
    pub fn note_type<S: Into<String>>(mut self, note_type: S) -> Self {
        self.note_type = Some(note_type.into());
        self
    }
    
    pub fn mime<S: Into<String>>(mut self, mime: S) -> Self {
        self.mime = Some(mime.into());
        self
    }
    
    
    pub fn is_protected(mut self, is_protected: bool) -> Self {
        self.is_protected = Some(is_protected);
        self
    }
    
    pub fn build(self) -> Result<UpdateNoteRequest, crate::error::TriliumError> {
        let request = UpdateNoteRequest {
            title: self.title,
            note_type: self.note_type,
            mime: self.mime,
            is_protected: self.is_protected,
        };
        
        // Validate the request before returning
        request.validate()?;
        Ok(request)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub branch_id: String,
    pub note_id: String,
    pub parent_note_id: String,
    pub note_position: i32,
    pub prefix: Option<String>,
    pub is_expanded: bool,
    pub utc_date_modified: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBranchRequest {
    pub note_id: String,
    pub parent_note_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_position: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_expanded: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBranchRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_position: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_expanded: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attribute {
    pub attribute_id: String,
    pub note_id: String,
    #[serde(rename = "type")]
    pub attr_type: String,
    pub name: String,
    pub value: String,
    pub position: i32,
    pub is_inheritable: bool,
    pub utc_date_modified: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAttributeRequest {
    pub note_id: String,
    #[serde(rename = "type")]
    pub attr_type: String,
    pub name: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_inheritable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAttributeRequest {
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub attachment_id: String,
    #[serde(rename = "ownerId")]
    pub owner_id: String,
    pub role: String,
    pub mime: String,
    pub title: String,
    pub position: i32,
    pub blob_id: String,
    pub date_modified: DateTime<Utc>,
    pub utc_date_modified: DateTime<Utc>,
    pub utc_date_scheduled_for_deletion: Option<DateTime<Utc>>,
    pub content_length: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub note_id: String,
    pub title: String,
    pub path: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub app_version: String,
    pub db_version: i32,
    pub sync_version: i32,
    pub build_date: String,
    pub build_revision: String,
    pub data_directory: String,
    pub clipper_protocol_version: String,
    pub utc_date_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResponse {
    pub backup_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarNote {
    pub date_note_id: String,
    pub month_note_id: String,
    pub year_note_id: String,
    pub week_note_id: String,
    pub exists: bool,
}

// Tree structure for TUI
#[derive(Debug, Clone, PartialEq)]
pub struct NoteTreeItem {
    pub note: Note,
    pub children: Vec<NoteTreeItem>,
    pub is_expanded: bool,
    pub depth: usize,
}

impl NoteTreeItem {
    pub fn new(note: Note, depth: usize) -> Self {
        Self {
            note,
            children: Vec::new(),
            is_expanded: false,
            depth,
        }
    }
}

// Enhanced search options
#[derive(Debug, Clone, Default)]
pub struct SearchOptions {
    pub fast_search: bool,
    pub include_archived: bool,
    pub limit: usize,
    pub regex_mode: bool,
    pub include_content: bool,
    pub context_lines: usize,
}

// Enhanced search result with highlighting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedSearchResult {
    pub note_id: String,
    pub title: String,
    pub path: String,
    pub score: f64,
    pub content: Option<String>,
    pub highlighted_snippets: Vec<HighlightedSnippet>,
    pub context_lines: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighlightedSnippet {
    pub line_number: usize,
    pub content: String,
    pub highlights: Vec<TextHighlight>,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextHighlight {
    pub start: usize,
    pub end: usize,
    pub match_text: String,
}

// Link reference for backlink tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkReference {
    pub from_note_id: String,
    pub to_note_id: String,
    pub from_title: String,
    pub link_text: String,
    pub context: String,
}

// Parsed wiki-style link
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParsedLink {
    pub link_type: LinkType,
    pub target: String,
    pub display_text: Option<String>,
    pub start_pos: usize,
    pub end_pos: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum LinkType {
    NoteId,
    NoteTitle,
}

// Tag information with hierarchy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagInfo {
    pub name: String,
    pub hierarchy: Vec<String>,
    pub count: usize,
    pub parent: Option<String>,
    pub children: Vec<String>,
}

// Template system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub title: String,
    pub content: String,
    pub variables: Vec<TemplateVariable>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateVariable {
    pub name: String,
    pub description: String,
    pub default_value: Option<String>,
    pub required: bool,
}

// Quick capture/inbox note
#[derive(Debug, Clone, Default)]
pub struct QuickCaptureRequest {
    pub content: String,
    pub tags: Vec<String>,
    pub title: Option<String>,
    pub inbox_note_id: Option<String>,
    pub metadata: std::collections::HashMap<String, String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_update_note_request_validation() {
        // Test valid request
        let valid_request = UpdateNoteRequest {
            title: Some("Valid Title".to_string()),
            note_type: Some("text".to_string()),
            mime: Some("text/html".to_string()),
            is_protected: Some(false),
        };
        assert!(valid_request.validate().is_ok());
        
        // Test empty title
        let empty_title_request = UpdateNoteRequest {
            title: Some("".to_string()),
            note_type: None,
            mime: None,
            is_protected: None,
        };
        assert!(empty_title_request.validate().is_err());
        
        // Test invalid note type
        let invalid_type_request = UpdateNoteRequest {
            title: None,
            note_type: Some("invalid_type".to_string()),
            mime: None,
            is_protected: None,
        };
        assert!(invalid_type_request.validate().is_err());
        
        // Test invalid MIME type
        let invalid_mime_request = UpdateNoteRequest {
            title: None,
            note_type: None,
            mime: Some("invalid_mime".to_string()),
            is_protected: None,
        };
        assert!(invalid_mime_request.validate().is_err());
    }
    
    #[test]
    fn test_update_note_request_builder() {
        let request = UpdateNoteRequest::builder()
            .title("Test Note")
            .note_type("text")
            .is_protected(false)
            .build();
        
        assert!(request.is_ok());
        let request = request.unwrap();
        assert_eq!(request.title, Some("Test Note".to_string()));
        assert_eq!(request.note_type, Some("text".to_string()));
        assert_eq!(request.is_protected, Some(false));
        
        // Test builder with invalid data
        let invalid_request = UpdateNoteRequest::builder()
            .title("")
            .build();
        assert!(invalid_request.is_err());
    }
    
    #[test]
    fn test_update_note_request_empty_check() {
        let empty_request = UpdateNoteRequest {
            title: None,
            note_type: None,
            mime: None,
            is_protected: None,
        };
        assert!(empty_request.is_empty());
        assert_eq!(empty_request.field_count(), 0);
        
        let non_empty_request = UpdateNoteRequest {
            title: Some("Test".to_string()),
            note_type: None,
            mime: None,
            is_protected: None,
        };
        assert!(!non_empty_request.is_empty());
        assert_eq!(non_empty_request.field_count(), 1);
    }
    
    #[test]
    fn test_update_note_request_json_serialization() {
        let request = UpdateNoteRequest {
            title: Some("Test Title".to_string()),
            note_type: Some("text".to_string()),
            mime: Some("text/html".to_string()),
            is_protected: Some(false),
        };
        
        let json = serde_json::to_string(&request).unwrap();
        println!("Serialized JSON: {}", json);
        
        // Verify the JSON contains the correct field names
        assert!(json.contains("\"title\":\"Test Title\""));
        assert!(json.contains("\"type\":\"text\"")); // Should be "type", not "noteType"
        assert!(json.contains("\"mime\":\"text/html\""));
        assert!(json.contains("\"isProtected\":false")); // Should be "isProtected", not "is_protected"
    }
    
    #[test]
    fn test_update_note_request_minimal_fields() {
        // Test that we can create a request with only title (common case for note editing)
        let title_only_request = UpdateNoteRequest {
            title: Some("Updated title".to_string()),
            note_type: None,
            mime: None,
            is_protected: None,
        };
        
        let json = serde_json::to_string(&title_only_request).unwrap();
        println!("Title-only JSON: {}", json);
        
        // Should only contain the title field
        assert!(json.contains("\"title\":\"Updated title\""));
        assert!(!json.contains("type"));
        assert!(!json.contains("mime"));
        assert!(!json.contains("isProtected"));
        
        assert_eq!(title_only_request.field_count(), 1);
        assert!(!title_only_request.is_empty());
    }
}

// Structured API error response from Trilium
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriliumApiErrorResponse {
    pub status: u16,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

// Debug information for API requests/responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRequestDebug {
    pub method: String,
    pub url: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
    pub timestamp: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponseDebug {
    pub status_code: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub duration_ms: u64,
    pub timestamp: chrono::DateTime<Utc>,
}