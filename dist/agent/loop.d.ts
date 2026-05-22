import type { Config } from "../config/index.js";
import { AgentState } from "./state.js";
export { AgentState } from "./state.js";
export type AgentEvent = {
    type: "text";
    text: string;
} | {
    type: "thinking";
    text: string;
} | {
    type: "tool_start";
    name: string;
    inputs: Record<string, unknown>;
} | {
    type: "tool_end";
    name: string;
    result: string;
    permitted: boolean;
} | {
    type: "turn_done";
    input_tokens: number;
    output_tokens: number;
} | {
    type: "permission_request";
    description: string;
} | {
    type: "done";
} | {
    type: "error";
    message: string;
};
export interface PermissionResponse {
    granted: boolean;
}
export declare function runAgent(userMessage: string, state: AgentState, config: Config, systemPrompt: string): AsyncGenerator<AgentEvent>;
//# sourceMappingURL=loop.d.ts.map