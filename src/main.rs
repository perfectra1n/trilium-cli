use anyhow::Result;
use clap::Parser;
use tracing_subscriber::EnvFilter;

mod api;
mod cli;
mod config;
mod error;
mod models;
mod tui;

use cli::args::{Cli, Commands};
use cli::commands;
use config::{Config, SecureString};

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let filter = if cli.verbose {
        EnvFilter::new("debug")
    } else {
        EnvFilter::from_default_env()
    };
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();

    // Load configuration
    let mut config = Config::load(cli.config)?;

    // Override with CLI arguments
    if let Some(url) = cli.server_url {
        config.server_url = url;
    }
    if let Some(token) = cli.api_token {
        config.api_token = Some(SecureString::from(token));
    }

    // Execute command
    match cli.command {
        None | Some(Commands::Tui) => {
            tui::run(config).await?;
        }
        Some(Commands::Config { command }) => {
            commands::config::handle(command, &config).await?;
        }
        Some(Commands::Note { command }) => {
            commands::note::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Search { query, limit, fast, archived }) => {
            commands::search::handle(&query, limit, fast, archived, &config, &cli.output).await?;
        }
        Some(Commands::Branch { command }) => {
            commands::branch::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Attribute { command }) => {
            commands::attribute::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Attachment { command }) => {
            commands::attachment::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Backup { name }) => {
            commands::backup::handle(name, &config).await?;
        }
        Some(Commands::Calendar { date, create: _ }) => {
            commands::calendar::handle(&date, &config, &cli.output).await?;
        }
        Some(Commands::Info) => {
            commands::info::handle(&config).await?;
        }
        Some(Commands::Pipe { 
            title,
            parent,
            note_type,
            format,
            tags,
            labels,
            attributes,
            append_to,
            template,
            batch_delimiter,
            language,
            strip_html,
            extract_title,
            quiet,
        }) => {
            commands::pipe::handle(
                title,
                parent,
                note_type,
                format,
                tags,
                labels,
                attributes,
                append_to,
                template,
                batch_delimiter,
                language,
                strip_html,
                extract_title,
                quiet,
                &config,
            ).await?;
        }
    }

    Ok(())
}