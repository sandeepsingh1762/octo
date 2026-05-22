const _registry = new Map();
export function registerTool(tool) {
    _registry.set(tool.name, tool);
}
export function getTool(name) {
    return _registry.get(name);
}
export function getAllTools() {
    return Array.from(_registry.values());
}
export function getToolSchemas() {
    return getAllTools().map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
    }));
}
export async function executeTool(name, params, config, maxOutput = 32000) {
    const tool = getTool(name);
    if (!tool)
        return `Error: tool '${name}' not found.`;
    try {
        let result = await tool.func(params, config);
        if (result.length > maxOutput) {
            const firstHalf = maxOutput / 2;
            const lastQuarter = maxOutput / 4;
            const truncated = result.length - firstHalf - lastQuarter;
            result = `${result.slice(0, firstHalf)}\n[... ${truncated} chars truncated ...]\n${result.slice(-lastQuarter)}`;
        }
        return result;
    }
    catch (e) {
        return `Error executing ${name}: ${e instanceof Error ? e.message : String(e)}`;
    }
}
//# sourceMappingURL=registry.js.map