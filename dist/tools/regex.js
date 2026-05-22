import { registerTool } from "./registry.js";
function regexExtract(pattern, text, flags) {
    try {
        const re = new RegExp(pattern, flags || "g");
        const matches = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            matches.push(m[0]);
            if (!re.global)
                break;
        }
        return matches.length ? matches.slice(0, 200).join("\n") : "No matches";
    }
    catch (e) {
        return `Error: invalid regex - ${e instanceof Error ? e.message : String(e)}`;
    }
}
function regexReplace(pattern, replacement, text, flags) {
    try {
        const re = new RegExp(pattern, flags || "g");
        return text.replace(re, replacement);
    }
    catch (e) {
        return `Error: invalid regex - ${e instanceof Error ? e.message : String(e)}`;
    }
}
export function registerRegexTools() {
    registerTool({
        name: "RegexExtract",
        description: "Extract all matches of a regex pattern from a text. Supports JS-style flags (g, i, m, etc.)",
        input_schema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Regex pattern" },
                text: { type: "string", description: "Text to search" },
                flags: { type: "string", description: "Regex flags e.g. gi" },
            },
            required: ["pattern", "text"],
        },
        func: (p) => regexExtract(String(p.pattern), String(p.text), p.flags),
        read_only: true,
        concurrent_safe: true,
    });
    registerTool({
        name: "RegexReplace",
        description: "Replace all matches of a regex pattern in a text with a replacement string.",
        input_schema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Regex pattern" },
                replacement: { type: "string", description: "Replacement string" },
                text: { type: "string", description: "Text to modify" },
                flags: { type: "string", description: "Regex flags e.g. g" },
            },
            required: ["pattern", "replacement", "text"],
        },
        func: (p) => regexReplace(String(p.pattern), String(p.replacement), String(p.text), p.flags),
        read_only: false,
        concurrent_safe: true,
    });
}
//# sourceMappingURL=regex.js.map