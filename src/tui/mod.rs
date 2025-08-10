mod app;
mod ui;
mod event;

use crate::config::Config;
use crate::error::Result;
use app::App;
use crossterm::{
    event::{DisableMouseCapture, EnableMouseCapture},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    Terminal,
};
use std::io;

pub async fn run(config: Config) -> Result<()> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Setup panic hook to ensure terminal cleanup
    let original_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        // Try to restore terminal state on panic
        let _ = disable_raw_mode();
        let _ = execute!(
            io::stdout(),
            LeaveAlternateScreen,
            DisableMouseCapture
        );
        
        // Call the original panic hook
        original_hook(panic_info);
    }));

    // Create app and run with proper error handling
    let mut app = App::new(config).await?;
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        // Use block_on to run the async function in sync context
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(app.run(&mut terminal))
        })
    }));

    // Always restore terminal state, regardless of how we exit
    let cleanup_result = cleanup_terminal(&mut terminal);

    // Restore original panic hook
    let _ = std::panic::take_hook();

    // Handle results
    match res {
        Ok(app_result) => {
            cleanup_result?;
            app_result
        }
        Err(panic_payload) => {
            // Terminal should already be cleaned up by panic hook
            // Re-panic to preserve the original panic
            std::panic::resume_unwind(panic_payload);
        }
    }
}

fn cleanup_terminal<B>(terminal: &mut Terminal<B>) -> Result<()> 
where
    B: ratatui::backend::Backend + std::io::Write,
{
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;
    Ok(())
}