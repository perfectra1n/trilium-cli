import { Box, Text } from 'ink';
import React, { useState, useEffect } from 'react';

import { TriliumClient } from '../../api/client.js';
import type { Config } from '../../config/index.js';
import type { GlobalOptions } from '../../types/cli.js';

interface AppProps {
  config: Config;
  options: GlobalOptions;
}

export function App({ config, options }: AppProps): JSX.Element {
  const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const profile = config.getCurrentProfile();
        const client = new TriliumClient({
          baseUrl: profile.serverUrl,
          apiToken: profile.apiToken || '',
        });

        await client.testConnection();
        setStatus('connected');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('error');
      }
    };

    testConnection();
  }, [config]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Trilium CLI - Terminal User Interface
        </Text>
      </Box>

      {status === 'loading' && (
        <Box>
          <Text>Connecting to Trilium server...</Text>
        </Box>
      )}

      {status === 'connected' && (
        <Box flexDirection="column">
          <Text color="green">✓ Connected to Trilium server</Text>
          <Box marginTop={1}>
            <Text dimColor>
              TUI interface coming soon! Use Ctrl+C to exit.
            </Text>
          </Box>
        </Box>
      )}

      {status === 'error' && (
        <Box flexDirection="column">
          <Text color="red">✗ Connection failed</Text>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}
    </Box>
  );
}