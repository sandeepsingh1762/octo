import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useAgent } from "./hooks/use-agent.js";
import { Messages } from "./components/messages.js";
import { ChatInput } from "./components/input.js";
import { StatusBar } from "./components/status-bar.js";
import { PRODUCT_NAME, PRODUCT_VERSION } from "../config/defaults.js";
export const App = ({ config, initialPrompt }) => {
    const { exit } = useApp();
    const { messages, isStreaming, input, setInput, sendMessage, status, tokenInfo, model, promptLine, needsSetup, } = useAgent(config);
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
    return (_jsxs(Box, { flexDirection: "column", height: "100%", children: [_jsxs(Box, { flexDirection: "column", paddingTop: 1, paddingX: 1, children: [_jsx(Text, { color: "magenta", bold: true, children: `🐙 ${PRODUCT_NAME} — AI Coding Assistant` }), _jsx(Text, { color: "gray", dimColor: true, children: `v${PRODUCT_VERSION} — /help  /login  /model  Esc to exit` }), needsSetup && (_jsx(Text, { color: "yellow", children: "Setup: /login then /model <provider/model>" }))] }), _jsx(Box, { flexDirection: "column", flexGrow: 1, overflow: "hidden", children: _jsx(Messages, { messages: messages }) }), _jsxs(Box, { flexDirection: "column", flexShrink: 0, paddingBottom: 1, children: [promptLine && (_jsx(Box, { paddingX: 1, marginBottom: 0, children: _jsx(Text, { color: "yellow", bold: true, children: promptLine }) })), _jsx(ChatInput, { value: input, onChange: setInput, onSubmit: sendMessage, disabled: isStreaming, placeholder: promptLine
                            ? "Type answer and press Enter..."
                            : isStreaming
                                ? "Agent is working..."
                                : "octopus> message or /command" }), _jsx(StatusBar, { status: status, model: model, tokenInfo: tokenInfo })] })] }));
};
//# sourceMappingURL=app.js.map