import { estimateMessagesTokens } from "../utils/token-estimate.js";
import { PROVIDERS, detectProvider } from "../ai/registry.js";
export function getContextLimit(model) {
    const pname = detectProvider(model);
    return PROVIDERS[pname]?.contextLimit || 128000;
}
export function snipOldToolResults(messages, maxChars = 2000, preserveLastNTurns = 6) {
    const cutoff = Math.max(0, messages.length - preserveLastNTurns);
    for (let i = 0; i < cutoff; i++) {
        const m = messages[i];
        if (m.role === "tool" && typeof m.content === "string" && m.content.length > maxChars) {
            const half = Math.floor(maxChars / 2);
            const quarter = Math.floor(maxChars / 4);
            const snipped = m.content.length - half - quarter;
            m.content = `${m.content.slice(0, half)}\n[... ${snipped} chars snipped ...]\n${m.content.slice(-quarter)}`;
        }
    }
}
export function findSplitPoint(messages, keepRatio = 0.3) {
    const total = estimateMessagesTokens(messages);
    const target = Math.floor(total * keepRatio);
    let running = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
        running += estimateMessagesTokens([messages[i]]);
        if (running >= target)
            return i;
    }
    return 0;
}
export function compactMessages(messages, model) {
    const split = findSplitPoint(messages);
    if (split <= 0)
        return messages;
    const old = messages.slice(0, split);
    const recent = messages.slice(split);
    const oldText = old
        .map((m) => `[${m.role}]: ${typeof m.content === "string" ? m.content.slice(0, 500) : ""}`)
        .join("\n");
    const summaryMsg = {
        role: "user",
        content: `[Previous conversation summary]\n${oldText}\n\nThe above is a summary of the earlier conversation. Please continue based on recent context.`,
    };
    const ack = {
        role: "assistant",
        content: "Understood. I have the context from the previous conversation. Let's continue.",
    };
    return [summaryMsg, ack, ...recent];
}
export function maybeCompact(messages, model) {
    const limit = getContextLimit(model);
    const threshold = limit * 0.7;
    const tok = estimateMessagesTokens(messages);
    if (tok <= threshold)
        return false;
    snipOldToolResults(messages);
    if (estimateMessagesTokens(messages) <= threshold)
        return true;
    const newMessages = compactMessages(messages, model);
    messages.length = 0;
    messages.push(...newMessages);
    return true;
}
//# sourceMappingURL=compaction.js.map