/**
 * Simplified HTTP client to avoid complex type issues
 */

import { NetworkError, ApiError } from '../error.js';

// Polyfill for environments without fetch
const globalFetch = globalThis.fetch || (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, no-undef
    return require('node-fetch').default;
  } catch {
    throw new Error('fetch is not available. Please install node-fetch or use Node.js 18+');
  }
})();

/**
 * Rate limiter for HTTP requests
 */
export class RateLimiter {
  private requests: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Remove requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      // Wait until the oldest request falls out of the window
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requests.push(now);
  }
}

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  rateLimiter?: RateLimiter;
}

/**
 * Simple HTTP client using fetch
 */
export class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;
  private retries: number;
  private rateLimiter?: RateLimiter;

  constructor(config: HttpClientConfig) {
    // Normalize baseUrl by removing trailing slashes to prevent double slashes
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.headers = config.headers || {};
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.rateLimiter = config.rateLimiter;
  }

  /**
   * Make a GET request
   */
  async get<T = unknown>(
    url: string, 
    options: { searchParams?: Record<string, string | number | boolean> } = {}
  ): Promise<T> {
    await this.rateLimiter?.waitIfNeeded();

    // Join baseUrl and path with proper slash handling
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = new URL(`${this.baseUrl}${path}`);
    if (options.searchParams) {
      Object.entries(options.searchParams).forEach(([key, value]) => {
        fullUrl.searchParams.set(key, String(value));
      });
    }

    const response = await this.fetchWithRetry(fullUrl.toString(), {
      method: 'GET',
      headers: this.headers,
    });

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  /**
   * Make a POST request
   */
  async post<T = unknown>(
    url: string,
    data?: unknown
  ): Promise<T> {
    await this.rateLimiter?.waitIfNeeded();

    // Join baseUrl and path with proper slash handling
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = new URL(`${this.baseUrl}${path}`);
    const response = await this.fetchWithRetry(fullUrl.toString(), {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  /**
   * Make a PUT request
   */
  async put<T = unknown>(
    url: string,
    data?: unknown
  ): Promise<T> {
    await this.rateLimiter?.waitIfNeeded();

    // Join baseUrl and path with proper slash handling
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = new URL(`${this.baseUrl}${path}`);
    const response = await this.fetchWithRetry(fullUrl.toString(), {
      method: 'PUT',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  /**
   * Make a PATCH request
   */
  async patch<T = unknown>(
    url: string,
    data?: unknown
  ): Promise<T> {
    await this.rateLimiter?.waitIfNeeded();

    // Join baseUrl and path with proper slash handling
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = new URL(`${this.baseUrl}${path}`);
    const response = await this.fetchWithRetry(fullUrl.toString(), {
      method: 'PATCH',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  /**
   * Make a DELETE request
   */
  async delete<T = unknown>(url: string): Promise<T> {
    await this.rateLimiter?.waitIfNeeded();

    // Join baseUrl and path with proper slash handling
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = new URL(`${this.baseUrl}${path}`);
    const response = await this.fetchWithRetry(fullUrl.toString(), {
      method: 'DELETE',
      headers: this.headers,
    });

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  /**
   * Make a GET request that returns plain text
   */
  async getText(url: string): Promise<string> {
    await this.rateLimiter?.waitIfNeeded();

    // Join baseUrl and path with proper slash handling
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = new URL(`${this.baseUrl}${path}`);

    const response = await this.fetchWithRetry(fullUrl.toString(), {
      method: 'GET',
      headers: this.headers,
    });

    return await response.text();
  }

  /**
   * Download binary data
   */
  async download(url: string): Promise<Buffer> {
    await this.rateLimiter?.waitIfNeeded();

    // Join baseUrl and path with proper slash handling
    const path = url.startsWith('/') ? url : `/${url}`;
    const fullUrl = new URL(`${this.baseUrl}${path}`);
    const response = await this.fetchWithRetry(fullUrl.toString(), {
      method: 'GET',
      headers: this.headers,
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await globalFetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new ApiError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            errorText
          );
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        // Handle AbortController timeout errors specifically
        if (error instanceof Error && error.name === 'AbortError') {
          // Retry on timeout if we haven't exceeded retries
          if (attempt < this.retries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
          throw new NetworkError(`Request timeout after ${this.timeout}ms`, error);
        }

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (error instanceof ApiError) {
          if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
            throw error;
          }
          // Retry on 429 (rate limit) and 5xx errors
          if (error.status === 429 || (error.status && error.status >= 500)) {
            if (attempt < this.retries) {
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
              continue;
            }
          }
          throw error;
        }

        // Retry on network errors
        if (error instanceof TypeError || 
            (error instanceof Error && (
              error.message.includes('ECONNRESET') ||
              error.message.includes('ETIMEDOUT') ||
              error.message.includes('ECONNREFUSED') ||
              error.message.includes('EHOSTUNREACH') ||
              error.message.includes('ENETUNREACH') ||
              error.message.includes('EAI_AGAIN') ||
              error.message.includes('network') ||
              error.message.includes('fetch failed')
            ))) {
          if (attempt < this.retries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
        }

        if (attempt === this.retries) {
          break;
        }

        // Default: retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new NetworkError(lastError?.message || 'Request failed after retries', lastError || undefined);
  }
}