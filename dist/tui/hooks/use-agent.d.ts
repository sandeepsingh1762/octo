import type { Config } from "../../config/index.js";
export type MessageItem = {
    type: "user";
    text: string;
} | {
    type: "assistant";
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
    type: "error";
    text: string;
} | {
    type: "system";
    text: string;
};
interface UseAgentReturn {
    messages: MessageItem[];
    isStreaming: boolean;
    input: string;
    setInput: (s: string) => void;
    sendMessage: () => void;
    status: string;
    tokenInfo: string;
    model: string;
    promptLine: string | null;
    needsSetup: boolean;
}
export declare function useAgent(config: Config): UseAgentReturn;
export {};
//# sourceMappingURL=use-agent.d.ts.map