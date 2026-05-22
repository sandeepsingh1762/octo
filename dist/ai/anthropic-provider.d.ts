import type { BaseProvider, Message, ProviderConfig, StreamEvent, ToolSchema } from "./types.js";
export declare class AnthropicProvider implements BaseProvider {
    name(): string;
    stream(system: string, messages: Message[], tools: ToolSchema[], config: ProviderConfig): AsyncGenerator<StreamEvent>;
}
//# sourceMappingURL=anthropic-provider.d.ts.map