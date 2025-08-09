use crate::api::TriliumClient;
use crate::config::Config;
use crate::error::Result;
use crate::models::{Note, NoteTreeItem, CreateNoteRequest, UpdateNoteRequest};
use crate::tui::event::{Event, Events};
use crate::tui::ui;
use crossterm::event::{KeyCode, KeyModifiers};
use ratatui::{backend::Backend, Terminal};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub enum InputMode {
    Normal,
    Editing,
    Search,
    Command,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ViewMode {
    Tree,
    Content,
    Attributes,
    Search,
}

pub struct App {
    pub client: TriliumClient,
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
            InputMode::Command => self.handle_command_mode(key).await?,
        }
        Ok(())
    }

    async fn handle_normal_mode(&mut self, key: crossterm::event::KeyEvent) -> Result<()> {
        match key.code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Char('?') | KeyCode::Char('h') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.show_help();
            }
            KeyCode::Up | KeyCode::Char('k') => self.move_selection_up(),
            KeyCode::Down | KeyCode::Char('j') => self.move_selection_down(),
            KeyCode::Left | KeyCode::Char('h') => self.collapse_current(),
            KeyCode::Right | KeyCode::Char('l') => self.expand_current().await?,
            KeyCode::Enter => self.load_current_note().await?,
            KeyCode::Tab => self.cycle_view_mode(),
            KeyCode::Char('/') => {
                self.input_mode = InputMode::Search;
                self.input.clear();
            }
            KeyCode::Char(':') => {
                self.input_mode = InputMode::Command;
                self.input.clear();
            }
            KeyCode::Char('n') => self.create_note_prompt(),
            KeyCode::Char('e') => self.edit_note_prompt(),
            KeyCode::Char('d') => self.delete_note_prompt().await?,
            KeyCode::Char('r') => self.refresh_tree().await?,
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
        
        self.current_note = Some(note);
        self.current_content = content;
        self.view_mode = ViewMode::Content;
        self.content_scroll = 0;
        self.status_message = Some(format!("Loaded: {}", title));
        Ok(())
    }

    fn cycle_view_mode(&mut self) {
        self.view_mode = match self.view_mode {
            ViewMode::Tree => ViewMode::Content,
            ViewMode::Content => ViewMode::Attributes,
            ViewMode::Attributes => ViewMode::Search,
            ViewMode::Search => ViewMode::Tree,
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
            "Keys: ↑↓/jk:navigate ←→/hl:collapse/expand Enter:load Tab:view /:search :command n:new e:edit d:delete r:refresh q:quit".to_string()
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