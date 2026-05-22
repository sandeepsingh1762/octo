import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text, useInput } from "ink";
export const ChatInput = ({ value, onChange, onSubmit, disabled, placeholder }) => {
    useInput((input, key) => {
        if (disabled)
            return;
        if (key.return) {
            onSubmit();
            return;
        }
        if (key.backspace || key.delete) {
            onChange(value.slice(0, -1));
            return;
        }
        if (input) {
            onChange(value + input);
        }
    });
    return (_jsxs(Box, { flexDirection: "row", paddingX: 1, borderStyle: "single", borderColor: disabled ? "gray" : "cyan", children: [_jsx(Text, { color: "cyan", bold: true, children: "octopus> " }), _jsx(Text, { color: disabled ? "gray" : "white", children: value || placeholder || "" }), !disabled && _jsx(Text, { color: "cyan", children: "\u258E" })] }));
};
//# sourceMappingURL=input.js.map