import Anthropic from "@anthropic-ai/sdk";
import type {
  BaseProvider,
  Message,
  ProviderConfig,
  StreamEvent,
  ToolCall,
  ToolSchema,
} from "./types.js";

function toolsToAnthropic(tools: ToolSchema[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));
}

function messagesToAnthropic(messages: Message[]) {
  const result: Anthropic.MessageParam[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.role === "user") {
      result.push({ role: "user", content: m.content });
      i++;
    } else if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) {
        blocks.push({ type: "text", text: m.content });
      }
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input as Record<string, unknown>,
          });
        }
      }
      result.push({ role: "assistant", content: blocks });
      i++;
    } else if (m.role === "tool") {
      const toolBlocks: Anthropic.ContentBlockParam[] = [];
      while (i < messages.length && messages[i].role === "tool") {
        const t = messages[i];
        toolBlocks.push({
          type: "tool_result",
          tool_use_id: t.tool_call_id!,
          content: t.content,
        });
        i++;
      }
      result.push({ role: "user", content: toolBlocks });
    } else {
      i++;
    }
  }
  return result;
}

export class AnthropicProvider implements BaseProvider {
  name() {
    return "anthropic";
  }

  async *stream(
    system: string,
    messages: Message[],
    tools: ToolSchema[],
    config: ProviderConfig
  ): AsyncGenerator<StreamEvent> {
    const client = new Anthropic({ apiKey: config.apiKey });
    const kwargs: Anthropic.MessageStreamParams = {
      model: config.model,
      max_tokens: config.maxTokens ?? 8192,
      system,
      messages: messagesToAnthropic(messages),
      tools: tools.length > 0 ? toolsToAnthropic(tools) : undefined,
    };
    if (config.thinking) {
      (kwargs as Record<string, unknown>).thinking = {
        type: "enabled",
        budget_tokens: config.thinkingBudget ?? 10000,
      };
    }

    const tool_calls: ToolCall[] = [];
    let text = "";

    const stream = client.messages.stream(kwargs);
    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          text += delta.text;
          yield { type: "text", text: delta.text };
        } else if (delta.type === "thinking_delta") {
          yield { type: "thinking", text: delta.thinking };
        }
      }
    }

    const final = await stream.finalMessage();
    for (const block of final.content) {
      if (block.type === "tool_use") {
        tool_calls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
      }
    }

    yield {
      type: "turn_done",
      text,
      tool_calls,
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
    };
  }
}
