import React from "react";
import { Box, Text } from "ink";
import type { MessageItem } from "../hooks/use-agent.js";

interface MessagesProps {
  messages: MessageItem[];
}

function truncate(str: string, len = 500) {
  if (str.length <= len) return str;
  return str.slice(0, len) + `\n... (${str.length - len} more chars)`;
}

export const Messages: React.FC<MessagesProps> = ({ messages }) => {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={1}>
      {messages.map((m, i) => {
        if (m.type === "user") {
          return (
            <Box key={i} flexDirection="column">
              <Text color="cyan" bold>
                {"► "}
                {m.text}
              </Text>
            </Box>
          );
        }
        if (m.type === "assistant") {
          return (
            <Box key={i} flexDirection="column">
              <Text color="green">{m.text}</Text>
            </Box>
          );
        }
        if (m.type === "thinking") {
          return (
            <Box key={i} flexDirection="column">
              <Text color="gray" dimColor>
                [thinking] {m.text}
              </Text>
            </Box>
          );
        }
        if (m.type === "tool_start") {
          return (
            <Box key={i} flexDirection="column">
              <Text color="yellow" dimColor>
                ⚙ {m.name}({JSON.stringify(m.inputs).slice(0, 120)})
              </Text>
            </Box>
          );
        }
        if (m.type === "tool_end") {
          const ok = !m.result.startsWith("Error") && !m.result.startsWith("Denied");
          return (
            <Box key={i} flexDirection="column">
              <Text color={ok ? "green" : "red"} dimColor>
                {ok ? "✓" : "✗"} {m.name} → {m.result.split("\n").length} lines ({m.result.length} chars)
                {!m.permitted && " [DENIED]"}
              </Text>
            </Box>
          );
        }
        if (m.type === "error") {
          return (
            <Box key={i} flexDirection="column">
              <Text color="red">Error: {m.text}</Text>
            </Box>
          );
        }
        return null;
      })}
    </Box>
  );
};
