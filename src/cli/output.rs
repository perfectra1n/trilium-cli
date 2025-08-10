use crate::models::*;
use colored::Colorize;
use comfy_table::{modifiers::UTF8_ROUND_CORNERS, presets::UTF8_FULL, Table};
use serde::Serialize;

pub enum OutputFormat {
    Table,
    Json,
    Plain,
}

impl From<&str> for OutputFormat {
    fn from(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "json" => OutputFormat::Json,
            "plain" => OutputFormat::Plain,
            _ => OutputFormat::Table,
        }
    }
}

impl OutputFormat {
    pub fn from_string(s: &str) -> Result<Self, crate::error::TriliumError> {
        Ok(Self::from(s))
    }
}

pub fn print_notes(notes: &[Note], format: &str) {
    match OutputFormat::from(format) {
        OutputFormat::Json => print_json(notes),
        OutputFormat::Table => print_notes_table(notes),
        OutputFormat::Plain => print_notes_plain(notes),
    }
}

pub fn print_note(note: &Note, format: &str, show_content: bool) {
    match OutputFormat::from(format) {
        OutputFormat::Json => print_json(note),
        OutputFormat::Table => print_note_detail(note, show_content),
        OutputFormat::Plain => print_note_plain(note, show_content),
    }
}

pub fn print_search_results(results: &[SearchResult], format: &str) {
    match OutputFormat::from(format) {
        OutputFormat::Json => print_json(results),
        OutputFormat::Table => print_search_table(results),
        OutputFormat::Plain => print_search_plain(results),
    }
}

pub fn print_branches(branches: &[Branch], format: &str) {
    match OutputFormat::from(format) {
        OutputFormat::Json => print_json(branches),
        OutputFormat::Table => print_branches_table(branches),
        OutputFormat::Plain => print_branches_plain(branches),
    }
}

pub fn print_attributes(attributes: &[Attribute], format: &str) {
    match OutputFormat::from(format) {
        OutputFormat::Json => print_json(attributes),
        OutputFormat::Table => print_attributes_table(attributes),
        OutputFormat::Plain => print_attributes_plain(attributes),
    }
}

pub fn print_attachments(attachments: &[Attachment], format: &str) {
    match OutputFormat::from(format) {
        OutputFormat::Json => print_json(attachments),
        OutputFormat::Table => print_attachments_table(attachments),
        OutputFormat::Plain => print_attachments_plain(attachments),
    }
}

fn print_json<T: Serialize>(data: T) {
    match serde_json::to_string_pretty(&data) {
        Ok(json) => println!("{}", json),
        Err(e) => eprintln!("Error serializing to JSON: {}", e),
    }
}

fn print_notes_table(notes: &[Note]) {
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["ID", "Title", "Type", "Modified", "Protected"]);

    for note in notes {
        table.add_row(vec![
            note.note_id.clone(),
            note.title.clone(),
            note.note_type.clone(),
            note.date_modified.format("%Y-%m-%d %H:%M").to_string(),
            if note.is_protected { "Yes" } else { "No" }.to_string(),
        ]);
    }

    println!("{table}");
}

fn print_notes_plain(notes: &[Note]) {
    for note in notes {
        println!("{} - {} ({})", note.note_id, note.title, note.note_type);
    }
}

fn print_note_detail(note: &Note, show_content: bool) {
    println!("{}", "Note Details".bold().blue());
    println!("{}", "─".repeat(50));
    println!("{}: {}", "ID".bold(), note.note_id);
    println!("{}: {}", "Title".bold(), note.title);
    println!("{}: {}", "Type".bold(), note.note_type);
    if let Some(mime) = &note.mime {
        println!("{}: {}", "MIME".bold(), mime);
    }
    println!("{}: {}", "Protected".bold(), if note.is_protected { "Yes" } else { "No" });
    println!("{}: {}", "Created".bold(), note.date_created.format("%Y-%m-%d %H:%M:%S"));
    println!("{}: {}", "Modified".bold(), note.date_modified.format("%Y-%m-%d %H:%M:%S"));

    if let Some(parent_ids) = &note.parent_note_ids {
        if !parent_ids.is_empty() {
            println!("{}: {}", "Parents".bold(), parent_ids.join(", "));
        }
    }

    if let Some(child_ids) = &note.child_note_ids {
        if !child_ids.is_empty() {
            println!("{}: {} children", "Children".bold(), child_ids.len());
        }
    }

    if show_content {
        if let Some(content) = &note.content {
            println!("\n{}", "Content:".bold());
            println!("{}", "─".repeat(50));
            println!("{}", content);
        }
    }
}

