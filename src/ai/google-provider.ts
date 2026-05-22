import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  BaseProvider,
  Message,
  ProviderConfig,
  StreamEvent,
  ToolCall,
  ToolSchema,
} from "./types.js";

function toolsToGoogle(tools: ToolSchema[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: "object" as const,
      properties: t.input_schema.properties ?? {},
      required: (t.input_schema.required as string[]) ?? [],
    },
  }));
}

function messagesToGoogle(messages: Message[]) {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls) {
      const parts: Array<{ text: string } | { functionCall: { name: string; args: Record<string, unknown> } }> = [
        { text: m.content || "" },
      ];
      for (const tc of m.tool_calls) {
        parts.push({ functionCall: { name: tc.name, args: tc.input } });
      }
      return { role: "model" as const, parts };
    }
    if (m.role === "tool") {
      return {
        role: "user" as const,
        parts: [
          {
            functionResponse: {
              name: m.name!,
              response: { result: m.content },
            },
          },
        ],
      };
    }
    return { role: m.role === "user" ? ("user" as const) : ("model" as const), parts: [{ text: m.content }] };
  });
}

export class GoogleProvider implements BaseProvider {
  name() {
    return "google";
  }

  async *stream(
    system: string,
    messages: Message[],
    tools: ToolSchema[],
    config: ProviderConfig
  ): AsyncGenerator<StreamEvent> {
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({ model: config.model });

    const chat = model.startChat({
      history: messagesToGoogle(messages),
      systemInstruction: system,
    });

    const toolList = tools.length > 0 ? toolsToGoogle(tools) : undefined;
    const lastUserContent = messages.length > 0 && messages[messages.length - 1].role === "user"
      ? messages[messages.length - 1].content
      : "";
    const result = await chat.sendMessageStream(lastUserContent);

    let text = "";
    for await (const chunk of result.stream) {
      const txt = chunk.text();
      if (txt) {
        text += txt;
        yield { type: "text", text: txt };
      }
    }

    const tool_calls: ToolCall[] = [];
    const resp = await result.response;
    if (resp.candidates) {
      for (const cand of resp.candidates) {
        for (const part of cand.content?.parts ?? []) {
          if ("functionCall" in part && part.functionCall) {
            tool_calls.push({
              id: `call_${part.functionCall.name}`,
              name: part.functionCall.name,
              input: part.functionCall.args as Record<string, unknown>,
            });
          }
        }
      }
    }

    yield {
      type: "turn_done",
      text,
      tool_calls,
      input_tokens: resp.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: resp.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
