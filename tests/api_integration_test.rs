use mockito::{Server, Matcher};
use serde_json::json;

mod common;

#[tokio::test]
async fn test_full_note_lifecycle() {
    // Test the complete lifecycle of a note: create, read, update, delete
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    // Mock create note
    let _create_mock = server.mock("POST", "/etapi/create-note")
        .match_body(Matcher::Json(json!({
            "parentNoteId": "root",
            "title": "Test Note",
            "type": "text",
            "content": "Initial content"
        })))
        .with_status(201)
        .with_body(json!({
            "noteId": "new123",
            "title": "Test Note",
            "type": "text",
            "mime": "text/html",
            "isProtected": false,
            "dateCreated": "2024-01-01T00:00:00.000Z",
            "dateModified": "2024-01-01T00:00:00.000Z",
            "utcDateCreated": "2024-01-01T00:00:00.000Z",
            "utcDateModified": "2024-01-01T00:00:00.000Z"
        }).to_string())
        .create_async().await;

    // Mock get note
    let _get_mock = server.mock("GET", "/etapi/notes/new123")
        .with_status(200)
        .with_body(json!({
            "noteId": "new123",
            "title": "Test Note",
            "type": "text",
            "mime": "text/html",
            "isProtected": false,
            "dateCreated": "2024-01-01T00:00:00.000Z",
            "dateModified": "2024-01-01T00:00:00.000Z",
            "utcDateCreated": "2024-01-01T00:00:00.000Z",
            "utcDateModified": "2024-01-01T00:00:00.000Z"
        }).to_string())
        .create_async().await;

    // Mock update content
    let _update_mock = server.mock("PUT", "/etapi/notes/new123/content")
        .match_body("Updated content")
        .with_status(204)
        .create_async().await;

    // Mock delete note
    let _delete_mock = server.mock("DELETE", "/etapi/notes/new123")
        .with_status(200)
        .with_body(json!({}).to_string())
        .create_async().await;

    // Execute lifecycle
    let create_request = trilium_cli::models::CreateNoteRequest {
        parent_note_id: "root".to_string(),
        title: "Test Note".to_string(),
        note_type: "text".to_string(),
        content: "Initial content".to_string(),
        ..Default::default()
    };

    let created = client.create_note(create_request).await.unwrap();
    assert_eq!(created.note_id, "new123");

    let fetched = client.get_note("new123").await.unwrap();
    assert_eq!(fetched.title, "Test Note");

    client.update_note_content("new123", "Updated content").await.unwrap();

    client.delete_note("new123").await.unwrap();
}

#[tokio::test]
async fn test_search_with_pagination() {
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    let _mock = server.mock("GET", "/etapi/notes")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("search".into(), "test query".into()),
            Matcher::UrlEncoded("limit".into(), "10".into()),
        ]))
        .with_status(200)
        .with_body(json!({
            "results": [
                {"noteId": "1", "title": "Result 1", "path": "path1", "score": 0.9},
                {"noteId": "2", "title": "Result 2", "path": "path2", "score": 0.8},
                {"noteId": "3", "title": "Result 3", "path": "path3", "score": 0.7}
            ]
        }).to_string())
        .create_async().await;

    let results = client.search_notes("test query", false, false, 10).await.unwrap();
    assert_eq!(results.len(), 3);
}

#[tokio::test]
async fn test_attachment_operations() {
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    // Mock get attachments
    let _list_mock = server.mock("GET", "/etapi/notes/note123/attachments")
        .with_status(200)
        .with_body(json!([
            {
                "attachmentId": "attach1",
                "ownerId": "note123",
                "title": "file1.pdf",
                "role": "file",
                "mime": "application/pdf",
                "position": 0,
                "blobId": "blob1",
                "dateModified": "2024-01-01T00:00:00.000Z",
                "utcDateModified": "2024-01-01T00:00:00.000Z",
                "contentLength": 1024
            },
            {
                "attachmentId": "attach2",
                "ownerId": "note123",
                "title": "file2.txt",
                "role": "file",
                "mime": "text/plain",
                "position": 1,
                "blobId": "blob2",
                "dateModified": "2024-01-01T00:00:00.000Z",
                "utcDateModified": "2024-01-01T00:00:00.000Z",
                "contentLength": 256
            }
        ]).to_string())
        .create_async().await;

    let attachments = client.get_note_attachments("note123").await.unwrap();
    assert_eq!(attachments.len(), 2);
    assert_eq!(attachments[0].title, "file1.pdf");
    assert_eq!(attachments[1].content_length, Some(256));
}

