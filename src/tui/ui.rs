use crate::tui::app::{App, InputMode, ViewMode, SplitPane};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap, Clear},
    Frame,
};

pub fn draw(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Title bar
            Constraint::Min(0),     // Main content
            Constraint::Length(3),  // Status bar
        ])
        .split(f.size());

    draw_title(f, app, chunks[0]);
    draw_main_content(f, app, chunks[1]);
    draw_status_bar(f, app, chunks[2]);

    // Draw input popup if in input mode
    if matches!(app.input_mode, InputMode::Editing | InputMode::Search | InputMode::Command) {
        draw_input_popup(f, app);
    }
    
    // Draw fuzzy search popup
    if matches!(app.input_mode, InputMode::FuzzySearch) {
        draw_fuzzy_search_popup(f, app);
    }
    
    // Draw help popup
    if matches!(app.input_mode, InputMode::Help) {
        draw_help_popup(f);
    }
    
    // Draw log viewer popup
    if matches!(app.input_mode, InputMode::LogViewer) {
        draw_log_viewer_popup(f, app);
    }
    
    // Note: External editor is now used instead of inline editing
}

fn draw_title(f: &mut Frame, app: &App, area: Rect) {
    let mode_text = match app.view_mode {
        ViewMode::Tree => "Tree View",
        ViewMode::Content => "Note Content",
        ViewMode::Attributes => "Attributes",
        ViewMode::Search => "Search Results",
        ViewMode::Recent => "Recent Notes",
        ViewMode::Bookmarks => "Bookmarked Notes",
        ViewMode::Split => "Split View",
        ViewMode::LogViewer => "Log Viewer",
    };
    
    let search_indicator = if app.input_mode == InputMode::FuzzySearch {
        " [SEARCHING]"
    } else {
        ""
    };
    
    let title = format!(" Trilium CLI - {}{} ", mode_text, search_indicator);
    
    let block = Block::default()
        .borders(Borders::ALL)
        .title(title)
        .title_alignment(Alignment::Center)
        .style(Style::default().fg(Color::Cyan));
    
    f.render_widget(block, area);
}

fn draw_main_content(f: &mut Frame, app: &App, area: Rect) {
    match app.view_mode {
        ViewMode::Split => {
            let split_ratio = (app.split_ratio * 100.0) as u16;
            let chunks = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(split_ratio),
                    Constraint::Percentage(100 - split_ratio),
                ])
                .split(area);

            // Draw tree in left pane
            draw_tree_panel_with_focus(f, app, chunks[0], app.split_pane_focused == SplitPane::Left);
            
            // Draw content in right pane
            draw_content_panel_with_focus(f, app, chunks[1], app.split_pane_focused == SplitPane::Right);
        }
        ViewMode::Recent => {
            draw_recent_notes(f, app, area);
        }
        ViewMode::Bookmarks => {
            draw_bookmarks(f, app, area);
        }
        ViewMode::LogViewer => {
            draw_log_viewer(f, app, area);
        }
        _ => {
            // Original layout for other modes
            let chunks = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([
                    Constraint::Percentage(30),  // Left panel (tree)
                    Constraint::Percentage(70),  // Right panel (content)
                ])
                .split(area);

            draw_tree_panel(f, app, chunks[0]);
            
            match app.view_mode {
                ViewMode::Content => draw_content_panel(f, app, chunks[1]),
                ViewMode::Attributes => draw_attributes_panel(f, app, chunks[1]),
                ViewMode::Search => draw_search_results(f, app, chunks[1]),
                _ => draw_content_panel(f, app, chunks[1]),
            }
        }
    }
}

fn draw_tree_panel(f: &mut Frame, app: &App, area: Rect) {
    let mut items: Vec<ListItem> = Vec::new();
    let visible_items = get_visible_tree_items(app);
    
    for (index, item) in visible_items.iter().enumerate() {
        let indent = "  ".repeat(item.depth);
        let prefix = if item.children.is_empty() {
            "  "
        } else if item.is_expanded {
            "▼ "
        } else {
            "▶ "
        };
        
        let bookmark_indicator = if app.config.is_bookmarked(&item.note.note_id) {
            "★ "
        } else {
            ""
        };
        
        let content = format!("{}{}{}{}", indent, prefix, bookmark_indicator, item.note.title);
        
        let style = if index == app.selected_index {
            Style::default().bg(Color::DarkGray).add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        };
        
        items.push(ListItem::new(content).style(style));
    }

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Notes Tree ")
                .border_style(Style::default().fg(Color::White))
        )
        .highlight_style(Style::default().add_modifier(Modifier::BOLD))
        .highlight_symbol("> ");

    f.render_widget(list, area);
}

