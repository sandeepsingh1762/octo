import type { BaseProvider, Message, ProviderConfig, StreamEvent, ToolSchema } from "./types.js";
export declare class OpenAIProvider implements BaseProvider {
    name(): string;
    stream(system: string, messages: Message[], tools: ToolSchema[], config: ProviderConfig): AsyncGenerator<StreamEvent>;
}
//# sourceMappingURL=openai-provider.d.ts.map