#[tokio::test]
async fn test_attribute_management() {
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    // Mock create attribute
    let _create_mock = server.mock("POST", "/etapi/attributes")
        .match_body(Matcher::Json(json!({
            "noteId": "note123",
            "type": "label",
            "name": "priority",
            "value": "high"
        })))
        .with_status(201)
        .with_body(json!({
            "attributeId": "attr123",
            "noteId": "note123",
            "type": "label",
            "name": "priority",
            "value": "high",
            "position": 0,
            "isInheritable": false,
            "isDeleted": false,
            "utcDateModified": "2024-01-01T00:00:00.000Z"
        }).to_string())
        .create_async().await;

    // Mock get attributes
    let _get_mock = server.mock("GET", "/etapi/notes/note123/attributes")
        .with_status(200)
        .with_body(json!([
            {
                "attributeId": "attr123",
                "noteId": "note123",
                "type": "label",
                "name": "priority",
                "value": "high",
                "position": 0,
                "isInheritable": false,
                "isDeleted": false,
                "utcDateModified": "2024-01-01T00:00:00.000Z"
            }
        ]).to_string())
        .create_async().await;

    let request = trilium_cli::models::CreateAttributeRequest {
        note_id: "note123".to_string(),
        attr_type: "label".to_string(),
        name: "priority".to_string(),
        value: "high".to_string(),
        is_inheritable: None,
        position: None,
    };

    let created = client.create_attribute(request).await.unwrap();
    assert_eq!(created.name, "priority");

    let attributes = client.get_note_attributes("note123").await.unwrap();
    assert_eq!(attributes.len(), 1);
    assert_eq!(attributes[0].value, "high");
}

#[tokio::test]
async fn test_error_handling() {
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    // Mock 404 error
    let _mock_404 = server.mock("GET", "/etapi/notes/nonexistent")
        .with_status(404)
        .with_body("Note not found")
        .create_async().await;

    let result = client.get_note("nonexistent").await;
    assert!(result.is_err());
    
    // Mock 401 error
    let _mock_401 = server.mock("GET", "/etapi/app-info")
        .with_status(401)
        .with_body("Unauthorized")
        .create_async().await;

    let result = client.get_app_info().await;
    assert!(result.is_err());

    // Mock 500 error
    let _mock_500 = server.mock("POST", "/etapi/notes")
        .with_status(500)
        .with_body("Internal server error")
        .create_async().await;

    let request = trilium_cli::models::CreateNoteRequest {
        parent_note_id: "root".to_string(),
        title: "Test".to_string(),
        note_type: "text".to_string(),
        content: "Content".to_string(),
        ..Default::default()
    };

    let result = client.create_note(request).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_calendar_operations() {
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    // Mock get calendar note
    let _get_mock = server.mock("GET", "/etapi/calendar/days/2024-01-15")
        .with_status(200)
        .with_body(json!({
            "dateNoteId": "cal123",
            "monthNoteId": "month123",
            "yearNoteId": "year123",
            "weekNoteId": "week123",
            "exists": true
        }).to_string())
        .create_async().await;

    // Mock create calendar note
    let _create_mock = server.mock("POST", "/etapi/calendar/days/2024-01-16")
        .with_status(201)
        .with_body(json!({
            "dateNoteId": "cal124",
            "monthNoteId": "month124",
            "yearNoteId": "year124",
            "weekNoteId": "week124",
            "exists": true
        }).to_string())
        .create_async().await;

    let existing = client.get_calendar_note("2024-01-15").await.unwrap();
    assert_eq!(existing.date_note_id, "cal123");

    let created = client.create_calendar_note("2024-01-16").await.unwrap();
    assert_eq!(created.date_note_id, "cal124");
}

#[tokio::test]
async fn test_backup_creation() {
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    let _mock = server.mock("PUT", "/etapi/backup")
        .match_query(Matcher::UrlEncoded("backupName".into(), "test_backup".into()))
        .with_status(200)
        .with_body(json!({
            "backupName": "test_backup_2024_01_01.db"
        }).to_string())
        .create_async().await;

    let backup_name = client.create_backup(Some("test_backup".to_string())).await.unwrap();
    assert!(backup_name.contains("test_backup"));
}

#[tokio::test]
async fn test_branch_operations() {
    let mut server = Server::new_async().await;
    let config = trilium_cli::config::Config {
        server_url: server.url(),
        api_token: Some(trilium_cli::config::SecureString::from("test_token")),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
        recent_notes: Vec::new(),
        bookmarked_notes: Vec::new(),
        max_recent_notes: 15,
    };
    let client = trilium_cli::api::TriliumClient::new(&config).unwrap();

    // Mock get branches
    let _get_mock = server.mock("GET", "/etapi/notes/note123/branches")
        .with_status(200)
        .with_body(json!([
            {
                "branchId": "branch1",
                "noteId": "note123",
                "parentNoteId": "root",
                "notePosition": 10,
                "prefix": "prefix1",
                "isExpanded": true,
                "utcDateModified": "2024-01-01T00:00:00.000Z"
            }
        ]).to_string())
        .create_async().await;

    // Mock create branch
    let _create_mock = server.mock("POST", "/etapi/branches")
        .match_body(Matcher::Json(json!({
            "noteId": "note123",
            "parentNoteId": "folder456"
        })))
        .with_status(201)
        .with_body(json!({
            "branchId": "branch2",
            "noteId": "note123",
            "parentNoteId": "folder456",
            "notePosition": 0,
            "isExpanded": false,
            "utcDateModified": "2024-01-01T00:00:00.000Z"
        }).to_string())
        .create_async().await;

    let branches = client.get_note_branches("note123").await.unwrap();
    assert_eq!(branches.len(), 1);
    assert_eq!(branches[0].parent_note_id, "root");

    let request = trilium_cli::models::CreateBranchRequest {
        note_id: "note123".to_string(),
        parent_note_id: "folder456".to_string(),
        note_position: None,
        prefix: None,
        is_expanded: None,
    };

    let created = client.create_branch(request).await.unwrap();
    assert_eq!(created.parent_note_id, "folder456");
}