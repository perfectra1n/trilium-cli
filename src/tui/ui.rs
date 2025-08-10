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
        format!("Mode: {:?} | View: {:?} | Press ? for help", app.input_mode, app.view_mode)
    };

    let paragraph = Paragraph::new(status)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray))
        )
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