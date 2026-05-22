import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "ink";
function truncate(str, len = 500) {
    if (str.length <= len)
        return str;
    return str.slice(0, len) + `\n... (${str.length - len} more chars)`;
}
export const Messages = ({ messages }) => {
    return (_jsx(Box, { flexDirection: "column", flexGrow: 1, paddingX: 1, gap: 1, children: messages.map((m, i) => {
            if (m.type === "user") {
                return (_jsx(Box, { flexDirection: "column", children: _jsxs(Text, { color: "cyan", bold: true, children: ["► ", m.text] }) }, i));
            }
            if (m.type === "assistant") {
                return (_jsx(Box, { flexDirection: "column", children: _jsx(Text, { color: "green", children: m.text }) }, i));
            }
            if (m.type === "thinking") {
                return (_jsx(Box, { flexDirection: "column", children: _jsxs(Text, { color: "gray", dimColor: true, children: ["[thinking] ", m.text] }) }, i));
            }
            if (m.type === "tool_start") {
                return (_jsx(Box, { flexDirection: "column", children: _jsxs(Text, { color: "yellow", dimColor: true, children: ["\u2699 ", m.name, "(", JSON.stringify(m.inputs).slice(0, 120), ")"] }) }, i));
            }
            if (m.type === "tool_end") {
                const ok = !m.result.startsWith("Error") && !m.result.startsWith("Denied");
                return (_jsx(Box, { flexDirection: "column", children: _jsxs(Text, { color: ok ? "green" : "red", dimColor: true, children: [ok ? "✓" : "✗", " ", m.name, " \u2192 ", m.result.split("\n").length, " lines (", m.result.length, " chars)", !m.permitted && " [DENIED]"] }) }, i));
            }
            if (m.type === "error") {
                return (_jsx(Box, { flexDirection: "column", children: _jsxs(Text, { color: "red", children: ["Error: ", m.text] }) }, i));
            }
            return null;
        }) }));
};
//# sourceMappingURL=messages.js.map