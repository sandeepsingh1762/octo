import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
export const StatusBar = ({ status, model, tokenInfo }) => (_jsxs(Box, { flexDirection: "row", justifyContent: "space-between", paddingX: 1, children: [_jsx(Text, { color: "cyan", dimColor: true, children: status }), _jsx(Text, { color: "gray", dimColor: true, children: model }), _jsx(Text, { color: "gray", dimColor: true, children: tokenInfo })] }));
//# sourceMappingURL=status-bar.js.map