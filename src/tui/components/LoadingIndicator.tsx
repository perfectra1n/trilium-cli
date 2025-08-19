import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface LoadingIndicatorProps {
  message?: string;
  type?: 'dots' | 'line' | 'arc' | 'bouncingBar';
  fullScreen?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Loading...',
  type = 'dots',
  fullScreen = false
}) => {
  const content = (
    <Box justifyContent="center" alignItems="center" padding={1}>
      <Text>
        <Spinner type={type} /> {message}
      </Text>
    </Box>
  );

  if (fullScreen) {
    return (
      <Box
        width="100%"
        height="100%"
        justifyContent="center"
        alignItems="center"
        flexDirection="column"
      >
        {content}
      </Box>
    );
  }

  return content;
};

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  children: React.ReactNode;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  message,
  children
}) => {
  if (!isLoading) {
    return <>{children}</>;
  }

  return (
    <Box width="100%" height="100%" flexDirection="column">
      <Box flexGrow={1} justifyContent="center" alignItems="center">
        <Box
          borderStyle="round"
          borderColor="blue"
          padding={1}
        >
          <LoadingIndicator message={message} />
        </Box>
      </Box>
    </Box>
  );
};