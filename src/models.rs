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
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_protected: Option<bool>,
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