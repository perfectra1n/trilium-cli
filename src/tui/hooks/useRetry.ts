import { useState, useCallback, useRef, useEffect } from 'react';

interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

interface RetryState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  attempt: number;
  isRetrying: boolean;
}

export function useRetry<T>(
  asyncFn: () => Promise<T>,
  options: RetryOptions = {}
) {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoffMultiplier = 2,
    onRetry
  } = options;

  const [state, setState] = useState<RetryState<T>>({
    data: null,
    error: null,
    isLoading: false,
    attempt: 0,
    isRetrying: false
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const execute = useCallback(async () => {
    // Cancel any pending operations
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      attempt: 1,
      isRetrying: false
    }));

    let currentAttempt = 1;
    let lastError: Error | null = null;

    while (currentAttempt <= maxAttempts) {
      try {
        const result = await asyncFn();
        
        setState({
          data: result,
          error: null,
          isLoading: false,
          attempt: currentAttempt,
          isRetrying: false
        });
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (currentAttempt < maxAttempts) {
          const retryDelay = delay * Math.pow(backoffMultiplier, currentAttempt - 1);
          
          setState(prev => ({
            ...prev,
            error: lastError,
            attempt: currentAttempt,
            isRetrying: true
          }));

          if (onRetry) {
            onRetry(currentAttempt, lastError);
          }

          // Wait before retrying
          await new Promise((resolve, reject) => {
            timeoutRef.current = setTimeout(resolve, retryDelay);
            
            // Allow cancellation during delay
            if (abortControllerRef.current) {
              abortControllerRef.current.signal.addEventListener('abort', () => {
                reject(new Error('Retry cancelled'));
              });
            }
          });

          currentAttempt++;
        } else {
          break;
        }
      }
    }

    // All attempts failed
    setState({
      data: null,
      error: lastError,
      isLoading: false,
      attempt: currentAttempt,
      isRetrying: false
    });

    throw lastError;
  }, [asyncFn, maxAttempts, delay, backoffMultiplier, onRetry]);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setState({
      data: null,
      error: null,
      isLoading: false,
      attempt: 0,
      isRetrying: false
    });
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setState(prev => ({
      ...prev,
      isLoading: false,
      isRetrying: false
    }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    cancel
  };
}

// Hook specifically for API calls with retry
export function useApiWithRetry<T>(
  apiCall: () => Promise<T>,
  dependencies: React.DependencyList = [],
  autoExecute = false
) {
  const retry = useRetry(apiCall, {
    maxAttempts: 3,
    delay: 1000,
    backoffMultiplier: 2,
    onRetry: (attempt, error) => {
      console.error(`API call failed (attempt ${attempt}):`, error.message);
    }
  });

  useEffect(() => {
    if (autoExecute) {
      retry.execute().catch(() => {
        // Error is already in state
      });
    }

    return () => {
      retry.cancel();
    };
  }, dependencies);

  return retry;
}