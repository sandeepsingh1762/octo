import React, { useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useAgent } from "./hooks/use-agent.js";
import { Messages } from "./components/messages.js";
import { ChatInput } from "./components/input.js";
import { StatusBar } from "./components/status-bar.js";
import type { Config } from "../config/index.js";
import { PRODUCT_NAME, PRODUCT_VERSION } from "../config/defaults.js";

interface AppProps {
  config: Config;
  initialPrompt?: string;
}

export const App: React.FC<AppProps> = ({ config, initialPrompt }) => {
  const { exit } = useApp();
  const {
    messages,
    isStreaming,
    input,
    setInput,
    sendMessage,
    status,
    tokenInfo,
    model,
    promptLine,
    needsSetup,
  } = useAgent(config);

  useInput((_, key) => {
    if (key.escape && !promptLine) {
      exit();
    }
  });

  useEffect(() => {
    if (initialPrompt && !needsSetup) {
      setInput(initialPrompt);
      const t = setTimeout(() => sendMessage(), 100);
      return () => clearTimeout(t);
    }
  }, [initialPrompt, needsSetup]);

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" paddingTop={1} paddingX={1}>
        <Text color="magenta" bold>
          {`🐙 ${PRODUCT_NAME} — AI Coding Assistant`}
        </Text>
        <Text color="gray" dimColor>
          {`v${PRODUCT_VERSION} — /help  /login  /model  Esc to exit`}
        </Text>
        {needsSetup && (
          <Text color="yellow">Setup: /login then /model &lt;provider/model&gt;</Text>
        )}
      </Box>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Messages messages={messages} />
      </Box>

      <Box flexDirection="column" flexShrink={0} paddingBottom={1}>
        {promptLine && (
          <Box paddingX={1} marginBottom={0}>
            <Text color="yellow" bold>
              {promptLine}
            </Text>
          </Box>
        )}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          disabled={isStreaming}
          placeholder={
            promptLine
              ? "Type answer and press Enter..."
              : isStreaming
                ? "Agent is working..."
                : "octopus> message or /command"
          }
        />
        <StatusBar status={status} model={model} tokenInfo={tokenInfo} />
      </Box>
    </Box>
  );
};
