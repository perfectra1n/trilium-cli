/**
 * Terminal state management utilities for external editor integration
 */

/**
 * Save the current terminal state
 */
export function saveTerminalState(): void {
  // Save current terminal settings
  if (process.stdout.isTTY) {
    // Store the current raw mode state
    const isRaw = process.stdin.isRaw;
    process.stdin.setRawMode?.(false);
  }
}

/**
 * Restore the terminal state after external editor
 */
export function restoreTerminalState(): void {
  // Clear any lingering output
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[0f'); // Clear screen and move cursor to top
  }
  
  // Ensure stdin is in the correct mode
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false);
  }
}

/**
 * Prepare terminal for external editor launch
 */
export function prepareForExternalEditor(): void {
  // Ensure we're not in raw mode
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false);
  }
  
  // Pause any stdin handlers
  process.stdin.pause();
}

/**
 * Resume terminal after external editor
 */
export function resumeAfterExternalEditor(): void {
  // Resume stdin
  process.stdin.resume();
  
  // Clear the screen for a clean return
  if (process.stdout.isTTY) {
    process.stdout.write('\x1b[2J\x1b[0f');
  }
}

/**
 * Handle process signals properly when launching external editor
 */
export function setupSignalHandlers(): () => void {
  const originalSigintHandler = process.listeners('SIGINT')[0];
  const originalSigtermHandler = process.listeners('SIGTERM')[0];
  
  // Remove existing handlers temporarily
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  
  // Return cleanup function
  return () => {
    // Restore original handlers
    if (originalSigintHandler) {
      process.on('SIGINT', originalSigintHandler as any);
    }
    if (originalSigtermHandler) {
      process.on('SIGTERM', originalSigtermHandler as any);
    }
  };
}