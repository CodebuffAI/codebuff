import * as React from 'react';
import { Box, Text } from 'ink';

export interface ProgressBarProps {
  percent: number;
  width?: number;
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  width = 20,
  label
}) => {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const filled = Math.round(width * (clampedPercent / 100));

  return (
    <Box flexDirection="column">
      {label && <Text>{label}</Text>}
      <Box>
        <Text>[</Text>
        <Text color="green">{'='.repeat(filled)}</Text>
        <Text>{' '.repeat(width - filled)}</Text>
        <Text>] {clampedPercent}%</Text>
      </Box>
    </Box>
  );
};
