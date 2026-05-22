export function estimateTokens(content: string | unknown): number {
  if (typeof content === "string") {
    return Math.ceil(content.length / 3.5);
  }
  if (Array.isArray(content)) {
    return content.reduce((sum, item) => sum + estimateTokens(item), 0);
  }
  if (typeof content === "object" && content !== null) {
    return estimateTokens(JSON.stringify(content));
  }
  return 0;
}

export function estimateMessagesTokens(messages: Array<Record<string, unknown>>): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content);
    const tcs = m.tool_calls as Array<Record<string, unknown>> | undefined;
    if (tcs) {
      for (const tc of tcs) {
        total += estimateTokens(tc);
      }
    }
  }
  return total;
}