fn print_note_plain(note: &Note, show_content: bool) {
    println!("{} - {}", note.note_id, note.title);
    if show_content {
        if let Some(content) = &note.content {
            println!("{}", content);
        }
    }
}

fn print_search_table(results: &[SearchResult]) {
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["ID", "Title", "Path", "Score"]);

    for result in results {
        table.add_row(vec![
            result.note_id.clone(),
            result.title.clone(),
            result.path.clone(),
            format!("{:.2}", result.score),
        ]);
    }

    println!("{table}");
}

fn print_search_plain(results: &[SearchResult]) {
    for result in results {
        println!("{} - {} (score: {:.2})", result.note_id, result.title, result.score);
        println!("  Path: {}", result.path);
    }
}

fn print_branches_table(branches: &[Branch]) {
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["Branch ID", "Note ID", "Parent ID", "Position", "Prefix"]);

    for branch in branches {
        table.add_row(vec![
            branch.branch_id.clone(),
            branch.note_id.clone(),
            branch.parent_note_id.clone(),
            branch.note_position.to_string(),
            branch.prefix.clone().unwrap_or_else(|| "-".to_string()),
        ]);
    }

    println!("{table}");
}

fn print_branches_plain(branches: &[Branch]) {
    for branch in branches {
        println!("{} - Note: {} -> Parent: {}", 
            branch.branch_id, branch.note_id, branch.parent_note_id);
    }
}

fn print_attributes_table(attributes: &[Attribute]) {
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["ID", "Type", "Name", "Value", "Inheritable"]);

    for attr in attributes {
        table.add_row(vec![
            attr.attribute_id.clone(),
            attr.attr_type.clone(),
            attr.name.clone(),
            attr.value.clone(),
            if attr.is_inheritable { "Yes" } else { "No" }.to_string(),
        ]);
    }

    println!("{table}");
}

fn print_attributes_plain(attributes: &[Attribute]) {
    for attr in attributes {
        println!("{}: {} = {}", attr.attr_type, attr.name, attr.value);
    }
}

fn print_attachments_table(attachments: &[Attachment]) {
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .apply_modifier(UTF8_ROUND_CORNERS)
        .set_header(vec!["ID", "Title", "MIME", "Size", "Modified"]);

    for att in attachments {
        let size = att.content_length
            .map(|s| format_size(s as u64))
            .unwrap_or_else(|| "-".to_string());
        
        table.add_row(vec![
            att.attachment_id.clone(),
            att.title.clone(),
            att.mime.clone(),
            size,
            att.date_modified.format("%Y-%m-%d %H:%M").to_string(),
        ]);
    }

    println!("{table}");
}

fn print_attachments_plain(attachments: &[Attachment]) {
    for att in attachments {
        println!("{} - {} ({})", att.attachment_id, att.title, att.mime);
    }
}

pub fn print_tree(items: &[NoteTreeItem], selected_index: Option<usize>) {
    for (index, item) in items.iter().enumerate() {
        let indent = "  ".repeat(item.depth);
        let prefix = if item.children.is_empty() {
            "─"
        } else if item.is_expanded {
            "▼"
        } else {
            "▶"
        };

        let line = format!("{}{} {} - {}", indent, prefix, item.note.note_id, item.note.title);
        
        if Some(index) == selected_index {
            println!("{}", line.bold().green());
        } else {
            println!("{}", line);
        }

        if item.is_expanded {
            print_tree(&item.children, None);
        }
    }
}

fn format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", size as u64, UNITS[unit_index])
    } else {
        format!("{:.2} {}", size, UNITS[unit_index])
    }
}

pub fn print_success(message: &str) {
    println!("{} {}", "✓".green().bold(), message);
}

pub fn print_error(message: &str) {
    eprintln!("{} {}", "✗".red().bold(), message);
}

pub fn print_warning(message: &str) {
    println!("{} {}", "!".yellow().bold(), message);
}

