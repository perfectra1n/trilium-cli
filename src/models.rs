use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
#[derive(Debug, Clone)]
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

    pub fn count_visible_items(&self) -> usize {
        let mut count = 1;
        if self.is_expanded {
            for child in &self.children {
                count += child.count_visible_items();
            }
        }
        count
    }

    pub fn get_visible_items(&self) -> Vec<&NoteTreeItem> {
        let mut items = vec![self];
        if self.is_expanded {
            for child in &self.children {
                items.extend(child.get_visible_items());
            }
        }
        items
    }
}