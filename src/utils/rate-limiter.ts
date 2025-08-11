/**
 * Rate Limiting Utilities
 * 
 * Provides comprehensive API rate limiting, request throttling, backoff strategies,
 * concurrent request management, and performance monitoring.
 */

/**
 * Rate limiting algorithm types
 */
export enum RateLimitAlgorithm {
  TokenBucket = 'token-bucket',
  SlidingWindow = 'sliding-window',
  FixedWindow = 'fixed-window',
  LeakyBucket = 'leaky-bucket'
}

/**
 * Backoff strategy types
 */
export enum BackoffStrategy {
  Linear = 'linear',
  Exponential = 'exponential',
  Fibonacci = 'fibonacci',
  Custom = 'custom'
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests per window */
  maxRequests: number;
  
  /** Time window in milliseconds */
  windowMs: number;
  
  /** Rate limiting algorithm */
  algorithm: RateLimitAlgorithm;
  
  /** Enable burst allowance */
  burstAllowance: number;
  
  /** Request priority levels */
  priorityLevels: number;
  
  /** Enable request queuing */
  enableQueuing: boolean;
  
  /** Maximum queue size */
  maxQueueSize: number;
  
  /** Queue timeout in milliseconds */
  queueTimeoutMs: number;
}

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  algorithm: RateLimitAlgorithm.TokenBucket,
  burstAllowance: 10,
  priorityLevels: 3,
  enableQueuing: true,
  maxQueueSize: 100,
  queueTimeoutMs: 30000 // 30 seconds
};

/**
 * Backoff configuration
 */
export interface BackoffConfig {
  /** Initial delay in milliseconds */
  initialDelay: number;
  
  /** Maximum delay in milliseconds */
  maxDelay: number;
  
  /** Backoff strategy */
  strategy: BackoffStrategy;
  
  /** Maximum number of retries */
  maxRetries: number;
  
  /** Jitter factor (0-1) */
  jitter: number;
  
  /** Custom backoff function */
  customBackoff?: (attempt: number, baseDelay: number) => number;
}

/**
 * Default backoff configuration
 */
export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  strategy: BackoffStrategy.Exponential,
  maxRetries: 3,
  jitter: 0.1
};

/**
 * Request metadata
 */
export interface RequestMetadata {
  id: string;
  timestamp: number;
  priority: number;
  retryCount: number;
  endpoint?: string;
  method?: string;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;
  retryAfter?: number;
  queuePosition?: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  totalRequests: number;
  successfulRequests: number;
  rateLimitedRequests: number;
  queuedRequests: number;
  averageResponseTime: number;
  throughput: number;
  errorRate: number;
  lastResetTime: number;
}

/**
 * Token bucket rate limiter implementation
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly config: RateLimitConfig;
  
  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
    this.tokens = this.config.maxRequests;
    this.lastRefill = Date.now();
  }
  
  /**
   * Check if request is allowed and consume token
   */
  isAllowed(tokensRequested = 1): RateLimitStatus {
    this.refillTokens();
    
    if (this.tokens >= tokensRequested) {
      this.tokens -= tokensRequested;
      return {
        allowed: true,
        remainingRequests: this.tokens,
        resetTime: this.lastRefill + this.config.windowMs
      };
    }
    
    return {
      allowed: false,
      remainingRequests: this.tokens,
      resetTime: this.lastRefill + this.config.windowMs,
      retryAfter: Math.ceil((this.config.windowMs - (Date.now() - this.lastRefill)) / 1000)
    };
  }
  
  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    if (timePassed >= this.config.windowMs) {
      this.tokens = this.config.maxRequests;
      this.lastRefill = now;
    } else {
      const tokensToAdd = (timePassed / this.config.windowMs) * this.config.maxRequests;
      this.tokens = Math.min(this.config.maxRequests, this.tokens + tokensToAdd);
    }
  }
  
  /**
   * Reset the limiter
   */
  reset(): void {
    this.tokens = this.config.maxRequests;
    this.lastRefill = Date.now();
  }
}

/**
 * Sliding window rate limiter implementation
 */