fn draw_content_panel(f: &mut Frame, app: &App, area: Rect) {
    let content = if let Some(note) = &app.current_note {
        let mut lines = vec![
            Line::from(vec![
                Span::styled("Title: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(&note.title),
            ]),
            Line::from(vec![
                Span::styled("ID: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(&note.note_id),
            ]),
            Line::from(vec![
                Span::styled("Type: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(&note.note_type),
            ]),
            Line::from(vec![
                Span::styled("Created: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(note.date_created.format("%Y-%m-%d %H:%M:%S").to_string()),
            ]),
            Line::from(vec![
                Span::styled("Modified: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(note.date_modified.format("%Y-%m-%d %H:%M:%S").to_string()),
            ]),
            Line::from(""),
            Line::from("─".repeat(area.width as usize - 2)),
            Line::from(""),
        ];

        if let Some(content) = &app.current_content {
            for line in content.lines().skip(app.content_scroll) {
                lines.push(Line::from(line.to_string()));
            }
        } else {
            lines.push(Line::from(Span::styled(
                "Loading content...",
                Style::default().fg(Color::Gray),
            )));
        }

        Text::from(lines)
    } else {
        Text::from(vec![
            Line::from(""),
            Line::from(Span::styled(
                "Select a note to view its content",
                Style::default().fg(Color::Gray),
            )),
            Line::from(""),
            Line::from(Span::styled("Enhanced Navigation Features:", Style::default().add_modifier(Modifier::BOLD))),
            Line::from(""),
            Line::from("  j/k or ↑/↓    - Navigate up/down"),
            Line::from("  h/l or ←/→    - Left/right (collapse/expand)"),
            Line::from("  g/G           - Go to top/bottom"),
            Line::from("  o/Enter       - Open/load note"),
            Line::from("  c             - Collapse current"),
            Line::from(""),
            Line::from("  /             - Fuzzy search (real-time)"),
            Line::from("  n/N           - Next/previous search match"),
            Line::from(""),
            Line::from("  R             - Recent notes"),
            Line::from("  B             - Bookmarks"),
            Line::from("  b             - Toggle bookmark"),
            Line::from(""),
            Line::from("  s             - Split view"),
            Line::from("  < / >         - Resize split panes"),
            Line::from(""),
            Line::from("  Tab           - Cycle views"),
            Line::from("  r             - Refresh tree"),
            Line::from("  q             - Quit"),
        ])
    };

    let paragraph = Paragraph::new(content)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Content ")
                .border_style(Style::default().fg(Color::White))
        )
        .wrap(Wrap { trim: false });

    f.render_widget(paragraph, area);
}

fn draw_attributes_panel(f: &mut Frame, app: &App, area: Rect) {
    let content = if let Some(note) = &app.current_note {
        let mut lines = vec![
            Line::from(Span::styled(
                format!("Attributes for: {}", note.title),
                Style::default().add_modifier(Modifier::BOLD),
            )),
            Line::from(""),
        ];

        if let Some(attributes) = &note.attributes {
            if attributes.is_empty() {
                lines.push(Line::from(Span::styled(
                    "No attributes",
                    Style::default().fg(Color::Gray),
                )));
            } else {
                for attr in attributes {
                    lines.push(Line::from(format!(
                        "{}: {} = {}",
                        attr.attr_type, attr.name, attr.value
                    )));
                }
            }
        } else {
            lines.push(Line::from(Span::styled(
                "Attributes not loaded",
                Style::default().fg(Color::Gray),
            )));
        }

        Text::from(lines)
    } else {
        Text::from(vec![Line::from(Span::styled(
            "Select a note to view its attributes",
            Style::default().fg(Color::Gray),
        ))])
    };

    let paragraph = Paragraph::new(content)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Attributes ")
                .border_style(Style::default().fg(Color::White))
        );

    f.render_widget(paragraph, area);
}

fn draw_search_results(f: &mut Frame, app: &App, area: Rect) {
    let mut items: Vec<ListItem> = Vec::new();
    
    if app.search_results.is_empty() {
        items.push(ListItem::new(Span::styled(
            "No search results",
            Style::default().fg(Color::Gray),
        )));
    } else {
        for note in &app.search_results {
            items.push(ListItem::new(format!("{} - {}", note.note_id, note.title)));
        }
    }

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" Search Results: {} ", app.search_query))
                .border_style(Style::default().fg(Color::White))
        );

    f.render_widget(list, area);
}

