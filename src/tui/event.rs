use crossterm::event::{self, Event as CEvent, KeyEvent};
use std::sync::{mpsc, Arc, Mutex};
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
    suspended: Arc<Mutex<bool>>,
}

impl Events {
    pub fn new(tick_rate: Duration) -> Result<Events> {
        let (tx, rx) = mpsc::channel();
        let _tx = tx.clone();
        let suspended = Arc::new(Mutex::new(false));
        let suspended_clone = suspended.clone();

        let handle = thread::spawn(move || {
            let mut last_tick = Instant::now();
            loop {
                // Check if event processing is suspended
                let is_suspended = {
                    suspended_clone.lock().unwrap_or_else(|e| {
                        eprintln!("Warning: Mutex poison error in event loop: {}", e);
                        e.into_inner()
                    }).clone()
                };
                
                if is_suspended {
                    // When suspended, only send tick events and sleep briefly
                    thread::sleep(Duration::from_millis(100));
                    if last_tick.elapsed() >= tick_rate {
                        if let Err(_) = tx.send(Event::Tick) {
                            // Channel closed, exit thread
                            break;
                        }
                        last_tick = Instant::now();
                    }
                    continue;
                }

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
                                // Ignore other events like resize, mouse, etc.
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

        Ok(Events { rx, _tx, _handle: handle, suspended })
    }

    pub fn next(&self) -> Result<Event<KeyEvent>> {
        self.rx.recv()
            .map_err(|e| TriliumError::TerminalError(format!("Failed to receive terminal event: {}", e)))
    }

    /// Suspend event processing (except ticks) - used during external editor sessions
    pub fn suspend(&self) {
        if let Ok(mut suspended) = self.suspended.lock() {
            *suspended = true;
        }
    }

    /// Resume event processing after suspension
    pub fn resume(&self) {
        if let Ok(mut suspended) = self.suspended.lock() {
            *suspended = false;
        }
    }
    
    /// Flush any pending keyboard events to prevent stale input
    pub fn flush_input(&self) {
        // Drain all pending events from the crossterm event queue
        // Use a more aggressive timeout to ensure we clear everything
        let mut events_flushed = 0;
        let max_events = 1000; // Prevent infinite loops
        
        while events_flushed < max_events {
            match event::poll(Duration::from_millis(1)) {
                Ok(true) => {
                    match event::read() {
                        Ok(_) => {
                            events_flushed += 1;
                        }
                        Err(_) => break, // Stop if we can't read events
                    }
                }
                Ok(false) => break, // No more events
                Err(_) => break,    // Error polling, stop
            }
        }
        
        // If we flushed a lot of events, it might indicate an issue
        if events_flushed > 10 {
            eprintln!("Warning: Flushed {} terminal events - this might indicate escape sequence contamination", events_flushed);
        }
    }
    
    /// Check if the event system is responsive and validate terminal state
    pub fn validate_terminal_state(&self) -> bool {
        // Quick responsiveness test - check if polling works
        match event::poll(Duration::from_millis(1)) {
            Ok(_) => true,  // Terminal is responsive
            Err(e) => {
                eprintln!("Warning: Terminal polling failed during validation: {}", e);
                false
            }
        }
    }
}