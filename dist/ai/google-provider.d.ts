import type { BaseProvider, Message, ProviderConfig, StreamEvent, ToolSchema } from "./types.js";
export declare class GoogleProvider implements BaseProvider {
    name(): string;
    stream(system: string, messages: Message[], tools: ToolSchema[], config: ProviderConfig): AsyncGenerator<StreamEvent>;
}
//# sourceMappingURL=google-provider.d.ts.map