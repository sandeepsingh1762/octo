import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useAgent } from "./hooks/use-agent.js";
import { Messages } from "./components/messages.js";
import { ChatInput } from "./components/input.js";
import { StatusBar } from "./components/status-bar.js";
export const App = ({ config, initialPrompt }) => {
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
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsxs(Box, { flexDirection: "column", paddingTop: 1, paddingX: 1, children: [_jsx(Text, { color: "magenta", bold: true, children: "\uD83D\uDC19 OCTOPUS AI Coding Assistant" }), _jsx(Text, { color: "gray", dimColor: true, children: "v0.1.0 \u2014 Type your request. Press Enter to send, Esc to exit." })] }), _jsx(Box, { flexDirection: "column", flexGrow: 1, overflow: "hidden", children: _jsx(Messages, { messages: messages }) }), _jsxs(Box, { flexDirection: "column", flexShrink: 0, paddingBottom: 1, children: [_jsx(ChatInput, { value: input, onChange: setInput, onSubmit: sendMessage, disabled: isStreaming, placeholder: isStreaming ? "Agent is working..." : "" }), _jsx(StatusBar, { status: status, model: config.model, tokenInfo: tokenInfo })] })] }));
};
//# sourceMappingURL=app.js.map