fn draw_status_bar(f: &mut Frame, app: &App, area: Rect) {
    let status = if let Some(msg) = &app.status_message {
        msg.clone()
    } else {
        let mode_str = match app.input_mode {
            InputMode::Normal => "NORMAL",
            InputMode::Editing => "EDITING",
            InputMode::Search => "SEARCH",
            InputMode::FuzzySearch => "FUZZY SEARCH",
            InputMode::Command => "COMMAND",
            InputMode::Help => "HELP",
            InputMode::LogViewer => "LOG VIEWER",
        };
        
        let view_str = match app.view_mode {
            ViewMode::Tree => "Tree",
            ViewMode::Content => "Content",
            ViewMode::Attributes => "Attributes",
            ViewMode::Search => "Search",
            ViewMode::Recent => "Recent",
            ViewMode::Bookmarks => "Bookmarks",
            ViewMode::Split => "Split",
            ViewMode::LogViewer => "LogViewer",
        };
        
        format!(" Mode: {} | View: {} | Press ? for help, q to quit ", mode_str, view_str)
    };

    let paragraph = Paragraph::new(status)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray))
        )
        .style(Style::default().fg(Color::White))
        .alignment(Alignment::Left);

    f.render_widget(paragraph, area);
}

fn draw_input_popup(f: &mut Frame, app: &App) {
    let area = centered_rect(60, 20, f.size());
    
    let title = match app.input_mode {
        InputMode::Search => " Search ",
        InputMode::Command => " Command ",
        InputMode::Editing => " Edit ",
        _ => " Input ",
    };

    let input = Paragraph::new(app.input.as_str())
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .border_style(Style::default().fg(Color::Yellow))
        );

    f.render_widget(Block::default().style(Style::default().bg(Color::Black)), area);
    f.render_widget(input, area);
}

fn draw_tree_panel_with_focus(f: &mut Frame, app: &App, area: Rect, focused: bool) {
    let mut items: Vec<ListItem> = Vec::new();
    let visible_items = get_visible_tree_items(app);
    
    for (index, item) in visible_items.iter().enumerate() {
        let indent = "  ".repeat(item.depth);
        let prefix = if item.children.is_empty() {
            "  "
        } else if item.is_expanded {
            "▼ "
        } else {
            "▶ "
        };
        
        let bookmark_indicator = if app.config.is_bookmarked(&item.note.note_id) {
            "★ "
        } else {
            ""
        };
        
        let content = format!("{}{}{}{}", indent, prefix, bookmark_indicator, item.note.title);
        
        let style = if index == app.selected_index {
            Style::default().bg(Color::DarkGray).add_modifier(Modifier::BOLD)
        } else {
            Style::default()
        };
        
        items.push(ListItem::new(content).style(style));
    }

    let border_color = if focused { Color::Yellow } else { Color::White };
    
    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Notes Tree ")
                .border_style(Style::default().fg(border_color))
        )
        .highlight_style(Style::default().add_modifier(Modifier::BOLD))
        .highlight_symbol("> ");

    f.render_widget(list, area);
}

