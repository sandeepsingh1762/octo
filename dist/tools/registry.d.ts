import type { ToolDef } from "./types.js";
export declare function registerTool(tool: ToolDef): void;
export declare function getTool(name: string): ToolDef | undefined;
export declare function getAllTools(): ToolDef[];
export declare function getToolSchemas(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}>;
export declare function executeTool(name: string, params: Record<string, unknown>, config: Record<string, unknown>, maxOutput?: number): Promise<string>;
//# sourceMappingURL=registry.d.ts.map