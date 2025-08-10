use crate::api::TriliumClient;
use crate::config::Config;
use crate::error::{Result, TriliumError};
use crate::models::{Note, NoteTreeItem, CreateNoteRequest, UpdateNoteRequest};
use crate::tui::event::{Event, Events};
use crate::tui::ui;
use crate::cli::commands::note::validate_editor;
use crossterm::event::{KeyCode, KeyModifiers};
use ratatui::{backend::Backend, Terminal};
use std::time::{Duration, Instant};
use fuzzy_matcher::{FuzzyMatcher, skim::SkimMatcherV2};
use std::env;
use std::process::Command;
use std::fs;
use regex;
use std::collections::VecDeque;

// Helper function to sanitize filenames
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

/// Content format detected from note content and metadata
#[derive(Debug, Clone, PartialEq)]
enum ContentFormat {
    Html,
    Markdown,
    PlainText,
}

/// Content conversion result containing the converted content and detected format
#[derive(Debug, Clone)]
pub struct ContentConversionResult {
    content: String,
    original_format: ContentFormat,
    editing_format: ContentFormat,
}

/// Content format handler for bidirectional conversion between formats
struct ContentFormatHandler;

impl ContentFormatHandler {
    /// Detect content format from note metadata and content
    fn detect_format(note: &Note, content: &str) -> ContentFormat {
        // First check MIME type from note metadata
        if let Some(mime) = &note.mime {
            if mime.contains("html") {
                return ContentFormat::Html;
            }
            if mime.contains("markdown") || mime.contains("md") {
                return ContentFormat::Markdown;
            }
        }
        
        // Check note type
        if note.note_type == "text" {
            // Analyze content for HTML tags
            if Self::looks_like_html(content) {
                return ContentFormat::Html;
            }
            // Check for markdown patterns
            if Self::looks_like_markdown(content) {
                return ContentFormat::Markdown;
            }
        }
        
        ContentFormat::PlainText
    }
    
    /// Check if content looks like HTML
    fn looks_like_html(content: &str) -> bool {
        let html_indicators = [
            "<html>", "<body>", "<div>", "<p>", "<span>", "<h1>", "<h2>", "<h3>",
            "<strong>", "<em>", "<a href=", "<img", "<ul>", "<ol>", "<li>",
            "<table>", "<tr>", "<td>", "<th>", "<br>", "<br/>", "&nbsp;", "&amp;",
            "&lt;", "&gt;", "&quot;"
        ];
        
        let content_lower = content.to_lowercase();
        html_indicators.iter().any(|indicator| content_lower.contains(indicator))
    }
    
    /// Check if content looks like markdown
    fn looks_like_markdown(content: &str) -> bool {
        let markdown_indicators = [
            "# ", "## ", "### ", "#### ", "##### ", "###### ",
            "**", "__", "*", "_", 
            "```", "`",
            "- ", "* ", 
            "1. ", "2. ", "3. ",
            "[]", "[x]",
            "](" // link syntax
        ];
        
        markdown_indicators.iter().any(|indicator| content.contains(indicator))
    }
    
    /// Convert content to editing format (HTML -> Markdown for better editing experience)
    fn prepare_for_editing(note: &Note, content: &str) -> ContentConversionResult {
        let original_format = Self::detect_format(note, content);
        
        match original_format {
            ContentFormat::Html => {
                // Convert HTML to Markdown for editing
                let markdown_content = Self::html_to_markdown(content);
                ContentConversionResult {
                    content: markdown_content,
                    original_format: ContentFormat::Html,
                    editing_format: ContentFormat::Markdown,
                }
            }
            ContentFormat::Markdown => {
                // Already Markdown, use as-is
                ContentConversionResult {
                    content: content.to_string(),
                    original_format: ContentFormat::Markdown,
                    editing_format: ContentFormat::Markdown,
                }
            }
            ContentFormat::PlainText => {
                // Plain text, use as-is
                ContentConversionResult {
                    content: content.to_string(),
                    original_format: ContentFormat::PlainText,
                    editing_format: ContentFormat::PlainText,
                }
            }
        }
    }
    
    /// Convert edited content back to Trilium format (Markdown -> HTML if original was HTML)
    fn prepare_for_saving(conversion_result: &ContentConversionResult, edited_content: &str) -> String {
        match (&conversion_result.original_format, &conversion_result.editing_format) {
            // If original was HTML and we edited in Markdown, convert back to HTML
            (ContentFormat::Html, ContentFormat::Markdown) => {
                Self::markdown_to_html(edited_content)
            }
            // If original was Markdown, save as HTML (Trilium stores as HTML)
            (ContentFormat::Markdown, ContentFormat::Markdown) => {
                Self::markdown_to_html(edited_content)
            }
            // Plain text - wrap in basic HTML paragraph if needed
            (ContentFormat::PlainText, ContentFormat::PlainText) => {
                if edited_content.trim().is_empty() {
                    edited_content.to_string()
                } else {
                    // For plain text, we can either save as-is or wrap in basic HTML
                    // Trilium can handle plain text, so save as-is
                    edited_content.to_string()
                }
            }
            // Fallback - save as-is
            _ => edited_content.to_string(),
        }
    }
    