fn draw_content_panel_with_focus(f: &mut Frame, app: &App, area: Rect, focused: bool) {
    let content = if let Some(note) = &app.current_note {
        let mut lines = vec![
            Line::from(vec![
                Span::styled("Title: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(&note.title),
            ]),
            Line::from(vec![
                Span::styled("ID: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(&note.note_id),
            ]),
            Line::from(vec![
                Span::styled("Type: ", Style::default().add_modifier(Modifier::BOLD)),
                Span::raw(&note.note_type),
            ]),
            Line::from(""),
            Line::from("─".repeat(area.width as usize - 2)),
            Line::from(""),
        ];

        if let Some(content) = &app.current_content {
            for line in content.lines().skip(app.content_scroll) {
                lines.push(Line::from(line.to_string()));
            }
        } else {
            lines.push(Line::from(Span::styled(
                "Loading content...",
                Style::default().fg(Color::Gray),
            )));
        }

        Text::from(lines)
    } else {
        Text::from(vec![
            Line::from(""),
            Line::from(Span::styled(
                "Select a note to view its content",
                Style::default().fg(Color::Gray),
            )),
        ])
    };

    let border_color = if focused { Color::Yellow } else { Color::White };

    let paragraph = Paragraph::new(content)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Content ")
                .border_style(Style::default().fg(border_color))
        )
        .wrap(Wrap { trim: false });

    f.render_widget(paragraph, area);
}

fn draw_recent_notes(f: &mut Frame, app: &App, area: Rect) {
    let mut items: Vec<ListItem> = Vec::new();
    
    let recent_notes = app.config.current_profile()
        .map(|p| p.recent_notes.as_slice())
        .unwrap_or(&[]);
    
    if recent_notes.is_empty() {
        items.push(ListItem::new(Span::styled(
            "No recent notes",
            Style::default().fg(Color::Gray),
        )));
    } else {
        for (index, recent_note) in recent_notes.iter().enumerate() {
            let style = if index == app.recent_selected_index {
                Style::default().bg(Color::DarkGray).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            
            let time_ago = format_time_ago(&recent_note.accessed_at);
            let content = format!("{} ({})", recent_note.title, time_ago);
            items.push(ListItem::new(content).style(style));
        }
    }

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Recent Notes ")
                .border_style(Style::default().fg(Color::White))
        )
        .highlight_style(Style::default().add_modifier(Modifier::BOLD))
        .highlight_symbol("> ");

    f.render_widget(list, area);
}

fn draw_bookmarks(f: &mut Frame, app: &App, area: Rect) {
    let mut items: Vec<ListItem> = Vec::new();
    
    let bookmarked_notes = app.config.current_profile()
        .map(|p| p.bookmarked_notes.as_slice())
        .unwrap_or(&[]);
    
    if bookmarked_notes.is_empty() {
        items.push(ListItem::new(Span::styled(
            "No bookmarked notes",
            Style::default().fg(Color::Gray),
        )));
    } else {
        for (index, bookmark) in bookmarked_notes.iter().enumerate() {
            let style = if index == app.bookmark_selected_index {
                Style::default().bg(Color::DarkGray).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            
            let time_ago = format_time_ago(&bookmark.bookmarked_at);
            let content = format!("★ {} ({})", bookmark.title, time_ago);
            items.push(ListItem::new(content).style(style));
        }
    }

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Bookmarked Notes ")
                .border_style(Style::default().fg(Color::Yellow))
        )
        .highlight_style(Style::default().add_modifier(Modifier::BOLD))
        .highlight_symbol("> ");

    f.render_widget(list, area);
}

fn draw_fuzzy_search_popup(f: &mut Frame, app: &App) {
    let area = centered_rect(80, 70, f.size());
    
    f.render_widget(Clear, area);
    
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Search input
            Constraint::Min(0),     // Results
        ])
        .split(area);

    // Search input
    let input = Paragraph::new(app.fuzzy_search_query.as_str())
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Fuzzy Search ")
                .border_style(Style::default().fg(Color::Yellow))
        );
    f.render_widget(input, chunks[0]);

    // Search results
    let mut items: Vec<ListItem> = Vec::new();
    
    if app.fuzzy_search_query.is_empty() {
        items.push(ListItem::new(Span::styled(
            "Type to search notes...",
            Style::default().fg(Color::Gray),
        )));
    } else if app.fuzzy_search_results.is_empty() {
        items.push(ListItem::new(Span::styled(
            "No matches found",
            Style::default().fg(Color::Gray),
        )));
    } else {
        for (index, result) in app.fuzzy_search_results.iter().enumerate() {
            let style = if index == app.fuzzy_selected_index {
                Style::default().bg(Color::DarkGray).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            
            // Highlight matched characters
            let title = highlight_fuzzy_matches(&result.item.note.title, &result.indices);
            items.push(ListItem::new(title).style(style));
        }
    }

    let results_list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" Results ({}) ", app.fuzzy_search_results.len()))
                .border_style(Style::default().fg(Color::White))
        )
        .highlight_style(Style::default().add_modifier(Modifier::BOLD))
        .highlight_symbol("> ");

    f.render_widget(results_list, chunks[1]);
}

fn highlight_fuzzy_matches(text: &str, indices: &[usize]) -> Line<'static> {
    let mut spans = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut last_index = 0;
    
    for &match_index in indices {
        if match_index > last_index {
            // Add non-matching characters
            let segment: String = chars[last_index..match_index].iter().collect();
            if !segment.is_empty() {
                spans.push(Span::raw(segment));
            }
        }
        
        // Add matching character with highlight
        if match_index < chars.len() {
            let segment: String = chars[match_index..match_index + 1].iter().collect();
            spans.push(Span::styled(segment, Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)));
            last_index = match_index + 1;
        }
    }
    
    // Add remaining characters
    if last_index < chars.len() {
        let segment: String = chars[last_index..].iter().collect();
        if !segment.is_empty() {
            spans.push(Span::raw(segment));
        }
    }
    
    Line::from(spans)
}

