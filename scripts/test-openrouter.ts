/**
 * Smoke test: OpenRouter free router via @openrouter/sdk
 * Usage: OPENROUTER_API_KEY=sk-... npx tsx scripts/test-openrouter.ts
 */

import { OpenRouter } from "@openrouter/sdk";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY");
  process.exit(1);
}

const client = new OpenRouter({ apiKey });

console.log("Testing openrouter/free ...\n");

const stream = await client.chat.send({
  chatRequest: {
    model: "openrouter/free",
    messages: [
      {
        role: "user",
        content: "How many r's are in the word 'strawberry'? Reply in one short sentence.",
      },
    ],
    stream: true,
    maxTokens: 256,
  },
});

let response = "";
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  const content = delta?.content;
  const reasoning = delta?.reasoning;
  if (content) {
    response += content;
    process.stdout.write(content);
  } else if (reasoning) {
    process.stdout.write(`[thinking] ${reasoning}`);
  }
  if (chunk.usage) {
    console.log(
      "\n\nUsage:",
      JSON.stringify({
        prompt: chunk.usage.promptTokens,
        completion: chunk.usage.completionTokens,
        reasoning: (chunk.usage as { reasoningTokens?: number }).reasoningTokens,
      })
    );
  }
}

console.log("\n\nOK — total chars:", response.length);
