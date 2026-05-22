import { getProvider, buildProviderConfig, initializeKeyManager } from "../ai/registry.js";
import { getToolSchemas, executeTool } from "../tools/registry.js";
import { maybeCompact } from "../context/compaction.js";
export { AgentState } from "./state.js";
import { isSafeBash } from "../tools/shell.js";
import { isModelConfigured } from "../config/defaults.js";
function checkPermission(tc, config) {
    const mode = config.permission_mode;
    if (mode === "accept-all")
        return { permitted: true };
    if (mode === "manual")
        return { permitted: false, description: `${tc.name}(${JSON.stringify(tc.input).slice(0, 80)})` };
    // auto mode
    const safeReads = ["Read", "Glob", "Grep", "WebFetch", "WebSearch", "CodebaseSearch", "GetDiagnostics", "MemorySearch", "MemoryList", "TaskList", "RegexExtract", "BrowserOpen", "BrowserClick"];
    if (safeReads.includes(tc.name))
        return { permitted: true };
    if (tc.name === "Bash") {
        const cmd = String(tc.input.command || "");
        if (isSafeBash(cmd))
            return { permitted: true };
        return { permitted: false, description: `Run: ${cmd}` };
    }
    if (tc.name === "Write" || tc.name === "Edit" || tc.name === "MemorySave" || tc.name === "MemoryDelete" || tc.name === "RegexReplace") {
        return { permitted: false, description: `${tc.name}: ${JSON.stringify(tc.input).slice(0, 80)}` };
    }
    return { permitted: true };
}
let keyManagerReady = false;
export async function* runAgent(userMessage, state, config, systemPrompt) {
    if (!keyManagerReady) {
        await initializeKeyManager();
        keyManagerReady = true;
    }
    try {
        if (!isModelConfigured(config.model)) {
            yield {
                type: "error",
                message: "No model configured. Run /login then /model <provider/model> (e.g. /model openrouter/free).",
            };
            return;
        }
        const msg = { role: "user", content: userMessage };
        state.messages.push(msg);
        while (!state.cancelled) {
            state.turn_count++;
            maybeCompact(state.messages, config.model);
            const provider = getProvider(config.model);
            const pConfig = await buildProviderConfig(config.model, {
                maxTokens: config.max_tokens,
                temperature: 0.7,
                thinking: config.thinking,
                thinkingBudget: config.thinking_budget,
            });
            let turnText = "";
            let turnToolCalls = [];
            let inTokens = 0;
            let outTokens = 0;
            const stream = provider.stream(systemPrompt, state.messages, getToolSchemas(), pConfig);
            for await (const ev of stream) {
                if (state.cancelled)
                    return;
                if (ev.type === "text") {
                    turnText += ev.text;
                    yield { type: "text", text: ev.text };
                }
                else if (ev.type === "thinking") {
                    yield { type: "thinking", text: ev.text };
                }
                if (ev.type === "turn_done") {
                    turnToolCalls = ev.tool_calls;
                    inTokens = ev.input_tokens;
                    outTokens = ev.output_tokens;
                }
            }
            state.messages.push({
                role: "assistant",
                content: turnText,
                tool_calls: turnToolCalls.length > 0 ? turnToolCalls : undefined,
            });
            state.total_input_tokens += inTokens;
            state.total_output_tokens += outTokens;
            yield { type: "turn_done", input_tokens: inTokens, output_tokens: outTokens };
            if (!turnToolCalls.length) {
                yield { type: "done" };
                return;
            }
            for (const tc of turnToolCalls) {
                if (state.cancelled)
                    return;
                yield { type: "tool_start", name: tc.name, inputs: tc.input };
                const perm = checkPermission(tc, config);
                if (!perm.permitted) {
                    const resp = { granted: false };
                    yield { type: "permission_request", description: perm.description || `${tc.name}(${JSON.stringify(tc.input).slice(0, 80)})` };
                    // In headless/TUI mode, we'll need a way to get response. For now assume denied.
                    const result = "Denied: permission required for this operation";
                    yield { type: "tool_end", name: tc.name, result, permitted: false };
                    state.messages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        name: tc.name,
                        content: result,
                    });
                    continue;
                }
                const result = await executeTool(tc.name, tc.input, { model: config.model }, config.max_tool_output);
                yield { type: "tool_end", name: tc.name, result, permitted: true };
                state.messages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    name: tc.name,
                    content: result,
                });
            }
        }
    }
    catch (e) {
        yield { type: "error", message: e instanceof Error ? e.message : String(e) };
    }
}
//# sourceMappingURL=loop.js.map