export class SlidingWindowRateLimiter {
  private requests: Map<number, number> = new Map();
  private readonly config: RateLimitConfig;
  
  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }
  
  /**
   * Check if request is allowed
   */
  isAllowed(): RateLimitStatus {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Clean old requests
    this.cleanOldRequests(windowStart);
    
    // Count requests in current window
    const currentRequests = this.countRequestsInWindow(windowStart, now);
    
    if (currentRequests < this.config.maxRequests) {
      // Add current request
      const bucket = Math.floor(now / 1000); // 1-second buckets
      this.requests.set(bucket, (this.requests.get(bucket) || 0) + 1);
      
      return {
        allowed: true,
        remainingRequests: this.config.maxRequests - currentRequests - 1,
        resetTime: windowStart + this.config.windowMs
      };
    }
    
    return {
      allowed: false,
      remainingRequests: 0,
      resetTime: windowStart + this.config.windowMs,
      retryAfter: Math.ceil((this.getOldestRequestTime() + this.config.windowMs - now) / 1000)
    };
  }
  
  /**
   * Clean old requests outside the window
   */
  private cleanOldRequests(windowStart: number): void {
    const bucketStart = Math.floor(windowStart / 1000);
    
    for (const [bucket] of this.requests) {
      if (bucket < bucketStart) {
        this.requests.delete(bucket);
      }
    }
  }
  
  /**
   * Count requests in the current window
   */
  private countRequestsInWindow(windowStart: number, windowEnd: number): number {
    let count = 0;
    const bucketStart = Math.floor(windowStart / 1000);
    const bucketEnd = Math.floor(windowEnd / 1000);
    
    for (let bucket = bucketStart; bucket <= bucketEnd; bucket++) {
      count += this.requests.get(bucket) || 0;
    }
    
    return count;
  }
  
  /**
   * Get timestamp of oldest request in window
   */
  private getOldestRequestTime(): number {
    const oldestBucket = Math.min(...this.requests.keys());
    return oldestBucket * 1000;
  }
  
  /**
   * Reset the limiter
   */
  reset(): void {
    this.requests.clear();
  }
}

/**
 * Priority queue for request management
 */
export class RequestQueue {
  private queue: Array<{ metadata: RequestMetadata; resolve: (status: RateLimitStatus) => void; reject: (error: Error) => void }> = [];
  private processing = false;
  private readonly config: RateLimitConfig;
  
  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }
  
  /**
   * Add request to queue
   */
  enqueue(metadata: RequestMetadata): Promise<RateLimitStatus> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.config.maxQueueSize) {
        reject(new Error('Queue is full'));
        return;
      }
      
      const item = { metadata, resolve, reject };
      
      // Insert based on priority (higher priority first)
      let inserted = false;
      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].metadata.priority < metadata.priority) {
          this.queue.splice(i, 0, item);
          inserted = true;
          break;
        }
      }
      
      if (!inserted) {
        this.queue.push(item);
      }
      
      // Set timeout for queued request
      setTimeout(() => {
        const index = this.queue.findIndex(q => q.metadata.id === metadata.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error('Queue timeout'));
        }
      }, this.config.queueTimeoutMs);
      
      this.processQueue();
    });
  }
  
  /**
   * Process queued requests
   */
  private processQueue(): void {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    const processNext = () => {
      if (this.queue.length === 0) {
        this.processing = false;
        return;
      }
      
      const item = this.queue.shift()!;
      
      // Simulate rate limit check (would integrate with actual limiter)
      const status: RateLimitStatus = {
        allowed: true,
        remainingRequests: 10,
        resetTime: Date.now() + 60000,
        queuePosition: this.queue.length
      };
      
      item.resolve(status);
      
      // Process next with small delay
      setTimeout(processNext, 100);
    };
    
    processNext();
  }
  
  /**
   * Get queue status
   */
  getStatus(): { length: number; processing: boolean } {
    return {
      length: this.queue.length,
      processing: this.processing
    };
  }
  
  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
    this.processing = false;
  }
}

/**
 * Backoff calculator with different strategies
 */
export class BackoffCalculator {
  private readonly config: BackoffConfig;
  
  constructor(config: Partial<BackoffConfig> = {}) {
    this.config = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  }
  
  /**
   * Calculate delay for given attempt
   */
  calculateDelay(attempt: number): number {
    if (attempt > this.config.maxRetries) {
      return -1; // No more retries
    }
    
    let delay: number;
    
    switch (this.config.strategy) {
      case BackoffStrategy.Linear:
        delay = this.config.initialDelay * attempt;
        break;
        
      case BackoffStrategy.Exponential:
        delay = this.config.initialDelay * Math.pow(2, attempt - 1);
        break;
        
      case BackoffStrategy.Fibonacci:
        delay = this.config.initialDelay * this.fibonacci(attempt);
        break;
        
      case BackoffStrategy.Custom:
        if (this.config.customBackoff) {
          delay = this.config.customBackoff(attempt, this.config.initialDelay);
        } else {
          delay = this.config.initialDelay;
        }
        break;
        
      default:
        delay = this.config.initialDelay;
    }
    
    // Apply jitter
    const jitterAmount = delay * this.config.jitter * (Math.random() - 0.5) * 2;
    delay = Math.max(0, delay + jitterAmount);
    
    // Cap at maximum delay
    return Math.min(delay, this.config.maxDelay);
  }
  
  /**
   * Calculate fibonacci number
   */
  private fibonacci(n: number): number {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b];
    }
    return b;
  }
}

/**
 * Comprehensive rate limiter with all features
 */
export class AdvancedRateLimiter {
  private limiter: TokenBucketRateLimiter | SlidingWindowRateLimiter;
  private queue: RequestQueue;
  private backoffCalculator: BackoffCalculator;
  private metrics: PerformanceMetrics;
  private readonly config: RateLimitConfig;
  
