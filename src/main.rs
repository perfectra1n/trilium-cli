use anyhow::Result;
use clap::Parser;
use tracing_subscriber::EnvFilter;

mod api;
mod cli;
mod config;
mod error;
mod help;
mod import_export;
mod models;
mod tui;
mod utils;

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
    
    // Apply profile override if specified
    if let Some(profile_name) = &cli.profile {
        config.set_current_profile(profile_name)?;
    }
    
    // Apply environment variable overrides
    config.apply_env_overrides()?;

    // Override with CLI arguments
    if let Some(url) = cli.server_url {
        if let Ok(profile) = config.current_profile_mut() {
            profile.server_url = url;
        }
    }
    if let Some(token) = cli.api_token {
        if let Ok(profile) = config.current_profile_mut() {
            profile.api_token = Some(SecureString::from(token));
        }
    }

    // Execute command
    match cli.command {
        None | Some(Commands::Tui) => {
            tui::run(config).await?;
        }
        Some(Commands::Config { command }) => {
            commands::config::handle(command, &config).await?;
        }
        Some(Commands::Profile { command }) => {
            commands::profile::handle(command, &mut config, &cli.output).await?;
        }
        Some(Commands::Note { command }) => {
            commands::note::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Search { query, limit, fast, archived, regex, context, content, highlight }) => {
            commands::search::handle(&query, limit, fast, archived, regex, context, content, highlight, &config, &cli.output).await?;
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
        Some(Commands::Link { command }) => {
            commands::link::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Tag { command }) => {
            commands::tag::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Template { command }) => {
            commands::template::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Quick { content, title, tags, format, batch, quiet, inbox }) => {
            commands::quick::handle(
                content, title, tags, format, batch, quiet, inbox, &config, &cli.output
            ).await?;
        }
        Some(Commands::ImportObsidian { vault_path, parent, dry_run }) => {
            commands::import_export::import_obsidian(
                &api::TriliumClient::new(&config)?,
                &vault_path,
                parent,
                dry_run,
                &cli::output::OutputFormat::from_string(&cli.output)?
            ).await?;
        }
        Some(Commands::ExportObsidian { note_id, vault_path, dry_run }) => {
            commands::import_export::export_obsidian(
                &api::TriliumClient::new(&config)?,
                &note_id,
                &vault_path,
                dry_run,
                &cli::output::OutputFormat::from_string(&cli.output)?
            ).await?;
        }
        Some(Commands::ImportNotion { zip_path, parent, dry_run }) => {
            commands::import_export::import_notion(
                &api::TriliumClient::new(&config)?,
                &zip_path,
                parent.clone(),
                dry_run,
                &cli::output::OutputFormat::from_string(&cli.output)?
            ).await?;
        }
        Some(Commands::ExportNotion { note_id, output_path, dry_run }) => {
            commands::import_export::export_notion(
                &api::TriliumClient::new(&config)?,
                &note_id,
                &output_path,
                dry_run,
                &cli::output::OutputFormat::from_string(&cli.output)?
            ).await?;
        }
        Some(Commands::ImportDir { dir_path, parent, max_depth, patterns, dry_run }) => {
            commands::import_export::import_directory(
                &api::TriliumClient::new(&config)?,
                &dir_path,
                parent.clone(),
                max_depth,
                patterns.clone(),
                dry_run,
                &cli::output::OutputFormat::from_string(&cli.output)?
            ).await?;
        }
        Some(Commands::SyncGit { repo_path, note_id, branch, operation, dry_run }) => {
            let git_op = match operation.as_str() {
                "import" => commands::import_export::GitOperation::Import,
                "export" => commands::import_export::GitOperation::Export,
                "sync" => commands::import_export::GitOperation::Sync,
                _ => commands::import_export::GitOperation::Sync,
            };
            commands::import_export::sync_git(
                &api::TriliumClient::new(&config)?,
                &repo_path,
                note_id.clone(),
                branch.clone(),
                git_op,
                dry_run,
                &cli::output::OutputFormat::from_string(&cli.output)?
            ).await?;
        }
        Some(Commands::Plugin { command }) => {
            // Plugin commands would be implemented here
            eprintln!("Plugin system not yet implemented");
        }
        Some(Commands::Completion { command }) => {
            // Completion commands would be implemented here
            eprintln!("Completion system not yet implemented");
        }
        Some(Commands::Help { topic }) => {
            commands::help::handle(topic).await?;
        }
    }

    Ok(())
}