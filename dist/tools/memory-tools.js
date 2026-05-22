import { registerTool } from "./registry.js";
import * as memory from "../memory/store.js";
export function registerMemoryTools() {
    registerTool({
        name: "MemorySave",
        description: "Save a persistent memory entry (user or project scope).",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Short unique name" },
                description: { type: "string", description: "One-line description" },
                content: { type: "string", description: "Full memory content" },
                type: { type: "string", description: "user | feedback | project | reference" },
                scope: { type: "string", description: "user (global) or project (cwd-relative)" },
            },
            required: ["name", "description", "content"],
        },
        func: (p) => {
            const entry = {
                name: String(p.name),
                description: String(p.description),
                type: p.type || "user",
                content: String(p.content),
                created: new Date().toISOString().split("T")[0],
                scope: (p.scope === "project" ? "project" : "user"),
                file_path: "",
            };
            memory.saveMemory(entry, (p.scope === "project" ? "project" : "user"));
            return `Memory saved: ${String(p.name)}`;
        },
        read_only: false,
        concurrent_safe: false,
    });
    registerTool({
        name: "MemoryDelete",
        description: "Delete a persistent memory entry by name.",
        input_schema: {
            type: "object",
            properties: {
                name: { type: "string" },
                scope: { type: "string" },
            },
            required: ["name"],
        },
        func: (p) => {
            memory.deleteMemory(String(p.name), (p.scope === "project" ? "project" : "user"));
            return `Memory deleted: ${String(p.name)}`;
        },
        read_only: false,
        concurrent_safe: false,
    });
    registerTool({
        name: "MemorySearch",
        description: "Search memories by keyword.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string" },
                scope: { type: "string", description: "user | project | all" },
            },
            required: ["query"],
        },
        func: async (p) => {
            const results = await memory.searchMemory(String(p.query), (p.scope === "project" ? "project" : p.scope === "user" ? "user" : "all"));
            if (!results.length)
                return "No memories found.";
            return results.map((r) => `[${r.type}|${r.scope}] ${r.name}: ${r.description}\n${r.content.slice(0, 300)}`).join("\n\n");
        },
        read_only: true,
        concurrent_safe: true,
    });
    registerTool({
        name: "MemoryList",
        description: "List all memories with type, scope, age, and description.",
        input_schema: { type: "object", properties: { scope: { type: "string" } }, required: [] },
        func: async (p) => {
            const entries = await memory.loadEntries((p.scope === "project" ? "project" : p.scope === "user" ? "user" : "all"));
            if (!entries.length)
                return "No memories stored.";
            return entries.map((e) => `[${e.type}|${e.scope}] ${e.name}: ${e.description}`).join("\n");
        },
        read_only: true,
        concurrent_safe: true,
    });
}
//# sourceMappingURL=memory-tools.js.map