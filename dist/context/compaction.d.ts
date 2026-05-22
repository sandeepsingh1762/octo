import type { Message } from "../ai/types.js";
export declare function getContextLimit(model: string): number;
export declare function snipOldToolResults(messages: Message[], maxChars?: number, preserveLastNTurns?: number): void;
export declare function findSplitPoint(messages: Message[], keepRatio?: number): number;
export declare function compactMessages(messages: Message[], model: string): Message[];
export declare function maybeCompact(messages: Message[], model: string): boolean;
//# sourceMappingURL=compaction.d.ts.map