  constructor(
    rateLimitConfig: Partial<RateLimitConfig> = {},
    backoffConfig: Partial<BackoffConfig> = {}
  ) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...rateLimitConfig };
    
    // Initialize appropriate limiter based on algorithm
    switch (this.config.algorithm) {
      case RateLimitAlgorithm.TokenBucket:
        this.limiter = new TokenBucketRateLimiter(this.config);
        break;
      case RateLimitAlgorithm.SlidingWindow:
        this.limiter = new SlidingWindowRateLimiter(this.config);
        break;
      default:
        this.limiter = new TokenBucketRateLimiter(this.config);
    }
    
    this.queue = new RequestQueue(this.config);
    this.backoffCalculator = new BackoffCalculator(backoffConfig);
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitedRequests: 0,
      queuedRequests: 0,
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      lastResetTime: Date.now()
    };
  }
  
  /**
   * Execute request with rate limiting and backoff
   */
  async executeRequest<T>(
    requestFn: () => Promise<T>,
    metadata: Partial<RequestMetadata> = {}
  ): Promise<T> {
    const requestMetadata: RequestMetadata = {
      id: generateRequestId(),
      timestamp: Date.now(),
      priority: 1,
      retryCount: 0,
      ...metadata
    };
    
    this.metrics.totalRequests++;
    
    return this.executeWithRetry(requestFn, requestMetadata);
  }
  
  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    metadata: RequestMetadata
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      // Check rate limit
      const status = this.limiter.isAllowed();
      
      if (!status.allowed) {
        this.metrics.rateLimitedRequests++;
        
        if (this.config.enableQueuing) {
          // Add to queue
          this.metrics.queuedRequests++;
          await this.queue.enqueue(metadata);
        } else {
          // Calculate backoff delay
          const delay = this.backoffCalculator.calculateDelay(metadata.retryCount + 1);
          
          if (delay === -1) {
            throw new Error('Maximum retry attempts reached');
          }
          
          await this.sleep(delay);
          metadata.retryCount++;
          return this.executeWithRetry(requestFn, metadata);
        }
      }
      
      // Execute the request
      const result = await requestFn();
      
      // Update metrics
      this.metrics.successfulRequests++;
      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);
      
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateResponseTime(responseTime);
      
      // Retry logic for failed requests
      if (this.shouldRetry(error, metadata)) {
        const delay = this.backoffCalculator.calculateDelay(metadata.retryCount + 1);
        
        if (delay !== -1) {
          await this.sleep(delay);
          metadata.retryCount++;
          return this.executeWithRetry(requestFn, metadata);
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Check if request should be retried
   */
  private shouldRetry(error: unknown, metadata: RequestMetadata): boolean {
    // Implement retry logic based on error type and metadata
    if (metadata.retryCount >= this.backoffCalculator['config'].maxRetries) {
      return false;
    }
    
    // Retry on network errors, 5xx status codes, rate limits, etc.
    const errorMessage = error instanceof Error ? error.message : String(error);
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /rate limit/i,
      /5\d{2}/,
      /429/
    ];
    
    return retryablePatterns.some(pattern => pattern.test(errorMessage));
  }
  
  /**
   * Update response time metrics
   */
  private updateResponseTime(responseTime: number): void {
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1);
    this.metrics.averageResponseTime = (totalTime + responseTime) / this.metrics.totalRequests;
  }
  
  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const now = Date.now();
    const timeElapsed = (now - this.metrics.lastResetTime) / 1000; // seconds
    
    return {
      ...this.metrics,
      throughput: timeElapsed > 0 ? this.metrics.successfulRequests / timeElapsed : 0,
      errorRate: this.metrics.totalRequests > 0 ? 
        (this.metrics.totalRequests - this.metrics.successfulRequests) / this.metrics.totalRequests : 0
    };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      rateLimitedRequests: 0,
      queuedRequests: 0,
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0,
      lastResetTime: Date.now()
    };
  }
  
  /**
   * Get current rate limit status
   */
  getStatus(): RateLimitStatus {
    return this.limiter.isAllowed(0); // Don't consume tokens, just check status
  }
  
  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== Helper Functions ==========

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create rate limiter factory function
 */
export function createRateLimiter(
  rateLimitConfig?: Partial<RateLimitConfig>,
  backoffConfig?: Partial<BackoffConfig>
): AdvancedRateLimiter {
  return new AdvancedRateLimiter(rateLimitConfig, backoffConfig);
}

/**
 * Create simple token bucket limiter
 */
export function createSimpleRateLimiter(maxRequests: number, windowMs: number): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter({ maxRequests, windowMs });
}

/**
 * Rate limit decorator for functions
 */
export function rateLimited<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  rateLimiter: AdvancedRateLimiter
): T {
  return (async (...args: any[]) => {
    return rateLimiter.executeRequest(() => fn(...args));
  }) as T;
}