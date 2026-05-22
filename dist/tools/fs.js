import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { registerTool } from "./registry.js";
import { unifiedDiff, maybeTruncateDiff } from "./diff.js";
async function readFile(file_path, limit, offset) {
    try {
        const p = path.resolve(file_path);
        const stat = await fs.stat(p).catch(() => null);
        if (!stat)
            return `Error: file not found: ${file_path}`;
        if (stat.isDirectory())
            return `Error: ${file_path} is a directory`;
        const content = await fs.readFile(p, "utf-8");
        const lines = content.split("\n");
        const start = offset ?? 0;
        const chunk = limit ? lines.slice(start, start + limit) : lines.slice(start);
        if (!chunk.length)
            return "(empty file)";
        return chunk.map((l, i) => `${(start + i + 1).toString().padStart(6)}\t${l}`).join("\n");
    }
    catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
}
async function writeFile(file_path, content) {
    try {
        const p = path.resolve(file_path);
        const exists = await fs.stat(p).catch(() => null);
        const oldContent = exists ? await fs.readFile(p, "utf-8") : "";
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, content, "utf-8");
        const lc = content.split("\n").length;
        if (!exists)
            return `Created ${file_path} (${lc} lines)`;
        const diff = unifiedDiff(oldContent, content, path.basename(p));
        if (!diff)
            return `No changes in ${file_path}`;
        return `File updated — ${file_path}:\n\n${maybeTruncateDiff(diff)}`;
    }
    catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
}
async function editFile(file_path, old_string, new_string, replace_all = false) {
    try {
        const p = path.resolve(file_path);
        const content = await fs.readFile(p, "utf-8");
        const normContent = content.replace(/\r\n/g, "\n");
        const normOld = old_string.replace(/\r\n/g, "\n");
        const normNew = new_string.replace(/\r\n/g, "\n");
        const count = normContent.split(normOld).length - 1;
        if (count === 0)
            return "Error: old_string not found in file. Please ensure EXACT match.";
        if (count > 1 && !replace_all)
            return `Error: old_string appears ${count} times. Use replace_all=true or provide more context.`;
        const newContent = replace_all ? normContent.split(normOld).join(normNew) : normContent.replace(normOld, normNew);
        await fs.writeFile(p, newContent, "utf-8");
        const diff = unifiedDiff(content, newContent, path.basename(p));
        return `Changes applied to ${path.basename(p)}:\n\n${diff}`;
    }
    catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
}
function globFiles(pattern, dir) {
    const cwd = dir ? path.resolve(dir) : process.cwd();
    const matches = glob.sync(pattern, { cwd, absolute: true });
    if (!matches.length)
        return "No files matched";
    return matches.slice(0, 500).join("\n");
}
export function registerFsTools() {
    registerTool({
        name: "Read",
        description: "Read a file's contents. Returns content with line numbers (format: 'N\\tline'). Use limit/offset to read large files in chunks.",
        input_schema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Absolute or relative file path" },
                limit: { type: "integer", description: "Max lines to read" },
                offset: { type: "integer", description: "Start line (0-indexed)" },
            },
            required: ["file_path"],
        },
        func: (p) => readFile(String(p.file_path), p.limit, p.offset),
        read_only: true,
        concurrent_safe: true,
    });
    registerTool({
        name: "Write",
        description: "Write content to a file, creating parent directories as needed.",
        input_schema: {
            type: "object",
            properties: {
                file_path: { type: "string" },
                content: { type: "string" },
            },
            required: ["file_path", "content"],
        },
        func: (p) => writeFile(String(p.file_path), String(p.content)),
        read_only: false,
        concurrent_safe: false,
    });
    registerTool({
        name: "Edit",
        description: "Replace exact text in a file. old_string must match exactly (including whitespace). If old_string appears multiple times, use replace_all=true or add more context.",
        input_schema: {
            type: "object",
            properties: {
                file_path: { type: "string" },
                old_string: { type: "string", description: "Exact text to replace" },
                new_string: { type: "string", description: "Replacement text" },
                replace_all: { type: "boolean", description: "Replace all occurrences" },
            },
            required: ["file_path", "old_string", "new_string"],
        },
        func: (p) => editFile(String(p.file_path), String(p.old_string), String(p.new_string), Boolean(p.replace_all)),
        read_only: false,
        concurrent_safe: false,
    });
    registerTool({
        name: "Glob",
        description: "Find files matching a glob pattern. Returns sorted list of matching paths.",
        input_schema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Glob pattern e.g. **/*.ts" },
                path: { type: "string", description: "Base directory (default: cwd)" },
            },
            required: ["pattern"],
        },
        func: (p) => globFiles(String(p.pattern), p.path),
        read_only: true,
        concurrent_safe: true,
    });
}
//# sourceMappingURL=fs.js.map