use crossterm::event::{self, Event as CEvent, KeyEvent};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use crate::error::{Result, TriliumError};

pub enum Event<I> {
    Input(I),
    Tick,
}

pub struct Events {
    rx: mpsc::Receiver<Event<KeyEvent>>,
    _tx: mpsc::Sender<Event<KeyEvent>>,
    _handle: thread::JoinHandle<()>,
}

impl Events {
    pub fn new(tick_rate: Duration) -> Result<Events> {
        let (tx, rx) = mpsc::channel();
        let _tx = tx.clone();

        let handle = thread::spawn(move || {
            let mut last_tick = Instant::now();
            loop {
                let timeout = tick_rate
                    .checked_sub(last_tick.elapsed())
                    .unwrap_or_else(|| Duration::from_secs(0));

                match event::poll(timeout) {
                    Ok(true) => {
                        match event::read() {
                            Ok(CEvent::Key(key)) => {
                                if let Err(_) = tx.send(Event::Input(key)) {
                                    // Channel closed, exit thread
                                    break;
                                }
                            }
                            Ok(_) => {
                                // Ignore other events
                            }
                            Err(e) => {
                                eprintln!("Error reading terminal event: {}", e);
                                // Continue loop to avoid crashing on recoverable errors
                            }
                        }
                    }
                    Ok(false) => {
                        // Timeout occurred, no event
                    }
                    Err(e) => {
                        eprintln!("Error polling terminal events: {}", e);
                        // Continue loop to avoid crashing on recoverable errors
                    }
                }

                if last_tick.elapsed() >= tick_rate {
                    if let Err(_) = tx.send(Event::Tick) {
                        // Channel closed, exit thread
                        break;
                    }
                    last_tick = Instant::now();
                }
            }
        });

        Ok(Events { rx, _tx, _handle: handle })
    }

    pub fn next(&self) -> Result<Event<KeyEvent>> {
        self.rx.recv()
            .map_err(|e| TriliumError::TerminalError(format!("Failed to receive terminal event: {}", e)))
    }
}