    /// Get appropriate file extension for editing
    fn get_file_extension(conversion_result: &ContentConversionResult) -> &'static str {
        match conversion_result.editing_format {
            ContentFormat::Html => "html",
            ContentFormat::Markdown => "md",
            ContentFormat::PlainText => "txt",
        }
    }
    
    /// Convert HTML to Markdown using html2md
    fn html_to_markdown(html: &str) -> String {
        // Use html2md for conversion
        html2md::parse_html(html)
    }
    
    /// Convert Markdown to HTML using pulldown-cmark
    fn markdown_to_html(markdown: &str) -> String {
        use pulldown_cmark::{Parser, Options, html};
        
        // Set up parser options for better compatibility
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);
        options.insert(Options::ENABLE_TASKLISTS);
        options.insert(Options::ENABLE_SMART_PUNCTUATION);
        
        let parser = Parser::new_ext(markdown, options);
        let mut html_output = String::new();
        html::push_html(&mut html_output, parser);
        
        html_output
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum InputMode {
    Normal,
    Editing,
    Search,
    FuzzySearch,
    Command,
    Help,
    LogViewer,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ViewMode {
    Tree,
    Content,
    Attributes,
    Search,
    Recent,
    Bookmarks,
    Split,
    LogViewer,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Error => write!(f, "ERROR"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LogEntry {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub level: LogLevel,
    pub operation: String,
    pub message: String,
}

impl LogEntry {
    pub fn new(level: LogLevel, operation: String, message: String) -> Self {
        Self {
            timestamp: chrono::Utc::now(),
            level,
            operation,
            message,
        }
    }
    
    pub fn debug(operation: String, message: String) -> Self {
        Self::new(LogLevel::Debug, operation, message)
    }
    
    pub fn info(operation: String, message: String) -> Self {
        Self::new(LogLevel::Info, operation, message)
    }
    
    pub fn warn(operation: String, message: String) -> Self {
        Self::new(LogLevel::Warn, operation, message)
    }
    
    pub fn error(operation: String, message: String) -> Self {
        Self::new(LogLevel::Error, operation, message)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FuzzySearchResult {
    pub item: NoteTreeItem,
    pub score: i64,
    pub indices: Vec<usize>,
}

pub struct App {
    pub client: TriliumClient,
    pub config: Config,
    pub tree_items: Vec<NoteTreeItem>,
    pub selected_index: usize,
    pub current_note: Option<Note>,
    pub current_content: Option<String>,
    pub current_content_conversion: Option<ContentConversionResult>,
    pub input_mode: InputMode,
    pub view_mode: ViewMode,
    pub input: String,
    pub search_query: String,
    pub search_results: Vec<Note>,
    pub status_message: Option<String>,
    pub status_message_time: Option<Instant>,
    pub should_quit: bool,
    pub scroll_offset: usize,
    pub content_scroll: usize,
    
    // Enhanced navigation features
    pub fuzzy_matcher: SkimMatcherV2,
    pub fuzzy_search_query: String,
    pub fuzzy_search_results: Vec<FuzzySearchResult>,
    pub fuzzy_selected_index: usize,
    
    // Recent notes
    pub recent_selected_index: usize,
    
    // Bookmarks
    pub bookmark_selected_index: usize,
    
    // Search navigation
    pub search_match_index: usize,
    pub total_search_matches: usize,
    
    // Split pane
    pub split_pane_focused: SplitPane,
    pub split_ratio: f32,
    
    // Performance optimizations
    pub fuzzy_search_cache: Option<Vec<NoteTreeItem>>,
    pub fuzzy_search_cache_version: u64,
    pub tree_version: u64,
    
    // Debug mode
    pub debug_mode: bool,
    
    // Log viewer
    pub log_entries: VecDeque<LogEntry>,
    pub log_selected_index: usize,
    pub log_scroll_offset: usize,
    
}

#[derive(Debug, Clone, PartialEq)]
pub enum SplitPane {
    Left,
    Right,
}

// Constants for cache management
const MAX_FUZZY_CACHE_SIZE: usize = 10000;
const STATUS_MESSAGE_TIMEOUT_SECS: u64 = 5;
const MAX_LOG_ENTRIES: usize = 200;

impl App {
    pub async fn new(config: Config) -> Result<Self> {
        let mut client = TriliumClient::new(&config)?;
        
        // Check if debug mode is enabled via environment variable
        let debug_mode = std::env::var("TRILIUM_DEBUG")
            .map(|v| v.to_lowercase() == "true" || v == "1")
            .unwrap_or(false);
        
        if debug_mode {
            client.enable_debug_mode();
        }
        
        // Load root notes
        let root_notes = client.get_child_notes("root").await
            .unwrap_or_default();
        
        let tree_items = root_notes.into_iter()
            .map(|note| NoteTreeItem::new(note, 0))
            .collect();

        let mut app = Self {
            client,
            config,
            tree_items,
            selected_index: 0,
            current_note: None,
            current_content: None,
            current_content_conversion: None,
            input_mode: InputMode::Normal,
            view_mode: ViewMode::Tree,
            input: String::new(),
            search_query: String::new(),
            search_results: Vec::new(),
            status_message: None,
            status_message_time: None,
            should_quit: false,
            scroll_offset: 0,
            content_scroll: 0,
            
            // Enhanced navigation features
            fuzzy_matcher: SkimMatcherV2::default(),
            fuzzy_search_query: String::new(),
            fuzzy_search_results: Vec::new(),
            fuzzy_selected_index: 0,
            
            // Recent notes
            recent_selected_index: 0,
            
            // Bookmarks
            bookmark_selected_index: 0,
            
            // Search navigation
            search_match_index: 0,
            total_search_matches: 0,
            
            // Split pane
            split_pane_focused: SplitPane::Left,
            split_ratio: 0.5,
            
            // Performance optimizations
            fuzzy_search_cache: None,
            fuzzy_search_cache_version: 0,
            tree_version: 0,
            
            // Debug mode
            debug_mode,
            
            // Log viewer
            log_entries: VecDeque::new(),
            log_selected_index: 0,
            log_scroll_offset: 0,
        };
        
        // Add initial log entries
        app.add_log_entry(LogLevel::Info, "Application".to_string(), "Trilium CLI started".to_string());
        app.add_log_entry(LogLevel::Info, "Tree Loading".to_string(), format!("Loaded {} root notes", app.tree_items.len()));
        
        if debug_mode {
            app.add_log_entry(LogLevel::Debug, "Debug Mode".to_string(), "Debug mode enabled via TRILIUM_DEBUG environment variable".to_string());
        }
        
        Ok(app)
    }

    pub async fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        let events = Events::new(Duration::from_millis(250))?;

        loop {
            terminal.draw(|f| ui::draw(f, self))?;

            match events.next()? {
                Event::Input(key) => {
                    // Check for suspicious key sequences that might indicate escape sequence contamination
                    if self.is_suspicious_input(&key) {
                        self.set_status_message("Detected unusual input sequence - clearing input buffer".to_string());
                        events.flush_input();
                        continue;
                    }
                    
                    if let Err(e) = self.handle_input_with_terminal(key, terminal, &events).await {
                        self.set_status_message(format!("Error: {}", e));
                    }
                }
                Event::Tick => {
                    // Clear status message after timeout
                    self.clear_status_if_expired();
                    
                    // Perform cache maintenance periodically
                    self.maintain_fuzzy_cache();
                }
            }

            if self.should_quit {
                break;
            }
        }

        Ok(())
    }
    
    async fn handle_input_with_terminal<B: Backend>(&mut self, key: crossterm::event::KeyEvent, terminal: &mut Terminal<B>, events: &Events) -> Result<()> {
        // Check if we need to launch external editor
        if self.input_mode == InputMode::Normal && (key.code == KeyCode::Char('e') || key.code == KeyCode::Char('i')) && key.modifiers.is_empty() {
            // Suspend terminal before launching editor
            self.suspend_and_edit_note(terminal, events).await?;
        } else {
            self.handle_input(key).await?;
        }
        Ok(())
    }
    
    // Helper method to set status message with timestamp
    fn set_status_message(&mut self, message: String) {
        // Also add status messages to logs for user reference
        self.add_log_entry(LogLevel::Info, "Status".to_string(), message.clone());
        self.status_message = Some(message);
        self.status_message_time = Some(Instant::now());
    }
    
    // Clear status message if it has expired
    fn clear_status_if_expired(&mut self) {
        if let Some(time) = self.status_message_time {
            if time.elapsed().as_secs() >= STATUS_MESSAGE_TIMEOUT_SECS {
                self.status_message = None;
                self.status_message_time = None;
            }
        }
    }
    
    // Maintain fuzzy search cache size
    fn maintain_fuzzy_cache(&mut self) {
        if let Some(cache) = &mut self.fuzzy_search_cache {
            if cache.len() > MAX_FUZZY_CACHE_SIZE {
                // Keep only the most recent entries
                let excess = cache.len() - MAX_FUZZY_CACHE_SIZE;
                cache.drain(0..excess);
            }
        }
    }

    async fn suspend_and_edit_note<B: Backend>(&mut self, terminal: &mut Terminal<B>, events: &Events) -> Result<()> {
        use crossterm::{terminal::{disable_raw_mode, enable_raw_mode}, execute};
        use crossterm::terminal::{LeaveAlternateScreen, EnterAlternateScreen};
        use crossterm::event::{DisableMouseCapture, EnableMouseCapture};
        use std::io;
        
        // RAII guard for terminal restoration with comprehensive cleanup
        struct TerminalGuard<'a> {
            events: &'a Events,
        }
        
        impl<'a> Drop for TerminalGuard<'a> {
            fn drop(&mut self) {
                // Best effort terminal restoration with buffer clearing
                let _ = enable_raw_mode();
                let _ = execute!(
                    io::stdout(),
                    EnterAlternateScreen,
                    EnableMouseCapture
                );
                
                // Flush any pending input to prevent escape sequences from leaking
                self.events.flush_input();
                self.events.resume();
            }
        }
        
        // First, make sure we have a note selected from the tree
        let visible_items = self.get_visible_items();
        if let Some(item) = visible_items.get(self.selected_index) {
            // Load the note if not already loaded
            if self.current_note.is_none() || 
               self.current_note.as_ref().map(|n| &n.note_id) != Some(&item.note.note_id) {
                self.load_current_note().await?;
            }
            
            // Extract note data and prepare content for editing
            let (note_id, title, content_for_editing, conversion_result) = if let Some(note) = &self.current_note {
                let raw_content = self.current_content.clone().unwrap_or_default();
                
                // Use content format handler to prepare content for editing
                let conversion = ContentFormatHandler::prepare_for_editing(note, &raw_content);
                let editing_content = conversion.content.clone();
                
                // Extract data we need before borrowing self mutably
                let note_id = note.note_id.clone();
                let note_title = note.title.clone();
                
                // Show user what format they're editing (not currently used but prepared for future enhancements)
                
                (note_id, note_title, editing_content, Some(conversion))
            } else {
                self.set_status_message("Unable to load note for editing".to_string());
                return Ok(());
            };
            
            // Now we can borrow self mutably to set the status message
            self.set_status_message(format!("Editing {} in {} format", title, 
                match conversion_result.as_ref().map(|c| &c.editing_format) {
                    Some(ContentFormat::Markdown) => "Markdown",
                    Some(ContentFormat::Html) => "HTML", 
                    Some(ContentFormat::PlainText) => "plain text",
                    _ => "text",
                }));
            
            {
                // content already extracted above
                
                // Suspend event processing to prevent escape sequence capture
                events.suspend();
                
                // Flush any existing input before switching modes
                events.flush_input();
                
                // Suspend the terminal with RAII guard for safety
                disable_raw_mode()?;
                execute!(
                    io::stdout(),
                    LeaveAlternateScreen,
                    DisableMouseCapture
                )?;
                terminal.show_cursor()?;
                
                // Create guard to ensure terminal is restored even on panic
                let _guard = TerminalGuard { events };
                
                // Launch external editor and get the edited content
                let result = self.launch_external_editor_secure(&content_for_editing, &title, conversion_result.as_ref());
                
                // Drop guard and manually restore terminal (guard handles errors)
                drop(_guard);
                
                // Additional manual cleanup for good measure
                events.flush_input();
                
                // Ensure terminal is properly restored
                enable_raw_mode()?;
                execute!(
                    io::stdout(),
                    EnterAlternateScreen,
                    EnableMouseCapture
                )?;
                terminal.hide_cursor()?;
                terminal.clear()?;
                
                // Force a full terminal reset and redraw to ensure clean state
                terminal.clear()?;
                terminal.draw(|f| ui::draw(f, self))?;
                
                // Additional safety: ensure events are resumed and buffers are clean
                events.resume();
                events.flush_input();
                
                // Small delay to allow terminal to fully stabilize
                std::thread::sleep(std::time::Duration::from_millis(50));
                
                // Validate that terminal state is clean and responsive
                let terminal_state_ok = events.validate_terminal_state();
                if !terminal_state_ok {
                    self.set_status_message("Warning: Terminal state validation failed after editor".to_string());
                }
                
                // Handle the result
                match result {
                    Ok(edited_content) => {
                        // Check if content was modified
                        if edited_content != content_for_editing {
                            // Convert edited content back to Trilium format using the conversion result
                            let content_for_saving = if let Some(ref conversion) = conversion_result {
                                let converted = ContentFormatHandler::prepare_for_saving(conversion, &edited_content);
                                
                                // Show user what conversion is happening
                                let save_msg = match (&conversion.original_format, &conversion.editing_format) {
                                    (ContentFormat::Html, ContentFormat::Markdown) => "Converting Markdown back to HTML for Trilium",
                                    (ContentFormat::Markdown, ContentFormat::Markdown) => "Converting Markdown to HTML for Trilium",
                                    (ContentFormat::PlainText, ContentFormat::PlainText) => "Saving as plain text",
                                    _ => "Preparing content for save",
                                };
                                self.set_status_message(save_msg.to_string());
                                
                                converted
                            } else {
                                // Fallback if no conversion result
                                edited_content.clone()
                            };
                            
                            // Update the note content using the correct API endpoint for content
                            if self.debug_mode {
                                let request_debug = format!(
                                    "Sending content update for note {}: original_length={}, edited_length={}, final_length={}", 
                                    note_id, 
                                    content_for_editing.len(),
                                    edited_content.len(),
                                    content_for_saving.len()
                                );
                                self.write_debug_log("Note Content Update Request", &request_debug);
                            }
                            
                            match self.client.update_note_content(&note_id, &content_for_saving).await {
                                Ok(()) => {
                                    // Store the raw content that was saved to Trilium
                                    self.current_content = Some(content_for_saving);
                                    // Update the conversion result for future edits
                                    self.current_content_conversion = conversion_result;
                                    self.set_status_message("Note content saved successfully".to_string());
                                }
                                Err(e) => {
                                    // Create comprehensive error information
                                    let error_details = format!(
                                        "Note content save failed - Note ID: {}, Error: {:#?}, Error Type: {}", 
                                        note_id, e, e.category()
                                    );
                                    
                                    let error_msg = if self.debug_mode {
                                        // In debug mode, show full error with detailed information
                                        format!("Failed to save note content: {:#?}", e)
                                    } else {
                                        // For user-facing errors, show the complete message without truncation
                                        let base_msg = format!("Failed to save note content: {}", e);
                                        // Ensure we capture the full error message without arbitrary truncation
                                        if base_msg.len() > 300 {
                                            // Only truncate if extremely long, with clear indication
                                            format!("{}... (Enable debug mode with Ctrl+Alt+D for full details)", 
                                                    base_msg.chars().take(250).collect::<String>())
                                        } else {
                                            base_msg
                                        }
                                    };
                                    self.set_status_message(error_msg);
                                    
                                    // Always log comprehensive error details
                                    self.write_debug_log("Note Content Save Error", &error_details);
                                    
                                    // Additional structured logging for different error types
                                    match e {
                                        crate::error::TriliumError::ValidationError(msg) => {
                                            self.write_debug_log("Validation Error Details", &msg);
                                        }
                                        crate::error::TriliumError::ApiError(msg) => {
                                            self.write_debug_log("API Error Details", &msg);
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        } else {
                            self.set_status_message("No changes made".to_string());
                        }
                    }
                    Err(e) => {
                        self.set_status_message(format!("Failed to open editor: {}", e));
                    }
                }
            }
        } else {
            self.set_status_message("Select a note from the tree to edit".to_string());
        }
        Ok(())
    }

    async fn handle_input(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        // Add debug logging for all key presses when debug mode is enabled
        if self.debug_mode {
            let key_desc = format!(
                "Key: {:?}, Modifiers: {:?}, Mode: {:?}",
                key.code, key.modifiers, self.input_mode
            );
            self.add_log_entry(LogLevel::Debug, "Key Press".to_string(), key_desc);
        }
        
        match self.input_mode {
            InputMode::Normal => self.handle_normal_mode(key).await?,
            InputMode::Editing => self.handle_editing_mode(key).await?,
            InputMode::Search => self.handle_search_mode(key).await?,
            InputMode::FuzzySearch => self.handle_fuzzy_search_mode(key).await?,
            InputMode::Command => self.handle_command_mode(key).await?,
            InputMode::Help => self.handle_help_mode(key),
            InputMode::LogViewer => self.handle_log_viewer_mode(key),
        }
        Ok(())
    }

    async fn handle_fuzzy_search_mode(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        match key.code {
            KeyCode::Esc => {
                self.input_mode = InputMode::Normal;
                self.fuzzy_search_query.clear();
                self.fuzzy_search_results.clear();
            }
            KeyCode::Enter => {
                if !self.fuzzy_search_results.is_empty() && self.fuzzy_selected_index < self.fuzzy_search_results.len() {
                    let selected_result = &self.fuzzy_search_results[self.fuzzy_selected_index];
                    let note_id = selected_result.item.note.note_id.clone();
                    let title = selected_result.item.note.title.clone();
                    
                    // Find and select the note in the tree
                    if let Some(index) = self.find_note_in_tree(&note_id) {
                        self.selected_index = index;
                        self.load_current_note().await?;
                        // Add to recent notes
                        if let Err(e) = self.config.add_recent_note(note_id, title) {
                            self.set_status_message(format!("Warning: Failed to add to recent notes: {}", e));
                        } else if let Err(e) = self.config.save(None) {
                            self.set_status_message(format!("Warning: Failed to save config: {}", e));
                        }
                    }
                }
                self.input_mode = InputMode::Normal;
                self.fuzzy_search_query.clear();
                self.fuzzy_search_results.clear();
            }
            KeyCode::Up => {
                if !self.fuzzy_search_results.is_empty() && self.fuzzy_selected_index > 0 {
                    self.fuzzy_selected_index -= 1;
                }
            }
            KeyCode::Down => {
                if !self.fuzzy_search_results.is_empty() && self.fuzzy_selected_index < self.fuzzy_search_results.len() - 1 {
                    self.fuzzy_selected_index += 1;
                }
            }
            KeyCode::Backspace => {
                self.fuzzy_search_query.pop();
                self.perform_fuzzy_search();
            }
            KeyCode::Char(c) => {
                self.fuzzy_search_query.push(c);
                self.perform_fuzzy_search();
            }
            _ => {}
        }
        Ok(())
    }

    async fn handle_normal_mode(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        match key.code {
            // Basic navigation
            KeyCode::Char('q') if key.modifiers.is_empty() => self.should_quit = true,
            KeyCode::Char('?') if key.modifiers.is_empty() => {
                self.input_mode = InputMode::Help;
            }
            
            // Vim-like navigation
            KeyCode::Up | KeyCode::Char('k') if key.modifiers.is_empty() => self.handle_navigation_up(),
            KeyCode::Down | KeyCode::Char('j') if key.modifiers.is_empty() => self.handle_navigation_down(),
            KeyCode::Left | KeyCode::Char('h') if key.modifiers.is_empty() => self.handle_navigation_left().await?,
            KeyCode::Right | KeyCode::Char('l') if key.modifiers.is_empty() => {
                self.add_log_entry(LogLevel::Debug, "Key Handler".to_string(), 
                                   "Lowercase l or right arrow pressed - navigating right".to_string());
                self.handle_navigation_right().await?;
            }
            
            // Vim-like jump commands
            KeyCode::Char('g') if key.modifiers.contains(KeyModifiers::NONE) => {
                self.go_to_top();
            }
            KeyCode::Char('G') => {
                self.go_to_bottom();
            }
            
            // Open/close operations
            KeyCode::Enter | KeyCode::Char('o') => self.handle_open_note().await?,
            KeyCode::Char('c') if key.modifiers.is_empty() => self.collapse_current(),
            
            
            // Search modes
            KeyCode::Char('/') => {
                self.input_mode = InputMode::FuzzySearch;
                self.fuzzy_search_query.clear();
                self.fuzzy_search_results.clear();
                self.fuzzy_selected_index = 0;
            }
            KeyCode::Char('*') => {
                self.input_mode = InputMode::Search;
                self.input.clear();
            }
            KeyCode::Char('n') => self.search_next(),
            KeyCode::Char('N') => self.search_previous(),
            
            // Recent and bookmarks
            KeyCode::Char('R') => {
                self.view_mode = ViewMode::Recent;
                self.recent_selected_index = 0;
            }
            KeyCode::Char('B') => {
                self.view_mode = ViewMode::Bookmarks;
                self.bookmark_selected_index = 0;
            }
            KeyCode::Char('b') => self.toggle_bookmark().await?,
            
            // Split pane
            KeyCode::Char('s') => self.toggle_split_view(),
            KeyCode::Char('<') => self.adjust_split_left(),
            KeyCode::Char('>') => self.adjust_split_right(),
            
            // Command mode and actions
            KeyCode::Char(':') => {
                self.input_mode = InputMode::Command;
                self.input.clear();
            }
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => self.create_note_prompt(),
            KeyCode::Char('e') if key.modifiers.is_empty() => {
                // External editor will be launched via handle_input_with_terminal
                // This is handled at a higher level now
            }
            KeyCode::Char('i') if key.modifiers.is_empty() => {
                // External editor will be launched via handle_input_with_terminal
                // This is handled at a higher level now
            }
            KeyCode::Char('d') if key.modifiers.contains(KeyModifiers::CONTROL) => self.delete_note_prompt().await?,
            KeyCode::Char('r') if key.modifiers.is_empty() => self.refresh_tree().await?,
            
            // Tab navigation between panes
            KeyCode::Tab => self.switch_pane(),
            KeyCode::BackTab => self.switch_pane_reverse(),
            
            // ESC key to go back/cancel
            KeyCode::Esc => self.handle_escape(),
            
            // Content scrolling
            KeyCode::PageUp => self.scroll_content_up(),
            KeyCode::PageDown => self.scroll_content_down(),
            
            // Debug mode toggle (Ctrl+Alt+D)
            KeyCode::Char('d') if key.modifiers.contains(KeyModifiers::CONTROL) && key.modifiers.contains(KeyModifiers::ALT) => self.toggle_debug_mode(),
            
            // Alternative log viewer key (Ctrl+L)
            KeyCode::Char('l') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.add_log_entry(LogLevel::Debug, "Key Handler".to_string(), 
                                   "Ctrl+L pressed - opening log viewer (alternative)".to_string());
                self.input_mode = InputMode::LogViewer;
                self.view_mode = ViewMode::LogViewer;
                self.log_selected_index = 0;
                self.log_scroll_offset = 0;
            }
            
            _ => {}
        }
        Ok(())
    }

    async fn handle_editing_mode(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        match key.code {
            KeyCode::Esc => {
                self.input_mode = InputMode::Normal;
                self.input.clear();
            }
            KeyCode::Enter => {
                self.process_editing_input().await?;
                self.input_mode = InputMode::Normal;
                self.input.clear();
            }
            KeyCode::Backspace => {
                self.input.pop();
            }
            KeyCode::Char(c) => {
                self.input.push(c);
            }
            _ => {}
        }
        Ok(())
    }

    async fn handle_search_mode(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        match key.code {
            KeyCode::Esc => {
                self.input_mode = InputMode::Normal;
                self.input.clear();
            }
            KeyCode::Enter => {
                self.perform_search().await?;
                self.input_mode = InputMode::Normal;
                self.search_query = self.input.clone();
                self.input.clear();
            }
            KeyCode::Backspace => {
                self.input.pop();
            }
            KeyCode::Char(c) => {
                self.input.push(c);
            }
            _ => {}
        }
        Ok(())
    }

    async fn handle_command_mode(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        match key.code {
            KeyCode::Esc => {
                self.input_mode = InputMode::Normal;
                self.input.clear();
            }
            KeyCode::Enter => {
                self.process_command().await?;
                self.input_mode = InputMode::Normal;
                self.input.clear();
            }
            KeyCode::Backspace => {
                self.input.pop();
            }
            KeyCode::Char(c) => {
                self.input.push(c);
            }
            _ => {}
        }
        Ok(())
    }

    fn move_selection_up(&mut self) {
        if self.selected_index > 0 {
            self.selected_index -= 1;
            self.adjust_scroll();
        }
    }

    fn move_selection_down(&mut self) {
        let visible_items = self.get_visible_items();
        if self.selected_index < visible_items.len().saturating_sub(1) {
            self.selected_index += 1;
            self.adjust_scroll();
        }
    }

    fn adjust_scroll(&mut self) {
        // Implement scrolling logic to keep selected item visible
        // This is simplified - you may want more sophisticated scrolling
        if self.selected_index < self.scroll_offset {
            self.scroll_offset = self.selected_index;
        } else if self.selected_index >= self.scroll_offset + 20 {
            self.scroll_offset = self.selected_index.saturating_sub(19);
        }
    }

    async fn expand_current(&mut self) -> Result<()> {
        let (note_id, needs_children) = {
            let visible_items = self.get_visible_items();
            if let Some(item) = visible_items.get(self.selected_index) {
                if !item.is_expanded {
                    (Some(item.note.note_id.clone()), item.children.is_empty())
                } else {
                    (None, false)
                }
            } else {
                (None, false)
            }
        };
        
        if let Some(id) = note_id {
            if needs_children {
                let children = self.client.get_child_notes(&id).await?;
                self.update_tree_children(&id, children)?;
            }
            self.toggle_expansion(&id);
        }
        Ok(())
    }

    fn collapse_current(&mut self) {
        let note_id = {
            let visible_items = self.get_visible_items();
            if let Some(item) = visible_items.get(self.selected_index) {
                if item.is_expanded {
                    Some(item.note.note_id.clone())
                } else {
                    None
                }
            } else {
                None
            }
        };
        
        if let Some(id) = note_id {
            self.toggle_expansion(&id);
        }
    }

    fn toggle_expansion(&mut self, note_id: &str) {
        fn toggle_recursive(items: &mut [NoteTreeItem], note_id: &str) -> bool {
            for item in items.iter_mut() {
                if item.note.note_id == note_id {
                    item.is_expanded = !item.is_expanded;
                    return true;
                }
                if toggle_recursive(&mut item.children, note_id) {
                    return true;
                }
            }
            false
        }
        toggle_recursive(&mut self.tree_items, note_id);
    }

    fn update_tree_children(&mut self, parent_id: &str, children: Vec<Note>) -> Result<()> {
        fn update_recursive(items: &mut [NoteTreeItem], parent_id: &str, children: Vec<Note>, depth: usize) -> bool {
            for item in items.iter_mut() {
                if item.note.note_id == parent_id {
                    item.children = children.into_iter()
                        .map(|note| NoteTreeItem::new(note, depth + 1))
                        .collect();
                    return true;
                }
                if update_recursive(&mut item.children, parent_id, children.clone(), depth + 1) {
                    return true;
                }
            }
            false
        }
        update_recursive(&mut self.tree_items, parent_id, children, 0);
        self.tree_version += 1; // Increment version to invalidate cache
        Ok(())
    }

    async fn load_current_note(&mut self) -> Result<()> {
        let (note_id, title) = {
            let visible_items = self.get_visible_items();
            if let Some(item) = visible_items.get(self.selected_index) {
                (item.note.note_id.clone(), item.note.title.clone())
            } else {
                return Ok(());
            }
        };
        
        let note = self.client.get_note(&note_id).await?;
        let raw_content = self.client.get_note_content(&note_id).await.ok();
        
        // Use content format handler for display content
        let (display_content, conversion_result) = if let Some(ref content) = raw_content {
            // Prepare content for editing to get proper conversion info
            let conversion = ContentFormatHandler::prepare_for_editing(&note, content);
            
            // For display, convert HTML to readable text if it's HTML content
            let display_text = match ContentFormatHandler::detect_format(&note, content) {
                ContentFormat::Html => Self::html_to_text(content),
                _ => content.clone(),
            };
            
            (Some(display_text), Some(conversion))
        } else {
            (raw_content, None)
        };
        
        // Add to recent notes
        if let Err(e) = self.config.add_recent_note(note_id.clone(), title.clone()) {
            self.set_status_message(format!("Warning: Failed to add to recent notes: {}", e));
        } else if let Err(e) = self.config.save(None) {
            self.set_status_message(format!("Warning: Failed to save config: {}", e));
        }
        
        self.current_note = Some(note);
        self.current_content = display_content;
        self.current_content_conversion = conversion_result;
        self.view_mode = ViewMode::Content;
        self.content_scroll = 0;
        self.set_status_message(format!("Loaded: {}", title));
        Ok(())
    }
    
    fn html_to_text(html: &str) -> String {
        // First try to parse as HTML and convert to readable text
        use html2text::from_read;
        
        // Configure html2text for better terminal display
        let width = 100; // Terminal width for wrapping
        
        // Convert HTML to plain text with proper formatting
        let text = from_read(html.as_bytes(), width);
        
        // Clean up the text for better terminal display
        let mut result = String::new();
        let mut last_was_empty = false;
        
        for line in text.lines() {
            let trimmed = line.trim();
            
            // Skip multiple consecutive empty lines
            if trimmed.is_empty() {
                if !last_was_empty {
                    result.push('\n');
                    last_was_empty = true;
                }
            } else {
                // Remove common HTML artifacts including numeric entities
                let cleaned = Self::decode_html_entities(trimmed);
                
                result.push_str(&cleaned);
                result.push('\n');
                last_was_empty = false;
            }
        }
        
        // Final cleanup - remove trailing whitespace and excessive newlines
        result = result.trim().to_string();
        while result.contains("\n\n\n") {
            result = result.replace("\n\n\n", "\n\n");
        }
        
        result
    }
    
    // Comprehensive HTML entity decoder
    fn decode_html_entities(text: &str) -> String {
        use std::collections::HashMap;
        
        // Build entity map
        let mut entities = HashMap::new();
        entities.insert("&nbsp;", " ");
        entities.insert("&amp;", "&");
        entities.insert("&lt;", "<");
        entities.insert("&gt;", ">");
        entities.insert("&quot;", "\"");
        entities.insert("&#39;", "'");
        entities.insert("&#x27;", "'");
        entities.insert("&apos;", "'");
        entities.insert("&cent;", "¢");
        entities.insert("&pound;", "£");
        entities.insert("&yen;", "¥");
        entities.insert("&euro;", "€");
        entities.insert("&copy;", "©");
        entities.insert("&reg;", "®");
        
        let mut result = text.to_string();
        
        // Replace named entities
        for (entity, replacement) in entities {
            result = result.replace(entity, replacement);
        }
        
        // Handle numeric entities (decimal): &#123;
        if let Ok(regex) = regex::Regex::new(r"&#(\d+);") {
            result = regex.replace_all(&result, |caps: &regex::Captures| {
                if let Ok(code) = caps[1].parse::<u32>() {
                    if let Some(ch) = char::from_u32(code) {
                        ch.to_string()
                    } else {
                        caps[0].to_string() // Keep original if invalid
                    }
                } else {
                    caps[0].to_string() // Keep original if can't parse
                }
            }).to_string();
        }
        
        // Handle hexadecimal numeric entities: &#x1F; or &#X1F;
        if let Ok(regex) = regex::Regex::new(r"&#[xX]([0-9a-fA-F]+);") {
            result = regex.replace_all(&result, |caps: &regex::Captures| {
                if let Ok(code) = u32::from_str_radix(&caps[1], 16) {
                    if let Some(ch) = char::from_u32(code) {
                        ch.to_string()
                    } else {
                        caps[0].to_string() // Keep original if invalid
                    }
                } else {
                    caps[0].to_string() // Keep original if can't parse
                }
            }).to_string();
        }
        
        result
    }

    // Enhanced navigation methods
    fn handle_navigation_up(&mut self) {
        match self.view_mode {
            ViewMode::Recent => {
                if self.recent_selected_index > 0 {
                    self.recent_selected_index -= 1;
                }
            }
            ViewMode::Bookmarks => {
                if self.bookmark_selected_index > 0 {
                    self.bookmark_selected_index -= 1;
                }
            }
            _ => {
                self.move_selection_up();
            }
        }
    }

    fn handle_navigation_down(&mut self) {
        match self.view_mode {
            ViewMode::Recent => {
                let recent_count = self.config.current_profile()
                    .map(|p| p.recent_notes.len())
                    .unwrap_or(0);
                if self.recent_selected_index < recent_count.saturating_sub(1) {
                    self.recent_selected_index += 1;
                }
            }
            ViewMode::Bookmarks => {
                let bookmark_count = self.config.current_profile()
                    .map(|p| p.bookmarked_notes.len())
                    .unwrap_or(0);
                if self.bookmark_selected_index < bookmark_count.saturating_sub(1) {
                    self.bookmark_selected_index += 1;
                }
            }
            _ => {
                self.move_selection_down();
            }
        }
    }

    async fn handle_navigation_left(&mut self) -> Result<()> {
        match self.view_mode {
            ViewMode::Split => {
                self.split_pane_focused = SplitPane::Left;
            }
            _ => {
                self.collapse_current();
            }
        }
        Ok(())
    }

    async fn handle_navigation_right(&mut self) -> Result<()> {
        match self.view_mode {
            ViewMode::Split => {
                self.split_pane_focused = SplitPane::Right;
            }
            _ => {
                self.expand_current().await?;
            }
        }
        Ok(())
    }

    async fn handle_open_note(&mut self) -> Result<()> {
        match self.view_mode {
            ViewMode::Recent => {
                if let Some(profile) = self.config.profiles.get(&self.config.current_profile) {
                    if let Some(recent_note) = profile.recent_notes.get(self.recent_selected_index) {
                        if let Some(index) = self.find_note_in_tree(&recent_note.note_id) {
                            self.selected_index = index;
                            self.view_mode = ViewMode::Content;
                            self.load_current_note().await?;
                        }
                    }
                }
            }
            ViewMode::Bookmarks => {
                if let Some(bookmark) = self.config.current_profile().unwrap().bookmarked_notes.get(self.bookmark_selected_index) {
                    if let Some(index) = self.find_note_in_tree(&bookmark.note_id) {
                        self.selected_index = index;
                        self.view_mode = ViewMode::Content;
                        self.load_current_note().await?;
                    }
                }
            }
            _ => {
                self.load_current_note().await?;
            }
        }
        Ok(())
    }

    fn go_to_top(&mut self) {
        match self.view_mode {
            ViewMode::Recent => self.recent_selected_index = 0,
            ViewMode::Bookmarks => self.bookmark_selected_index = 0,
            _ => {
                self.selected_index = 0;
                self.scroll_offset = 0;
            }
        }
    }

    fn go_to_bottom(&mut self) {
        match self.view_mode {
            ViewMode::Recent => {
                let recent_count = self.config.current_profile()
                    .map(|p| p.recent_notes.len())
                    .unwrap_or(0);
                self.recent_selected_index = recent_count.saturating_sub(1);
            }
            ViewMode::Bookmarks => {
                let bookmark_count = self.config.current_profile()
                    .map(|p| p.bookmarked_notes.len())
                    .unwrap_or(0);
                self.bookmark_selected_index = bookmark_count.saturating_sub(1);
            }
            _ => {
                let visible_items = self.get_visible_items();
                self.selected_index = visible_items.len().saturating_sub(1);
                self.adjust_scroll();
            }
        }
    }

    async fn toggle_bookmark(&mut self) -> Result<()> {
        if let Some(note) = &self.current_note {
            let is_bookmarked = self.config.toggle_bookmark(note.note_id.clone(), note.title.clone())?;
            if let Err(e) = self.config.save(None) {
                self.set_status_message(format!("Warning: Failed to save config: {}", e));
                return Ok(());
            }
            
            let status = if is_bookmarked {
                format!("Bookmarked: {}", note.title)
            } else {
                format!("Removed bookmark: {}", note.title)
            };
            self.set_status_message(status);
        }
        Ok(())
    }

    fn toggle_split_view(&mut self) {
        self.view_mode = if self.view_mode == ViewMode::Split {
            ViewMode::Tree
        } else {
            ViewMode::Split
        };
    }

    fn adjust_split_left(&mut self) {
        if self.view_mode == ViewMode::Split {
            self.split_ratio = (self.split_ratio - 0.05).max(0.1);
        }
    }

    fn adjust_split_right(&mut self) {
        if self.view_mode == ViewMode::Split {
            self.split_ratio = (self.split_ratio + 0.05).min(0.9);
        }
    }

    fn search_next(&mut self) {
        if self.total_search_matches > 0 {
            self.search_match_index = (self.search_match_index + 1) % self.total_search_matches;
            self.set_status_message(format!("Match {}/{}", self.search_match_index + 1, self.total_search_matches));
        }
    }

    fn search_previous(&mut self) {
        if self.total_search_matches > 0 {
            self.search_match_index = if self.search_match_index == 0 {
                self.total_search_matches - 1
            } else {
                self.search_match_index - 1
            };
            self.set_status_message(format!("Match {}/{}", self.search_match_index + 1, self.total_search_matches));
        }
    }

    fn perform_fuzzy_search(&mut self) {
        if self.fuzzy_search_query.is_empty() {
            self.fuzzy_search_results.clear();
            return;
        }

        // Build or update cache if needed
        if self.fuzzy_search_cache.is_none() || self.fuzzy_search_cache_version != self.tree_version {
            let mut cache = Vec::new();
            Self::collect_all_notes_for_fuzzy_search(&self.tree_items, &mut cache);
            self.fuzzy_search_cache = Some(cache);
            self.fuzzy_search_cache_version = self.tree_version;
        }

        let mut results: Vec<FuzzySearchResult> = Vec::new();
        
        // Use cached items for better performance
        if let Some(cache) = &self.fuzzy_search_cache {
            for item in cache {
                if let Some((score, indices)) = self.fuzzy_matcher.fuzzy_indices(&item.note.title, &self.fuzzy_search_query) {
                    results.push(FuzzySearchResult {
                        item: item.clone(),
                        score,
                        indices,
                    });
                }
            }
        }
        
        // Sort by score (higher is better)
        results.sort_by(|a, b| b.score.cmp(&a.score));
        
        // Limit results to prevent UI clutter and improve performance
        results.truncate(50);
        
        self.fuzzy_search_results = results;
        self.fuzzy_selected_index = 0;
    }

    fn collect_all_notes_for_fuzzy_search(items: &[NoteTreeItem], results: &mut Vec<NoteTreeItem>) {
        for item in items {
            results.push(item.clone());
            Self::collect_all_notes_for_fuzzy_search(&item.children, results);
        }
    }

    fn find_note_in_tree(&self, note_id: &str) -> Option<usize> {
        let visible_items = self.get_visible_items();
        for (index, item) in visible_items.iter().enumerate() {
            if item.note.note_id == note_id {
                return Some(index);
            }
        }
        None
    }

    fn cycle_view_mode(&mut self) {
        self.view_mode = match self.view_mode {
            ViewMode::Tree => ViewMode::Content,
            ViewMode::Content => ViewMode::Attributes,
            ViewMode::Attributes => ViewMode::Search,
            ViewMode::Search => ViewMode::Recent,
            ViewMode::Recent => ViewMode::Bookmarks,
            ViewMode::Bookmarks => ViewMode::Split,
            ViewMode::Split => ViewMode::Tree,
            ViewMode::LogViewer => ViewMode::Tree, // Return to tree from log viewer
        };
    }

    async fn perform_search(&mut self) -> Result<()> {
        let results = self.client.search_notes(&self.input, false, false, 50).await?;
        self.search_results = Vec::new();
        
        for result in results {
            if let Ok(note) = self.client.get_note(&result.note_id).await {
                self.search_results.push(note);
            }
        }
        
        self.view_mode = ViewMode::Search;
        self.set_status_message(format!("Found {} results", self.search_results.len()));
        Ok(())
    }

    async fn process_command(&mut self) -> Result<()> {
        let parts: Vec<&str> = self.input.split_whitespace().collect();
        if parts.is_empty() {
            return Ok(());
        }

        match parts[0] {
            "new" | "create" => {
                if parts.len() > 1 {
                    let title = parts[1..].join(" ");
                    self.create_note(&title).await?;
                }
            }
            "delete" | "rm" => {
                if let Some(note) = &self.current_note {
                    self.client.delete_note(&note.note_id).await?;
                    self.set_status_message(format!("Deleted: {}", note.title));
                    self.refresh_tree().await?;
                }
            }
            "refresh" | "reload" => {
                self.refresh_tree().await?;
            }
            "quit" | "q" => {
                self.should_quit = true;
            }
            _ => {
                self.set_status_message(format!("Unknown command: {}", parts[0]));
            }
        }
        Ok(())
    }

    async fn create_note(&mut self, title: &str) -> Result<()> {
        let parent_id = self.current_note
            .as_ref()
            .map(|n| n.note_id.clone())
            .unwrap_or_else(|| "root".to_string());

        let request = CreateNoteRequest {
            parent_note_id: parent_id,
            title: title.to_string(),
            note_type: "text".to_string(),
            content: String::new(),
            note_position: None,
            prefix: None,
            is_expanded: None,
            is_protected: None,
        };

        let note = self.client.create_note(request).await?;
        self.set_status_message(format!("Created: {}", note.title));
        self.refresh_tree().await?;
        Ok(())
    }

    async fn refresh_tree(&mut self) -> Result<()> {
        let root_notes = self.client.get_child_notes("root").await?;
        self.tree_items = root_notes.into_iter()
            .map(|note| NoteTreeItem::new(note, 0))
            .collect();
        self.tree_version += 1; // Increment version to invalidate cache
        self.set_status_message("Tree refreshed".to_string());
        Ok(())
    }

    fn create_note_prompt(&mut self) {
        self.input_mode = InputMode::Editing;
        self.input.clear();
        self.set_status_message("Enter note title:".to_string());
    }


    async fn delete_note_prompt(&mut self) -> Result<()> {
        if let Some(note) = &self.current_note {
            self.client.delete_note(&note.note_id).await?;
            self.set_status_message(format!("Deleted: {}", note.title));
            self.current_note = None;
            self.current_content = None;
            self.current_content_conversion = None;
            self.refresh_tree().await?;
        }
        Ok(())
    }

    async fn process_editing_input(&mut self) -> Result<()> {
        if self.input.is_empty() {
            return Ok(());
        }

        let input = self.input.clone();
        
        if let Some(note_id) = self.current_note.as_ref().map(|n| n.note_id.clone()) {
            // Update existing note metadata (title) with validated request
            let request = match UpdateNoteRequest::builder()
                .title(input.clone())
                .build() {
                    Ok(req) => req,
                    Err(e) => {
                        self.set_status_message(format!("Validation error: {}", e));
                        return Ok(());
                    }
                };
            
            if self.debug_mode {
                let request_debug = format!(
                    "Sending metadata update for note {}: field_count={}", 
                    note_id, 
                    request.field_count()
                );
                self.write_debug_log("Note Metadata Update Request", &request_debug);
                self.write_debug_log("Request JSON", &request.debug_json());
            }
            
            match self.client.update_note(&note_id, request).await {
                Ok(updated) => {
                    let title = updated.title.clone();
                    self.current_note = Some(updated);
                    self.set_status_message(format!("Updated title: {}", title));
                    self.refresh_tree().await?;
                }
                Err(e) => {
                    let error_details = format!(
                        "Note metadata update failed - Note ID: {}, Error: {:#?}, Error Type: {}", 
                        note_id, e, e.category()
                    );
                    
                    let error_msg = if self.debug_mode {
                        format!("Failed to update note metadata: {:#?}", e)
                    } else {
                        let base_msg = format!("Failed to update note metadata: {}", e);
                        if base_msg.len() > 300 {
                            format!("{}... (Use Ctrl+Alt+D for full details)", 
                                    base_msg.chars().take(250).collect::<String>())
                        } else {
                            base_msg
                        }
                    };
                    self.set_status_message(error_msg);
                    
                    // Always log comprehensive error details
                    self.write_debug_log("Note Metadata Update Error", &error_details);
                    
                    // Additional structured logging for different error types
                    match e {
                        crate::error::TriliumError::ValidationError(msg) => {
                            self.write_debug_log("Validation Error Details", &msg);
                        }
                        crate::error::TriliumError::ApiError(msg) => {
                            self.write_debug_log("API Error Details", &msg);
                        }
                        _ => {}
                    }
                    
                    return Ok(()); // Return early, don't refresh tree on error
                }
            }
        } else {
            // Create new note
            self.create_note(&input).await?;
        }
        Ok(())
    }

    fn scroll_content_up(&mut self) {
        if self.content_scroll > 0 {
            self.content_scroll = self.content_scroll.saturating_sub(5);
        }
    }

    fn scroll_content_down(&mut self) {
        self.content_scroll += 5;
    }

    
    fn handle_help_mode(&mut self, key: crossterm::event::KeyEvent) {
        match key.code {
            KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('?') => {
                self.input_mode = InputMode::Normal;
            }
            _ => {}
        }
    }
    
    fn handle_log_viewer_mode(&mut self, key: crossterm::event::KeyEvent) {
        match key.code {
            KeyCode::Esc | KeyCode::Char('q') => {
                self.input_mode = InputMode::Normal;
                self.view_mode = ViewMode::Tree;
            }
            KeyCode::Up | KeyCode::Char('k') => {
                self.log_navigate_up();
            }
            KeyCode::Down | KeyCode::Char('j') => {
                self.log_navigate_down();
            }
            KeyCode::PageUp => {
                for _ in 0..10 {
                    self.log_navigate_up();
                }
            }
            KeyCode::PageDown => {
                for _ in 0..10 {
                    self.log_navigate_down();
                }
            }
            KeyCode::Home | KeyCode::Char('g') => {
                self.log_selected_index = 0;
                self.log_scroll_offset = 0;
            }
            KeyCode::End | KeyCode::Char('G') => {
                let len = self.log_entries.len();
                if len > 0 {
                    self.log_selected_index = len - 1;
                    self.log_adjust_scroll();
                }
            }
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                // Clear logs
                self.log_entries.clear();
                self.log_selected_index = 0;
                self.log_scroll_offset = 0;
                self.add_log_entry(LogLevel::Info, "Log Viewer".to_string(), "Log entries cleared".to_string());
            }
            _ => {}
        }
    }
    
    
    fn switch_pane(&mut self) {
        match self.view_mode {
            ViewMode::Split => {
                self.split_pane_focused = match self.split_pane_focused {
                    SplitPane::Left => SplitPane::Right,
                    SplitPane::Right => SplitPane::Left,
                };
            }
            _ => {
                self.cycle_view_mode();
            }
        }
    }
    
    fn switch_pane_reverse(&mut self) {
        match self.view_mode {
            ViewMode::Split => {
                self.split_pane_focused = match self.split_pane_focused {
                    SplitPane::Left => SplitPane::Right,
                    SplitPane::Right => SplitPane::Left,
                };
            }
            _ => {
                // Cycle through view modes in reverse order
                self.view_mode = match self.view_mode {
                    ViewMode::Tree => ViewMode::Split,
                    ViewMode::Content => ViewMode::Tree,
                    ViewMode::Attributes => ViewMode::Content,
                    ViewMode::Search => ViewMode::Attributes,
                    ViewMode::Recent => ViewMode::Search,
                    ViewMode::Bookmarks => ViewMode::Recent,
                    ViewMode::Split => ViewMode::Bookmarks,
                    ViewMode::LogViewer => ViewMode::Tree, // Return to tree from log viewer
                };
            }
        }
    }
    
    fn handle_escape(&mut self) {
        match self.view_mode {
            ViewMode::Content | ViewMode::Attributes | ViewMode::Search | ViewMode::Recent | ViewMode::Bookmarks | ViewMode::LogViewer => {
                self.view_mode = ViewMode::Tree;
            }
            _ => {}
        }
    }

    fn get_visible_items(&self) -> Vec<&NoteTreeItem> {
        let mut items = Vec::new();
        fn collect_visible<'a>(items: &mut Vec<&'a NoteTreeItem>, tree_items: &'a [NoteTreeItem]) {
            for item in tree_items {
                items.push(item);
                if item.is_expanded {
                    collect_visible(items, &item.children);
                }
            }
        }
        collect_visible(&mut items, &self.tree_items);
        items
    }
    
    // Log management methods
    fn add_log_entry(&mut self, level: LogLevel, operation: String, message: String) {
        let entry = LogEntry::new(level, operation, message);
        self.log_entries.push_back(entry);
        
        // Maintain the maximum number of log entries
        if self.log_entries.len() > MAX_LOG_ENTRIES {
            self.log_entries.pop_front();
        }
    }
    
    fn log_navigate_up(&mut self) {
        if !self.log_entries.is_empty() && self.log_selected_index > 0 {
            self.log_selected_index -= 1;
            self.log_adjust_scroll();
        }
    }
    
    fn log_navigate_down(&mut self) {
        if !self.log_entries.is_empty() && self.log_selected_index < self.log_entries.len() - 1 {
            self.log_selected_index += 1;
            self.log_adjust_scroll();
        }
    }
    
    fn log_adjust_scroll(&mut self) {
        let visible_lines = 20; // Approximate visible lines in log viewer
        
        if self.log_selected_index < self.log_scroll_offset {
            self.log_scroll_offset = self.log_selected_index;
        } else if self.log_selected_index >= self.log_scroll_offset + visible_lines {
            self.log_scroll_offset = self.log_selected_index.saturating_sub(visible_lines - 1);
        }
    }
    
    // Fallback editor launcher (using edit crate if available)
    fn launch_external_editor(&self, content: &str, note_title: &str) -> Result<String> {
        // Always use the secure launcher
        self.launch_external_editor_secure(content, note_title, None)
    }
    
    // Secure editor launcher with validation and proper file permissions
    fn launch_external_editor_secure(&self, content: &str, note_title: &str, conversion_result: Option<&ContentConversionResult>) -> Result<String> {
        use std::io::Write;
        
        // Create a temporary file with appropriate extension and secure permissions
        let extension = if let Some(conversion) = conversion_result {
            ContentFormatHandler::get_file_extension(conversion)
        } else if let Some(note) = &self.current_note {
            // Fallback to old logic
            match note.mime.as_deref() {
                Some(mime) if mime.contains("html") => "html",
                Some(mime) if mime.contains("markdown") => "md",
                _ => "txt"
            }
        } else {
            "txt"
        };
        
        // Create temp file with descriptive name
        let mut temp_file = tempfile::Builder::new()
            .prefix(&format!("trilium-{}-", sanitize_filename(note_title)))
            .suffix(&format!(".{}", extension))
            .tempfile()?;
        
        // Set restrictive permissions (0600) - only owner can read/write
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = temp_file.as_file().metadata()?.permissions();
            permissions.set_mode(0o600); // rw-------
            temp_file.as_file().set_permissions(permissions)?;
        }
        
        // Write content to temp file
        temp_file.write_all(content.as_bytes())?;
        temp_file.flush()?;
        
        let temp_path = temp_file.path().to_path_buf();
        
        // Get the editor command from config or environment
        let editor_string = if let Ok(profile) = self.config.current_profile() {
            profile.editor.clone()
                .or_else(|| env::var("EDITOR").ok())
                .or_else(|| env::var("VISUAL").ok())
                .unwrap_or_else(|| {
                    // Default secure editors for different platforms
                    if cfg!(target_os = "windows") {
                        "notepad".to_string()
                    } else if cfg!(target_os = "macos") {
                        "nano".to_string()
                    } else {
                        "nano".to_string() // Linux default
                    }
                })
        } else {
            env::var("EDITOR").ok()
                .or_else(|| env::var("VISUAL").ok())
                .unwrap_or_else(|| {
                    // Default secure editors for different platforms
                    if cfg!(target_os = "windows") {
                        "notepad".to_string()
                    } else if cfg!(target_os = "macos") {
                        "nano".to_string()
                    } else {
                        "nano".to_string() // Linux default
                    }
                })
        };
        
        // Validate and sanitize the editor command for security
        let validated_editor = validate_editor(&editor_string)
            .map_err(|e| TriliumError::SecurityError(format!("Editor validation failed: {}", e)))?;
        
        // Launch the editor and wait for it to finish
        let status = Command::new(&validated_editor.command)
            .args(&validated_editor.args)
            .arg(&temp_path)
            .status()
            .map_err(|e| TriliumError::EditorError(
                format!("Failed to launch editor '{}': {}", validated_editor.command, e)
            ))?;
        
        if !status.success() {
            return Err(TriliumError::EditorError(
                format!("Editor '{}' exited with non-zero status: {:?}", validated_editor.command, status.code())
            ));
        }
        
        // Read the edited content
        let edited_content = fs::read_to_string(&temp_path)
            .map_err(|e| TriliumError::IoError(e))?;
        
        // Successfully edited
        
        Ok(edited_content)
    }
    
    /// Toggle debug mode on/off
    fn toggle_debug_mode(&mut self) {
        self.debug_mode = !self.debug_mode;
        if self.debug_mode {
            self.client.enable_debug_mode();
            self.set_status_message("Debug mode enabled (Ctrl+Alt+D to toggle) - API requests will be logged".to_string());
            
            // Set environment variable for this session
            std::env::set_var("TRILIUM_DEBUG", "1");
            
            // Inform user how to enable persistent debug logging
            eprintln!("=== DEBUG MODE ENABLED ===");
            eprintln!("API requests and responses will be logged to stderr and tracing logs.");
            eprintln!("To enable debug logging to file, set RUST_LOG=debug before starting.");
            eprintln!("Example: RUST_LOG=debug trilium tui");
            eprintln!("========================");
        } else {
            self.client.disable_debug_mode();
            self.set_status_message("Debug mode disabled (Ctrl+Alt+D to toggle)".to_string());
            std::env::remove_var("TRILIUM_DEBUG");
        }
    }
    
    /// Write debug information to a file when debug mode is enabled
    fn write_debug_log(&mut self, operation: &str, details: &str) {
        // Always add to in-memory log storage regardless of debug mode
        let log_level = if operation.contains("Error") {
            LogLevel::Error
        } else if operation.contains("Warning") {
            LogLevel::Warn
        } else {
            LogLevel::Debug
        };
        
        self.add_log_entry(log_level, operation.to_string(), details.to_string());
        
        if self.debug_mode {
            let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC");
            let log_entry = format!("[{}] {}: {}", timestamp, operation, details);
            
            // Log using tracing (will go to file if RUST_LOG is set)
            tracing::debug!("{}", log_entry);
            
            // Also write to stderr for immediate visibility
            eprintln!("{}", log_entry);
            
            // Optionally write to a debug file
            if let Ok(home_dir) = std::env::var("HOME") {
                let debug_file = format!("{}/.trilium-debug.log", home_dir);
                if let Ok(mut file) = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&debug_file) {
                    use std::io::Write;
                    let _ = writeln!(file, "{}", log_entry);
                }
            }
        }
    }

    /// Detect suspicious input that might be escape sequences from external editor
    fn is_suspicious_input(&self, key: &crossterm::event::KeyEvent) -> bool {
        use crossterm::event::{KeyCode, KeyModifiers};
        
        match key.code {
            // These sequences are commonly part of terminal escape sequences
            // but shouldn't appear as regular keystrokes in normal TUI usage
            KeyCode::Char(c) if c.is_control() && c != '\t' && c != '\r' && c != '\n' => {
                // Control characters that aren't tab, carriage return, or newline
                // are often part of escape sequences
                true
            }
            KeyCode::Char(c) if (c >= '\u{1b}' && c <= '\u{1f}') => {
                // ASCII escape and control characters
                true
            }
            KeyCode::Char(c) if c >= '\u{80}' => {
                // High-bit characters that might be part of malformed escape sequences
                // Only flag if we're not in a text input mode where these might be legitimate
                matches!(self.input_mode, InputMode::Normal | InputMode::Help)
            }
            // Multiple modifier keys at once might indicate escape sequence fragments
            _ if key.modifiers.contains(KeyModifiers::ALT) 
                && key.modifiers.contains(KeyModifiers::CONTROL) => {
                true
            }
            _ => false,
        }
    }
}