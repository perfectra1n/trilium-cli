use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::sleep;

/// Simple rate limiter for API operations
#[derive(Clone)]
pub struct RateLimiter {
    state: Arc<Mutex<RateLimiterState>>,
    max_requests_per_window: u32,
    window_duration: Duration,
    min_interval: Duration,
}

struct RateLimiterState {
    request_times: Vec<Instant>,
    last_request: Option<Instant>,
    client_limits: HashMap<String, ClientState>,
}

struct ClientState {
    request_count: u32,
    window_start: Instant,
}

impl RateLimiter {
    /// Create a new rate limiter
    pub fn new(max_requests_per_window: u32, window_duration: Duration, min_interval: Duration) -> Self {
        Self {
            state: Arc::new(Mutex::new(RateLimiterState {
                request_times: Vec::new(),
                last_request: None,
                client_limits: HashMap::new(),
            })),
            max_requests_per_window,
            window_duration,
            min_interval,
        }
    }

    /// Create a rate limiter with conservative defaults
    pub fn default() -> Self {
        Self::new(
            100,                              // 100 requests
            Duration::from_secs(60),          // per minute
            Duration::from_millis(100),       // minimum 100ms between requests
        )
    }

    /// Create a rate limiter for high-security environments
    pub fn restrictive() -> Self {
        Self::new(
            10,                              // 10 requests
            Duration::from_secs(60),         // per minute
            Duration::from_millis(1000),     // minimum 1 second between requests
        )
    }

    /// Wait if necessary to respect rate limits, then allow the request
    pub async fn wait_if_needed(&self) -> Result<(), String> {
        let now = Instant::now();
        
        let (should_wait, wait_duration) = {
            let mut state = self.state.lock().map_err(|_| "Lock poisoned")?;
            
            // Clean old request times
            state.request_times.retain(|&time| now.duration_since(time) < self.window_duration);
            
            // Check if we need to wait for minimum interval
            let min_wait = if let Some(last) = state.last_request {
                let since_last = now.duration_since(last);
                if since_last < self.min_interval {
                    Some(self.min_interval - since_last)
                } else {
                    None
                }
            } else {
                None
            };
            
            // Check if we need to wait for rate limit window
            let rate_wait = if state.request_times.len() >= self.max_requests_per_window as usize {
                if let Some(&oldest) = state.request_times.first() {
                    let window_remaining = self.window_duration - now.duration_since(oldest);
                    Some(window_remaining)
                } else {
                    None
                }
            } else {
                None
            };
            
            // Use the longer wait time
            let wait_duration = match (min_wait, rate_wait) {
                (Some(min), Some(rate)) => Some(std::cmp::max(min, rate)),
                (Some(wait), None) | (None, Some(wait)) => Some(wait),
                (None, None) => None,
            };
            
            (wait_duration.is_some(), wait_duration.unwrap_or_default())
        };
        
        if should_wait {
            // Cap wait time to prevent excessive delays
            let capped_wait = std::cmp::min(wait_duration, Duration::from_secs(30));
            sleep(capped_wait).await;
        }
        
        // Record the request
        {
            let mut state = self.state.lock().map_err(|_| "Lock poisoned")?;
            let now = Instant::now();
            state.request_times.push(now);
            state.last_request = Some(now);
        }
        
        Ok(())
    }

    /// Check if a request would be allowed without waiting
    pub fn check_available(&self) -> bool {
        if let Ok(mut state) = self.state.lock() {
            let now = Instant::now();
            
            // Clean old request times
            state.request_times.retain(|&time| now.duration_since(time) < self.window_duration);
            
            // Check minimum interval
            if let Some(last) = state.last_request {
                if now.duration_since(last) < self.min_interval {
                    return false;
                }
            }
            
            // Check rate limit
            state.request_times.len() < self.max_requests_per_window as usize
        } else {
            false
        }
    }

    /// Get current usage statistics
    pub fn get_stats(&self) -> RateLimiterStats {
        if let Ok(mut state) = self.state.lock() {
            let now = Instant::now();
            
            // Clean old request times
            state.request_times.retain(|&time| now.duration_since(time) < self.window_duration);
            
            RateLimiterStats {
                current_requests: state.request_times.len() as u32,
                max_requests: self.max_requests_per_window,
                window_remaining: if let Some(&oldest) = state.request_times.first() {
                    self.window_duration - now.duration_since(oldest)
                } else {
                    self.window_duration
                },
                last_request: state.last_request,
            }
        } else {
            RateLimiterStats {
                current_requests: 0,
                max_requests: self.max_requests_per_window,
                window_remaining: self.window_duration,
                last_request: None,
            }
        }
    }

    /// Reset the rate limiter (for testing or administrative purposes)
    pub fn reset(&self) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "Lock poisoned")?;
        state.request_times.clear();
        state.last_request = None;
        state.client_limits.clear();
        Ok(())
    }
}

/// Statistics about rate limiter usage
#[derive(Debug, Clone)]
pub struct RateLimiterStats {
    pub current_requests: u32,
    pub max_requests: u32,
    pub window_remaining: Duration,
    pub last_request: Option<Instant>,
}

impl RateLimiterStats {
    /// Check if the rate limiter is close to its limit
    pub fn is_near_limit(&self) -> bool {
        let usage_ratio = self.current_requests as f64 / self.max_requests as f64;
        usage_ratio > 0.8 // 80% threshold
    }
    
    /// Get a human-readable summary
    pub fn summary(&self) -> String {
        format!(
            "Rate Limiter: {}/{} requests used, {:.1}s remaining in window{}",
            self.current_requests,
            self.max_requests,
            self.window_remaining.as_secs_f64(),
            if self.is_near_limit() { " (NEAR LIMIT)" } else { "" }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_rate_limiter_basic() {
        let limiter = RateLimiter::new(2, Duration::from_secs(1), Duration::from_millis(100));
        
        // First two requests should go through quickly
        assert!(limiter.check_available());
        limiter.wait_if_needed().await.unwrap();
        
        assert!(limiter.check_available());
        limiter.wait_if_needed().await.unwrap();
        
        // Third request should be blocked
        assert!(!limiter.check_available());
        
        // After waiting, should be available again
        sleep(Duration::from_secs(1)).await;
        assert!(limiter.check_available());
    }

    #[tokio::test]
    async fn test_rate_limiter_stats() {
        let limiter = RateLimiter::new(5, Duration::from_secs(10), Duration::from_millis(50));
        
        // Initially empty
        let stats = limiter.get_stats();
        assert_eq!(stats.current_requests, 0);
        assert_eq!(stats.max_requests, 5);
        assert!(stats.last_request.is_none());
        
        // After one request
        limiter.wait_if_needed().await.unwrap();
        let stats = limiter.get_stats();
        assert_eq!(stats.current_requests, 1);
        assert!(stats.last_request.is_some());
        assert!(!stats.is_near_limit());
        
        // After four more requests (near limit)
        for _ in 0..4 {
            limiter.wait_if_needed().await.unwrap();
        }
        let stats = limiter.get_stats();
        assert_eq!(stats.current_requests, 5);
        assert!(stats.is_near_limit());
    }

    #[test]
    fn test_rate_limiter_presets() {
        let default = RateLimiter::default();
        let restrictive = RateLimiter::restrictive();
        
        assert!(default.max_requests_per_window > restrictive.max_requests_per_window);
        assert!(default.min_interval < restrictive.min_interval);
    }
}