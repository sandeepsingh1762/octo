import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  status: string;
  model: string;
  tokenInfo: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({ status, model, tokenInfo }) => (
  <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
    <Text color="cyan" dimColor>
      {status}
    </Text>
    <Text color="gray" dimColor>
      {model}
    </Text>
    <Text color="gray" dimColor>
      {tokenInfo}
    </Text>
  </Box>
);
