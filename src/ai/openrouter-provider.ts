// OpenRouter Provider — SDK + free router (openrouter/free)
// https://openrouter.ai/openrouter/free/api

import { OpenRouter } from "@openrouter/sdk";
import type {
  BaseProvider,
  Message,
  ProviderConfig,
  StreamEvent,
  ToolCall,
  ToolSchema,
} from "./types.js";

function toolsToOpenRouter(tools: ToolSchema[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function messagesToOpenRouter(messages: Message[]) {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        toolCalls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        })),
      };
    }
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        toolCallId: m.tool_call_id!,
        content: m.content,
      };
    }
    return { role: m.role, content: m.content };
  });
}

export class OpenRouterProvider implements BaseProvider {
  name() {
    return "openrouter";
  }

  async *stream(
    system: string,
    messages: Message[],
    tools: ToolSchema[],
    config: ProviderConfig
  ): AsyncGenerator<StreamEvent> {
    if (!config.apiKey) {
      yield {
        type: "turn_done",
        text: "",
        tool_calls: [],
        input_tokens: 0,
        output_tokens: 0,
      };
      throw new Error(
        "OpenRouter API key missing. Use /login openrouter or set OPENROUTER_API_KEY."
      );
    }

    const client = new OpenRouter({ apiKey: config.apiKey });

    if (!config.model?.trim()) {
      throw new Error("No model configured. Use /model openrouter/free or set OCTOPUS_DEFAULT_MODEL.");
    }

    const model = config.model.includes("/")
      ? config.model
      : `openrouter/${config.model}`;

    const msgs = [
      { role: "system" as const, content: system },
      ...messagesToOpenRouter(messages),
    ];
    const toolList = tools.length > 0 ? toolsToOpenRouter(tools) : undefined;

    const stream = await client.chat.send({
      chatRequest: {
        model,
        messages: msgs,
        tools: toolList,
        toolChoice: toolList ? "auto" : undefined,
        maxTokens: config.maxTokens,
        temperature: config.temperature ?? 0.7,
        stream: true,
      },
    });

    const toolBuf = new Map<number, { id: string; name: string; args: string }>();
    let text = "";
    let inTokens = 0;
    let outTokens = 0;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta?.content) {
        text += delta.content;
        yield { type: "text", text: delta.content };
      } else if (delta?.reasoning) {
        yield { type: "thinking", text: delta.reasoning };
      }

      if (delta?.toolCalls) {
        for (const tc of delta.toolCalls) {
          const idx = tc.index ?? 0;
          if (!toolBuf.has(idx)) {
            toolBuf.set(idx, { id: "", name: "", args: "" });
          }
          const entry = toolBuf.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }

      if (chunk.usage) {
        inTokens = chunk.usage.promptTokens ?? 0;
        outTokens = chunk.usage.completionTokens ?? 0;
      }
    }

    const tool_calls: ToolCall[] = [];
    for (const [, v] of toolBuf) {
      try {
        const input = v.args ? (JSON.parse(v.args) as Record<string, unknown>) : {};
        tool_calls.push({ id: v.id || `call_${v.name}`, name: v.name, input });
      } catch {
        tool_calls.push({
          id: v.id || `call_${v.name}`,
          name: v.name,
          input: { _raw: v.args },
        });
      }
    }

    yield {
      type: "turn_done",
      text,
      tool_calls,
      input_tokens: inTokens,
      output_tokens: outTokens,
    };
  }
}

export default OpenRouterProvider;
