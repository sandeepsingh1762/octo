import OpenAI from "openai";
function toolsToOpenAI(tools) {
    return tools.map((t) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
        },
    }));
}
function messagesToOpenAI(messages) {
    return messages.map((m) => {
        if (m.role === "assistant" && m.tool_calls) {
            return {
                role: "assistant",
                content: m.content || null,
                tool_calls: m.tool_calls.map((tc) => ({
                    id: tc.id,
                    type: "function",
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.input),
                    },
                })),
            };
        }
        if (m.role === "tool") {
            return {
                role: "tool",
                tool_call_id: m.tool_call_id,
                content: m.content,
            };
        }
        return { role: m.role, content: m.content };
    });
}
export class OpenAIProvider {
    name() {
        return "openai";
    }
    async *stream(system, messages, tools, config) {
        const client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
        });
        const msgs = [{ role: "system", content: system }, ...messagesToOpenAI(messages)];
        const toolList = tools.length > 0 ? toolsToOpenAI(tools) : undefined;
        const stream = client.beta.chat.completions.stream({
            model: config.model,
            messages: msgs,
            tools: toolList,
            tool_choice: toolList ? "auto" : undefined,
            max_tokens: config.maxTokens,
            temperature: config.temperature ?? 0.7,
            top_p: config.topP ?? 1,
        });
        const toolBuf = new Map();
        let text = "";
        for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice)
                continue;
            const delta = choice.delta;
            if (delta.content) {
                text += delta.content;
                yield { type: "text", text: delta.content };
            }
            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolBuf.has(idx)) {
                        toolBuf.set(idx, { id: "", name: "", args: "" });
                    }
                    const entry = toolBuf.get(idx);
                    if (tc.id)
                        entry.id = tc.id;
                    if (tc.function?.name)
                        entry.name += tc.function.name;
                    if (tc.function?.arguments)
                        entry.args += tc.function.arguments;
                }
            }
        }
        const completion = await stream.finalChatCompletion();
        const usage = completion.usage;
        const tool_calls = [];
        for (const [, v] of toolBuf) {
            try {
                const input = v.args ? JSON.parse(v.args) : {};
                tool_calls.push({ id: v.id || `call_${v.name}`, name: v.name, input });
            }
            catch {
                tool_calls.push({ id: v.id || `call_${v.name}`, name: v.name, input: { _raw: v.args } });
            }
        }
        yield {
            type: "turn_done",
            text,
            tool_calls,
            input_tokens: usage?.prompt_tokens ?? 0,
            output_tokens: usage?.completion_tokens ?? 0,
        };
    }
}
//# sourceMappingURL=openai-provider.js.map