pub fn print_info(message: &str) {
    println!("{} {}", "ℹ".blue().bold(), message);
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn create_test_note() -> Note {
        Note {
            note_id: "test123".to_string(),
            title: "Test Note".to_string(),
            note_type: "text".to_string(),
            mime: Some("text/html".to_string()),
            is_protected: false,
            date_created: Utc::now(),
            date_modified: Utc::now(),
            utc_date_created: Utc::now(),
            utc_date_modified: Utc::now(),
            content: Some("Test content".to_string()),
            parent_note_ids: Some(vec!["root".to_string()]),
            child_note_ids: Some(vec!["child1".to_string(), "child2".to_string()]),
            attributes: None,
        }
    }

    fn create_test_search_result() -> SearchResult {
        SearchResult {
            note_id: "search123".to_string(),
            title: "Search Result".to_string(),
            path: "/root/folder/note".to_string(),
            score: 0.95,
        }
    }

    fn create_test_branch() -> Branch {
        Branch {
            branch_id: "branch123".to_string(),
            note_id: "note123".to_string(),
            parent_note_id: "parent123".to_string(),
            note_position: 10,
            prefix: Some("prefix".to_string()),
            is_expanded: true,
            utc_date_modified: Utc::now(),
        }
    }

    fn create_test_attribute() -> Attribute {
        Attribute {
            attribute_id: "attr123".to_string(),
            note_id: "note123".to_string(),
            attr_type: "label".to_string(),
            name: "test_label".to_string(),
            value: "test_value".to_string(),
            position: 0,
            is_inheritable: false,
            utc_date_modified: Utc::now(),
        }
    }

    fn create_test_attachment() -> Attachment {
        Attachment {
            attachment_id: "attach123".to_string(),
            owner_id: "note123".to_string(),
            title: "test.pdf".to_string(),
            role: "file".to_string(),
            mime: "application/pdf".to_string(),
            position: 0,
            blob_id: "blob123".to_string(),
            date_modified: Utc::now(),
            utc_date_modified: Utc::now(),
            utc_date_scheduled_for_deletion: None,
            content_length: Some(1024),
        }
    }

    #[test]
    fn test_output_format_from_string() {
        assert!(matches!(OutputFormat::from("json"), OutputFormat::Json));
        assert!(matches!(OutputFormat::from("plain"), OutputFormat::Plain));
        assert!(matches!(OutputFormat::from("table"), OutputFormat::Table));
        assert!(matches!(OutputFormat::from("unknown"), OutputFormat::Table));
        assert!(matches!(OutputFormat::from("JSON"), OutputFormat::Json));
    }

    #[test]
    fn test_json_output() {
        let note = create_test_note();
        let json = serde_json::to_string_pretty(&note).unwrap();
        
        // Verify it's valid JSON
        let parsed: Note = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.note_id, note.note_id);
        assert_eq!(parsed.title, note.title);
    }

    #[test]
    fn test_multiple_notes_json() {
        let notes = vec![
            create_test_note(),
            create_test_note(),
        ];
        
        let json = serde_json::to_string_pretty(&notes).unwrap();
        let parsed: Vec<Note> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), 2);
    }

    #[test]
    fn test_search_results_json() {
        let results = vec![
            create_test_search_result(),
            create_test_search_result(),
        ];
        
        let json = serde_json::to_string_pretty(&results).unwrap();
        let parsed: Vec<SearchResult> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].score, 0.95);
    }

    #[test]
    fn test_branches_json() {
        let branches = vec![
            create_test_branch(),
            create_test_branch(),
        ];
        
        let json = serde_json::to_string_pretty(&branches).unwrap();
        let parsed: Vec<Branch> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), 2);
    }

    #[test]
    fn test_attributes_json() {
        let attributes = vec![
            create_test_attribute(),
            create_test_attribute(),
        ];
        
        let json = serde_json::to_string_pretty(&attributes).unwrap();
        let parsed: Vec<Attribute> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].name, "test_label");
    }

    #[test]
    fn test_attachments_json() {
        let attachments = vec![
            create_test_attachment(),
            create_test_attachment(),
        ];
        
        let json = serde_json::to_string_pretty(&attachments).unwrap();
        let parsed: Vec<Attachment> = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].content_length, Some(1024));
    }

    #[test]
    fn test_table_formatting() {
        // Test that table creation doesn't panic
        let mut table = Table::new();
        table
            .load_preset(UTF8_FULL)
            .apply_modifier(UTF8_ROUND_CORNERS)
            .set_header(vec!["Column 1", "Column 2"]);
        
        table.add_row(vec!["Value 1", "Value 2"]);
        
        let output = format!("{}", table);
        assert!(output.contains("Column 1"));
        assert!(output.contains("Value 1"));
    }

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(0), "0 B");
        assert_eq!(format_size(512), "512 B");
        assert_eq!(format_size(1024), "1.00 KB");
        assert_eq!(format_size(1536), "1.50 KB");
        assert_eq!(format_size(1048576), "1.00 MB");
        assert_eq!(format_size(1073741824), "1.00 GB");
    }
}