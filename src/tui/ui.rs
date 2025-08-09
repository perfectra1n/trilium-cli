use crate::tui::app::{App, InputMode, ViewMode};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, List, ListItem, Paragraph, Wrap},
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
}

fn draw_title(f: &mut Frame, app: &App, area: Rect) {
    let title = format!(" Trilium CLI - {} ", 
        match app.view_mode {
            ViewMode::Tree => "Tree View",
            ViewMode::Content => "Note Content",
            ViewMode::Attributes => "Attributes",
            ViewMode::Search => "Search Results",
        }
    );
    
    let block = Block::default()
        .borders(Borders::ALL)
        .title(title)
        .title_alignment(Alignment::Center)
        .style(Style::default().fg(Color::Cyan));
    
    f.render_widget(block, area);
}

fn draw_main_content(f: &mut Frame, app: &App, area: Rect) {
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
        
        let content = format!("{}{}{}", indent, prefix, item.note.title);
        
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
            Line::from(Span::styled("Keyboard Shortcuts:", Style::default().add_modifier(Modifier::BOLD))),
            Line::from(""),
            Line::from("  ↑/↓ or j/k  - Navigate tree"),
            Line::from("  ←/→ or h/l  - Collapse/Expand"),
            Line::from("  Enter       - Load note"),
            Line::from("  Tab         - Switch view"),
            Line::from("  /           - Search"),
            Line::from("  :           - Command mode"),
            Line::from("  n           - New note"),
            Line::from("  e           - Edit note"),
            Line::from("  d           - Delete note"),
            Line::from("  r           - Refresh tree"),
            Line::from("  q           - Quit"),
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