fn format_time_ago(time: &chrono::DateTime<chrono::Utc>) -> String {
    let now = chrono::Utc::now();
    let diff = now.signed_duration_since(*time);
    
    if diff.num_days() > 0 {
        format!("{}d ago", diff.num_days())
    } else if diff.num_hours() > 0 {
        format!("{}h ago", diff.num_hours())
    } else if diff.num_minutes() > 0 {
        format!("{}m ago", diff.num_minutes())
    } else {
        "just now".to_string()
    }
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

fn get_visible_tree_items(app: &App) -> Vec<&crate::models::NoteTreeItem> {
    let mut items = Vec::new();
    fn collect_visible<'a>(
        items: &mut Vec<&'a crate::models::NoteTreeItem>,
        tree_items: &'a [crate::models::NoteTreeItem],
    ) {
        for item in tree_items {
            items.push(item);
            if item.is_expanded {
                collect_visible(items, &item.children);
            }
        }
    }
    collect_visible(&mut items, &app.tree_items);
    items
}

fn draw_help_popup(f: &mut Frame) {
    let area = centered_rect(90, 90, f.size());
    
    // Clear the area with a dark background
    f.render_widget(Clear, area);
    
    let help_text = vec![
        Line::from(Span::styled("Trilium CLI - Keyboard Shortcuts", Style::default().add_modifier(Modifier::BOLD).fg(Color::Cyan))),
        Line::from(""),
        Line::from(Span::styled("━━━ Navigation ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Yellow))),
        Line::from("  j/k or ↑/↓        Navigate up/down"),
        Line::from("  h/l or ←/→        Navigate left/right (collapse/expand in tree)"),
        Line::from("  g                 Go to top"),
        Line::from("  G                 Go to bottom"),
        Line::from("  Tab               Switch between view modes (forward)"),
        Line::from("  Shift+Tab         Switch between view modes (reverse)"),
        Line::from("  ESC               Go back to tree view/cancel operation"),
        Line::from(""),
        Line::from(Span::styled("━━━ Note Operations ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Green))),
        Line::from("  o or Enter        Open/load note content"),
        Line::from("  e or i            Edit note in external editor"),
        Line::from("  c                 Collapse current tree node"),
        Line::from("  Ctrl+c            Create new note (prompts for title)"),
        Line::from("  Ctrl+d            Delete current note (with confirmation)"),
        Line::from("  r                 Refresh tree from server"),
        Line::from(""),
        Line::from(Span::styled("━━━ Search ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Magenta))),
        Line::from("  /                 Fuzzy search notes by title (real-time)"),
        Line::from("  *                 Full text search in note content"),
        Line::from("  n                 Next search result"),
        Line::from("  N                 Previous search result"),
        Line::from(""),
        Line::from(Span::styled("━━━ View Modes ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Blue))),
        Line::from("  R                 Switch to recent notes view"),
        Line::from("  B                 Switch to bookmarked notes view"),
        Line::from("  b                 Toggle bookmark for current note"),
        Line::from("  s                 Toggle split view mode"),
        Line::from("  <                 Decrease left pane size in split view"),
        Line::from("  >                 Increase left pane size in split view"),
        Line::from(""),
        Line::from(Span::styled("━━━ Content Scrolling ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Cyan))),
        Line::from("  PageUp            Scroll content up (when viewing note)"),
        Line::from("  PageDown          Scroll content down (when viewing note)"),
        Line::from(""),
        Line::from(Span::styled("━━━ External Editor ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Red))),
        Line::from("  e or i            Launch external editor for current note"),
        Line::from("                    Uses $EDITOR, $VISUAL, or profile editor setting"),
        Line::from("                    Secure validation prevents command injection"),
        Line::from("                    Temporary files have restricted permissions"),
        Line::from(""),
        Line::from(Span::styled("━━━ Command Mode ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Magenta))),
        Line::from("  :                 Enter command mode"),
        Line::from("    new <title>     Create note with title"),
        Line::from("    delete          Delete current note"),
        Line::from("    search <query>  Search note content"),
        Line::from(""),
        Line::from(Span::styled("━━━ Debug & Logs ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Red))),
        Line::from("  Ctrl+Alt+D        Toggle debug mode (enables API logging)"),
        Line::from("  Ctrl+L            Open log viewer (view recent logs and errors)"),
        Line::from("                    Shows timestamps, levels, operations, and messages"),
        Line::from("                    In log viewer: j/k to navigate, Ctrl+C to clear, ESC to exit"),
        Line::from(""),
        Line::from(Span::styled("━━━ General ━━━", Style::default().add_modifier(Modifier::BOLD).fg(Color::Yellow))),
        Line::from(Span::styled("  ?                 Show/Hide this help", Style::default().fg(Color::LightCyan))),
        Line::from("  q                 Quit application"),
        Line::from(""),
        Line::from(Span::styled("Status messages auto-clear after 5 seconds", Style::default().add_modifier(Modifier::ITALIC).fg(Color::Gray))),
        Line::from(Span::styled("Press ESC, q, or ? to close this help window", Style::default().add_modifier(Modifier::ITALIC).fg(Color::Gray))),
    ];
    
    let help = Paragraph::new(help_text)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(
                    " ❓ Help - Press ESC, q, or ? to close ",
                    Style::default().add_modifier(Modifier::BOLD)
                ))
                .border_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
                .style(Style::default().bg(Color::Black))
        )
        .alignment(Alignment::Left)
        .scroll((0, 0))
        .wrap(Wrap { trim: false });
    
    f.render_widget(help, area);
}

fn draw_log_viewer(f: &mut Frame, app: &App, area: Rect) {
    let mut items: Vec<ListItem> = Vec::new();
    
    if app.log_entries.is_empty() {
        items.push(ListItem::new(Span::styled(
            "No log entries yet",
            Style::default().fg(Color::Gray),
        )));
        items.push(ListItem::new(""));
        items.push(ListItem::new(Span::styled(
            "Log entries will appear here when debug logging is enabled",
            Style::default().fg(Color::Gray),
        )));
        items.push(ListItem::new(Span::styled(
            "Press Ctrl+Alt+D to toggle debug mode",
            Style::default().fg(Color::DarkGray),
        )));
        items.push(ListItem::new(""));
        items.push(ListItem::new(Span::styled(
            "Navigation: j/k or ↑/↓ to scroll, g/G for top/bottom, Ctrl+C to clear",
            Style::default().fg(Color::DarkGray),
        )));
        items.push(ListItem::new(Span::styled(
            "Press ESC or q to exit log viewer",
            Style::default().fg(Color::Yellow),
        )));
    } else {
        // Show logs starting from the scroll offset
        let entries: Vec<&crate::tui::app::LogEntry> = app.log_entries.iter().collect();
        let visible_entries = entries.iter().skip(app.log_scroll_offset);
        
        for (index, entry) in visible_entries.enumerate() {
            let actual_index = index + app.log_scroll_offset;
            let style = if actual_index == app.log_selected_index {
                Style::default().bg(Color::DarkGray).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            
            let level_color = match entry.level {
                crate::tui::app::LogLevel::Debug => Color::Blue,
                crate::tui::app::LogLevel::Info => Color::Green,
                crate::tui::app::LogLevel::Warn => Color::Yellow,
                crate::tui::app::LogLevel::Error => Color::Red,
            };
            
            let timestamp = entry.timestamp.format("%H:%M:%S").to_string();
            
            let line = Line::from(vec![
                Span::styled(format!("[{}] ", timestamp), Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{} ", entry.level), Style::default().fg(level_color).add_modifier(Modifier::BOLD)),
                Span::styled(format!("{}: ", entry.operation), Style::default().fg(Color::Cyan)),
                Span::raw(entry.message.clone()),
            ]);
            
            items.push(ListItem::new(line).style(style));
        }
    }
    
    // Get log file path for display
    let log_file_path = if let Ok(home_dir) = std::env::var("HOME") {
        format!("{}/.trilium-debug.log", home_dir)
    } else {
        "~/.trilium-debug.log".to_string()
    };

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" Logs ({}) - File: {} ", app.log_entries.len(), log_file_path))
                .border_style(Style::default().fg(Color::Yellow))
        )
        .highlight_style(Style::default().add_modifier(Modifier::BOLD))
        .highlight_symbol("> ");

    f.render_widget(list, area);
}

fn draw_log_viewer_popup(f: &mut Frame, app: &App) {
    let area = centered_rect(95, 90, f.size());
    
    // Clear the area with a dark background
    f.render_widget(Clear, area);
    
    draw_log_viewer(f, app, area);
}

// Note editor UI removed - using external editor instead