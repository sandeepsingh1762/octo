import type { ToolDef } from "./types.js";

const _registry: Map<string, ToolDef> = new Map();

export function registerTool(tool: ToolDef): void {
  _registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDef | undefined {
  return _registry.get(name);
}

export function getAllTools(): ToolDef[] {
  return Array.from(_registry.values());
}

export function getToolSchemas(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return getAllTools().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  config: Record<string, unknown>,
  maxOutput = 32000
): Promise<string> {
  const tool = getTool(name);
  if (!tool) return `Error: tool '${name}' not found.`;
  try {
    let result = await tool.func(params, config);
    if (result.length > maxOutput) {
      const firstHalf = maxOutput / 2;
      const lastQuarter = maxOutput / 4;
      const truncated = result.length - firstHalf - lastQuarter;
      result = `${result.slice(0, firstHalf)}\n[... ${truncated} chars truncated ...]\n${result.slice(-lastQuarter)}`;
    }
    return result;
  } catch (e) {
    return `Error executing ${name}: ${e instanceof Error ? e.message : String(e)}`;
  }
}
