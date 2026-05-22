import * as child_process from "child_process";
import { registerTool } from "./registry.js";
function hasRg() {
    try {
        child_process.execSync("rg --version", { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
function grepSearch(pattern, path, glob, output_mode = "files_with_matches", case_insensitive = false, context = 0) {
    const use_rg = hasRg();
    const cmd = [use_rg ? "rg" : "grep", "--no-heading"];
    if (case_insensitive)
        cmd.push("-i");
    if (output_mode === "files_with_matches")
        cmd.push("-l");
    else if (output_mode === "count")
        cmd.push("-c");
    else {
        cmd.push("-n");
        if (context)
            cmd.push("-C", String(context));
    }
    if (glob)
        cmd.push(use_rg ? "--glob" : "--include", glob);
    cmd.push(pattern);
    cmd.push(path || process.cwd());
    try {
        const out = child_process.execSync(cmd.join(" "), { encoding: "utf-8", timeout: 30000 });
        return out.trim().slice(0, 20000) || "No matches found";
    }
    catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
}
function codebaseSearch(query, path) {
    // A more powerful codebase search using ripgrep with multiple strategies
    const base = path || process.cwd();
    const results = [];
    try {
        // Try exact substring search first
        const exact = child_process.execSync(`rg -n --no-heading -i -F -m 20 "${query}" "${base}"`, {
            encoding: "utf-8",
            timeout: 30000,
        });
        if (exact.trim())
            results.push("=== EXACT MATCHES ===\n" + exact.trim().slice(0, 8000));
        // Try regex pattern search
        const regex = child_process.execSync(`rg -n --no-heading -i -m 20 "${query.replace(/\s+/g, ".*")}" "${base}"`, {
            encoding: "utf-8",
            timeout: 30000,
        });
        if (regex.trim())
            results.push("=== REGEX MATCHES ===\n" + regex.trim().slice(0, 8000));
    }
    catch {
        // ignore
    }
    if (!results.length)
        return "No codebase matches found.";
    return results.join("\n\n");
}
export function registerSearchTools() {
    registerTool({
        name: "Grep",
        description: "Search file contents with regex using ripgrep (falls back to grep).",
        input_schema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Regex pattern" },
                path: { type: "string", description: "File or directory to search" },
                glob: { type: "string", description: "File filter e.g. *.ts" },
                output_mode: { type: "string", enum: ["content", "files_with_matches", "count"], description: "content=matching lines, files_with_matches=file paths, count=match counts" },
                case_insensitive: { type: "boolean" },
                context: { type: "integer", description: "Lines of context around matches" },
            },
            required: ["pattern"],
        },
        func: (p) => grepSearch(String(p.pattern), p.path, p.glob, p.output_mode || "files_with_matches", Boolean(p.case_insensitive), p.context || 0),
        read_only: true,
        concurrent_safe: true,
    });
    registerTool({
        name: "CodebaseSearch",
        description: "Powerful codebase search combining exact, regex, and semantic-style matching across the project. Returns file paths and matching lines.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query (can be natural language or code snippet)" },
                path: { type: "string", description: "Base directory (default: cwd)" },
            },
            required: ["query"],
        },
        func: (p) => codebaseSearch(String(p.query), p.path),
        read_only: true,
        concurrent_safe: true,
    });
}
//# sourceMappingURL=search.js.map