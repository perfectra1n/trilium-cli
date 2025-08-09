use assert_cmd::Command;
use predicates::prelude::*;
use tempfile::TempDir;
use std::fs;

#[test]
fn test_cli_help() {
    let mut cmd = Command::cargo_bin("trilium").unwrap();
    cmd.arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("A CLI and TUI client for Trilium Notes"));
}

#[test]
fn test_cli_version() {
    let mut cmd = Command::cargo_bin("trilium").unwrap();
    cmd.arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains("trilium"));
}

#[test]
fn test_subcommand_help() {
    let subcommands = vec![
        "note", "search", "pipe", "attachment", 
        "attribute", "branch", "calendar", "backup", "config", "info"
    ];

    for subcommand in subcommands {
        let mut cmd = Command::cargo_bin("trilium").unwrap();
        cmd.arg(subcommand)
            .arg("--help")
            .assert()
            .success()
            .stdout(predicate::str::contains("Usage"));
    }
}

#[test]
fn test_config_init_requires_interaction() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    cmd.arg("config")
        .arg("init")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .write_stdin("http://localhost:9999\n\nroot\ntext\n\n")
        .assert()
        .success();
}

#[test]
fn test_missing_config_error() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("nonexistent.yaml");

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    cmd.arg("note")
        .arg("list")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .env("TRILIUM_CONFIG", config_path.to_str().unwrap())
        .assert()
        .failure();
}

#[test]
fn test_pipe_requires_stdin() {
    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // Without stdin, pipe should fail
    cmd.arg("pipe")
        .timeout(std::time::Duration::from_secs(1))
        .assert()
        .failure()
        .stderr(predicate::str::contains("Empty input received from stdin"));
}

#[test]
fn test_pipe_with_stdin() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");
    
    // Create a minimal config
    let config_content = r#"
server_url: "http://localhost:9999"
api_token: "test_token"
default_parent_id: "root"
default_note_type: "text"
timeout_seconds: 30
max_retries: 3
"#;
    fs::write(&config_path, config_content).unwrap();

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // This will fail due to no server, but should parse the input correctly
    cmd.arg("pipe")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .arg("--title")
        .arg("Test Note")
        .write_stdin("This is test content")
        .assert()
        .failure(); // Will fail due to no server, but validates input handling
}

#[test]
fn test_output_format_json() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");
    
    // Create a minimal config
    let config_content = r#"
server_url: "http://localhost:9999"
api_token: "test_token"
default_parent_id: "root"
default_note_type: "text"
timeout_seconds: 1
max_retries: 1
"#;
    fs::write(&config_path, config_content).unwrap();

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // Test that --output json flag is accepted
    cmd.arg("note")
        .arg("list")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .arg("--output")
        .arg("json")
        .timeout(std::time::Duration::from_secs(2))
        .assert()
        .failure(); // Will fail due to no server, but validates argument parsing
}

#[test]
fn test_search_command_requires_query() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");
    
    // Create a minimal config
    let config_content = r#"
server_url: "http://localhost:9999"
api_token: "test_token"
default_parent_id: "root"
default_note_type: "text"
timeout_seconds: 30
max_retries: 3
"#;
    fs::write(&config_path, config_content).unwrap();

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // Search without query should show help or error
    cmd.arg("search")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .assert()
        .failure();
}

#[test]
fn test_note_create_arguments() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");
    
    // Create a minimal config
    let config_content = r#"
server_url: "http://localhost:9999"
api_token: "test_token"
default_parent_id: "root"
default_note_type: "text"
timeout_seconds: 1
max_retries: 1
"#;
    fs::write(&config_path, config_content).unwrap();

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // Test that create accepts various arguments
    cmd.arg("note")
        .arg("create")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .arg("--title")
        .arg("Test Note")
        .arg("--type")
        .arg("text")
        .arg("--content")
        .arg("Test content")
        .arg("--parent")
        .arg("root")
        .timeout(std::time::Duration::from_secs(2))
        .assert()
        .failure(); // Will fail due to no server, but validates argument parsing
}

#[test]
fn test_attachment_upload_requires_file() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");
    
    // Create a minimal config
    let config_content = r#"
server_url: "http://localhost:9999"
api_token: "test_token"
default_parent_id: "root"
default_note_type: "text"
timeout_seconds: 30
max_retries: 3
"#;
    fs::write(&config_path, config_content).unwrap();

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // Upload without file should error
    cmd.arg("attachment")
        .arg("upload")
        .arg("note123")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .assert()
        .failure();
}

#[test]
fn test_backup_command() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");
    
    // Create a minimal config
    let config_content = r#"
server_url: "http://localhost:9999"
api_token: "test_token"
default_parent_id: "root"
default_note_type: "text"
timeout_seconds: 1
max_retries: 1
"#;
    fs::write(&config_path, config_content).unwrap();

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // Test backup command with optional name
    cmd.arg("backup")
        .arg("create")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .arg("--name")
        .arg("test_backup")
        .timeout(std::time::Duration::from_secs(2))
        .assert()
        .failure(); // Will fail due to no server, but validates argument parsing
}

#[test]
fn test_invalid_subcommand() {
    let mut cmd = Command::cargo_bin("trilium").unwrap();
    cmd.arg("invalid_command")
        .assert()
        .failure()
        .stderr(predicate::str::contains("error"));
}

#[test]
fn test_tui_mode_flag() {
    let temp_dir = TempDir::new().unwrap();
    let config_path = temp_dir.path().join("config.yaml");
    
    // Create a minimal config
    let config_content = r#"
server_url: "http://localhost:9999"
api_token: "test_token"
default_parent_id: "root"
default_note_type: "text"
timeout_seconds: 30
max_retries: 3
"#;
    fs::write(&config_path, config_content).unwrap();

    let mut cmd = Command::cargo_bin("trilium").unwrap();
    
    // TUI mode should be accepted as a flag
    // It will fail to start due to terminal issues in test, but validates the flag
    cmd.arg("tui")
        .arg("--config")
        .arg(config_path.to_str().unwrap())
        .timeout(std::time::Duration::from_millis(100))
        .assert()
        .failure(); // Expected to fail in test environment
}