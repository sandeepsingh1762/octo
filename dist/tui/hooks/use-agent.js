import { useState, useCallback, useRef, useEffect } from "react";
import { runAgent } from "../../agent/loop.js";
import { AgentState } from "../../agent/state.js";
import { buildSystemPrompt } from "../../agent/system.js";
export function useAgent(config) {
    const [messages, setMessages] = useState([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [input, setInput] = useState("");
    const [status, setStatus] = useState("Ready");
    const [tokenInfo, setTokenInfo] = useState("");
    const stateRef = useRef(new AgentState());
    const systemRef = useRef("");
    const messagesRef = useRef([]);
    useEffect(() => {
        buildSystemPrompt().then((p) => {
            systemRef.current = p;
        });
    }, []);
    const sendMessage = useCallback(() => {
        const text = input.trim();
        if (!text || isStreaming)
            return;
        setInput("");
        setMessages((prev) => {
            const next = [...prev, { type: "user", text }];
            messagesRef.current = next;
            return next;
        });
        setIsStreaming(true);
        setStatus("Thinking...");
        const state = stateRef.current;
        (async () => {
            try {
                const gen = runAgent(text, state, config, systemRef.current);
                let assistantText = "";
                for await (const ev of gen) {
                    setMessages((prev) => {
                        const next = [...prev];
                        if (ev.type === "text") {
                            assistantText += ev.text;
                            // Update or append assistant message
                            const last = next[next.length - 1];
                            if (last && last.type === "assistant") {
                                next[next.length - 1] = { type: "assistant", text: assistantText };
                            }
                            else {
                                next.push({ type: "assistant", text: assistantText });
                            }
                        }
                        else if (ev.type === "thinking") {
                            next.push({ type: "thinking", text: ev.text });
                        }
                        else if (ev.type === "tool_start") {
                            next.push({ type: "tool_start", name: ev.name, inputs: ev.inputs });
                        }
                        else if (ev.type === "tool_end") {
                            next.push({ type: "tool_end", name: ev.name, result: ev.result, permitted: ev.permitted });
                        }
                        else if (ev.type === "error") {
                            next.push({ type: "error", text: ev.message });
                        }
                        else if (ev.type === "turn_done") {
                            setTokenInfo(`Tokens: ${state.total_input_tokens}/${state.total_output_tokens}`);
                            assistantText = "";
                        }
                        else if (ev.type === "done") {
                            setStatus("Ready");
                        }
                        messagesRef.current = next;
                        return next;
                    });
                }
            }
            catch (e) {
                setMessages((prev) => [...prev, { type: "error", text: e instanceof Error ? e.message : String(e) }]);
            }
            finally {
                setIsStreaming(false);
                setStatus("Ready");
            }
        })();
    }, [input, isStreaming, config]);
    return { messages, isStreaming, input, setInput, sendMessage, status, tokenInfo };
}
//# sourceMappingURL=use-agent.js.map