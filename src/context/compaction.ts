import { estimateMessagesTokens } from "../utils/token-estimate.js";
import type { Message } from "../ai/types.js";
import { getProvider, PROVIDERS, detectProvider } from "../ai/registry.js";

export function getContextLimit(model: string): number {
  const pname = detectProvider(model);
  return PROVIDERS[pname]?.contextLimit || 128000;
}

export function snipOldToolResults(messages: Message[], maxChars = 2000, preserveLastNTurns = 6) {
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

export function findSplitPoint(messages: Message[], keepRatio = 0.3): number {
  const total = estimateMessagesTokens(messages as unknown as Array<Record<string, unknown>>);
  const target = Math.floor(total * keepRatio);
  let running = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    running += estimateMessagesTokens([messages[i]! as unknown as Record<string, unknown>]);
    if (running >= target) return i;
  }
  return 0;
}

export function compactMessages(messages: Message[], model: string): Message[] {
  const split = findSplitPoint(messages);
  if (split <= 0) return messages;
  const old = messages.slice(0, split);
  const recent = messages.slice(split);

  const oldText = old
    .map((m) => `[${m.role}]: ${typeof m.content === "string" ? m.content.slice(0, 500) : ""}`)
    .join("\n");

  const summaryMsg: Message = {
    role: "user",
    content: `[Previous conversation summary]\n${oldText}\n\nThe above is a summary of the earlier conversation. Please continue based on recent context.`,
  };
  const ack: Message = {
    role: "assistant",
    content: "Understood. I have the context from the previous conversation. Let's continue.",
  };
  return [summaryMsg, ack, ...recent];
}

export function maybeCompact(messages: Message[], model: string): boolean {
  const limit = getContextLimit(model);
  const threshold = limit * 0.7;
  const tok = estimateMessagesTokens(messages as unknown as Array<Record<string, unknown>>);
  if (tok <= threshold) return false;
  snipOldToolResults(messages);
  if (estimateMessagesTokens(messages as unknown as Array<Record<string, unknown>>) <= threshold) return true;
  const newMessages = compactMessages(messages, model);
  messages.length = 0;
  messages.push(...newMessages);
  return true;
}
