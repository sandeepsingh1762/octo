import React, { useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useAgent } from "./hooks/use-agent.js";
import { Messages } from "./components/messages.js";
import { ChatInput } from "./components/input.js";
import { StatusBar } from "./components/status-bar.js";
import type { Config } from "../config/index.js";

interface AppProps {
  config: Config;
  initialPrompt?: string;
}

export const App: React.FC<AppProps> = ({ config, initialPrompt }) => {
  const { exit } = useApp();
  const { messages, isStreaming, input, setInput, sendMessage, status, tokenInfo } = useAgent(config);

  useInput((_, key) => {
    if (key.escape) {
      exit();
    }
  });

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
      // Need a slight delay to ensure render before sending
      setTimeout(() => {
        sendMessage();
      }, 100);
    }
  }, [initialPrompt]);

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" paddingTop={1} paddingX={1}>
        <Text color="magenta" bold>
          🐙 OCTOPUS AI Coding Assistant
        </Text>
        <Text color="gray" dimColor>
          v0.1.0 — Type your request. Press Enter to send, Esc to exit.
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Messages messages={messages} />
      </Box>

      <Box flexDirection="column" flexShrink={0} paddingBottom={1}>
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          disabled={isStreaming}
          placeholder={isStreaming ? "Agent is working..." : ""}
        />
        <StatusBar status={status} model={config.model} tokenInfo={tokenInfo} />
      </Box>
    </Box>
  );
};
