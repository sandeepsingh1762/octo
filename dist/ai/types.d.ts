export interface TextChunk {
    type: "text";
    text: string;
}
export interface ThinkingChunk {
    type: "thinking";
    text: string;
}
export interface ToolCallChunk {
    type: "tool_call";
    id: string;
    name: string;
    input: Record<string, unknown>;
}
export interface TurnDone {
    type: "turn_done";
    text: string;
    tool_calls: ToolCall[];
    input_tokens: number;
    output_tokens: number;
}
export interface ToolCall {
    id: string;
    name: string;
    input: Record<string, unknown>;
}
export type StreamEvent = TextChunk | ThinkingChunk | ToolCallChunk | TurnDone;
export interface Message {
    role: "user" | "assistant" | "tool";
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
    images?: string[];
}
export interface ProviderConfig {
    apiKey: string;
    baseUrl?: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    thinking?: boolean;
    thinkingBudget?: number;
}
export interface ToolSchema {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
export declare abstract class BaseProvider {
    abstract stream(system: string, messages: Message[], tools: ToolSchema[], config: ProviderConfig): AsyncGenerator<StreamEvent>;
    abstract name(): string;
}
//# sourceMappingURL=types.d.ts.map