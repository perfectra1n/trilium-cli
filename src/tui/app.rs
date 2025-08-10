use crate::api::TriliumClient;
use crate::config::Config;
use crate::error::Result;
use crate::models::{Note, NoteTreeItem, CreateNoteRequest, UpdateNoteRequest};
use crate::tui::event::{Event, Events};
use crate::tui::ui;
use crossterm::event::{KeyCode, KeyModifiers};
use ratatui::{backend::Backend, Terminal};
use std::time::Duration;
use fuzzy_matcher::{FuzzyMatcher, skim::SkimMatcherV2};

#[derive(Debug, Clone, PartialEq)]
pub enum InputMode {
    Normal,
    Editing,
    Search,
    FuzzySearch,
    Command,
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
    pub input_mode: InputMode,
    pub view_mode: ViewMode,
    pub input: String,
    pub search_query: String,
    pub search_results: Vec<Note>,
    pub status_message: Option<String>,
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
}

#[derive(Debug, Clone, PartialEq)]
pub enum SplitPane {
    Left,
    Right,
}

impl App {
    pub async fn new(config: Config) -> Result<Self> {
        let client = TriliumClient::new(&config)?;
        
        // Load root notes
        let root_notes = client.get_child_notes("root").await
            .unwrap_or_default();
        
        let tree_items = root_notes.into_iter()
            .map(|note| NoteTreeItem::new(note, 0))
            .collect();

        Ok(Self {
            client,
            config,
            tree_items,
            selected_index: 0,
            current_note: None,
            current_content: None,
            input_mode: InputMode::Normal,
            view_mode: ViewMode::Tree,
            input: String::new(),
            search_query: String::new(),
            search_results: Vec::new(),
            status_message: None,
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
        })
    }

    pub async fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> Result<()> {
        let events = Events::new(Duration::from_millis(250))?;

        loop {
            terminal.draw(|f| ui::draw(f, self))?;

            match events.next()? {
                Event::Input(key) => {
                    if let Err(e) = self.handle_input(key).await {
                        self.status_message = Some(format!("Error: {}", e));
                    }
                }
                Event::Tick => {}
            }

            if self.should_quit {
                break;
            }
        }

        Ok(())
    }

    async fn handle_input(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        match self.input_mode {
            InputMode::Normal => self.handle_normal_mode(key).await?,
            InputMode::Editing => self.handle_editing_mode(key).await?,
            InputMode::Search => self.handle_search_mode(key).await?,
            InputMode::FuzzySearch => self.handle_fuzzy_search_mode(key).await?,
            InputMode::Command => self.handle_command_mode(key).await?,
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
                            self.status_message = Some(format!("Warning: Failed to add to recent notes: {}", e));
                        } else if let Err(e) = self.config.save(None) {
                            self.status_message = Some(format!("Warning: Failed to save config: {}", e));
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
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Char('?') | KeyCode::Char('h') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.show_help();
            }
            
            // Vim-like navigation
            KeyCode::Up | KeyCode::Char('k') => self.handle_navigation_up(),
            KeyCode::Down | KeyCode::Char('j') => self.handle_navigation_down(),
            KeyCode::Left | KeyCode::Char('h') => self.handle_navigation_left().await?,
            KeyCode::Right | KeyCode::Char('l') => self.handle_navigation_right().await?,
            
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
            
            // Tab and view cycling
            KeyCode::Tab => self.cycle_view_mode(),
            
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
            KeyCode::Char('e') => self.edit_note_prompt(),
            KeyCode::Char('d') if key.modifiers.contains(KeyModifiers::CONTROL) => self.delete_note_prompt().await?,
            KeyCode::Char('r') => self.refresh_tree().await?,
            
            // Content scrolling
            KeyCode::PageUp => self.scroll_content_up(),
            KeyCode::PageDown => self.scroll_content_down(),
            
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
        let content = self.client.get_note_content(&note_id).await.ok();
        
        // Add to recent notes
        if let Err(e) = self.config.add_recent_note(note_id.clone(), title.clone()) {
            self.status_message = Some(format!("Warning: Failed to add to recent notes: {}", e));
        } else if let Err(e) = self.config.save(None) {
            self.status_message = Some(format!("Warning: Failed to save config: {}", e));
        }
        
        self.current_note = Some(note);
        self.current_content = content;
        self.view_mode = ViewMode::Content;
        self.content_scroll = 0;
        self.status_message = Some(format!("Loaded: {}", title));
        Ok(())
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
                self.status_message = Some(format!("Warning: Failed to save config: {}", e));
                return Ok(());
            }
            
            let status = if is_bookmarked {
                format!("Bookmarked: {}", note.title)
            } else {
                format!("Removed bookmark: {}", note.title)
            };
            self.status_message = Some(status);
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
            self.status_message = Some(format!("Match {}/{}", self.search_match_index + 1, self.total_search_matches));
        }
    }

    fn search_previous(&mut self) {
        if self.total_search_matches > 0 {
            self.search_match_index = if self.search_match_index == 0 {
                self.total_search_matches - 1
            } else {
                self.search_match_index - 1
            };
            self.status_message = Some(format!("Match {}/{}", self.search_match_index + 1, self.total_search_matches));
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
        self.status_message = Some(format!("Found {} results", self.search_results.len()));
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
                    self.status_message = Some(format!("Deleted: {}", note.title));
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
                self.status_message = Some(format!("Unknown command: {}", parts[0]));
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
        self.status_message = Some(format!("Created: {}", note.title));
        self.refresh_tree().await?;
        Ok(())
    }

    async fn refresh_tree(&mut self) -> Result<()> {
        let root_notes = self.client.get_child_notes("root").await?;
        self.tree_items = root_notes.into_iter()
            .map(|note| NoteTreeItem::new(note, 0))
            .collect();
        self.tree_version += 1; // Increment version to invalidate cache
        self.status_message = Some("Tree refreshed".to_string());
        Ok(())
    }

    fn create_note_prompt(&mut self) {
        self.input_mode = InputMode::Editing;
        self.input.clear();
        self.status_message = Some("Enter note title:".to_string());
    }

    fn edit_note_prompt(&mut self) {
        if let Some(note) = &self.current_note {
            self.input_mode = InputMode::Editing;
            self.input = note.title.clone();
            self.status_message = Some("Edit note title:".to_string());
        }
    }

    async fn delete_note_prompt(&mut self) -> Result<()> {
        if let Some(note) = &self.current_note {
            self.client.delete_note(&note.note_id).await?;
            self.status_message = Some(format!("Deleted: {}", note.title));
            self.current_note = None;
            self.current_content = None;
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
            // Update existing note
            let request = UpdateNoteRequest {
                title: Some(input.clone()),
                note_type: None,
                mime: None,
                content: None,
                is_protected: None,
            };
            
            let updated = self.client.update_note(&note_id, request).await?;
            let title = updated.title.clone();
            self.current_note = Some(updated);
            self.status_message = Some(format!("Updated: {}", title));
            self.refresh_tree().await?;
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

    fn show_help(&mut self) {
        self.status_message = Some(
            "Keys: jk/↑↓:nav h/←:left/collapse l/→:right/expand o/Enter:open g:top G:bottom /:fuzzy-search *:search n/N:search-next/prev R:recent B:bookmarks b:bookmark-toggle s:split-view <>:resize Ctrl+c:create e:edit Ctrl+d:delete r:refresh q:quit".to_string()
        );
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
}