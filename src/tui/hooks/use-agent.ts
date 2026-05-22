import { useState, useCallback, useRef, useEffect } from "react";
import { runAgent, type AgentEvent } from "../../agent/loop.js";
import { AgentState } from "../../agent/state.js";
import type { Config } from "../../config/index.js";
import { buildSystemPrompt } from "../../agent/system.js";

export type MessageItem =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; name: string; inputs: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: string; permitted: boolean }
  | { type: "error"; text: string };

interface UseAgentReturn {
  messages: MessageItem[];
  isStreaming: boolean;
  input: string;
  setInput: (s: string) => void;
  sendMessage: () => void;
  status: string;
  tokenInfo: string;
}

export function useAgent(config: Config): UseAgentReturn {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [tokenInfo, setTokenInfo] = useState("");
  const stateRef = useRef(new AgentState());
  const systemRef = useRef("");
  const messagesRef = useRef<MessageItem[]>([]);

  useEffect(() => {
    buildSystemPrompt().then((p) => {
      systemRef.current = p;
    });
  }, []);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    setMessages((prev) => {
      const next = [...prev, { type: "user" as const, text }];
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
              } else {
                next.push({ type: "assistant", text: assistantText });
              }
            } else if (ev.type === "thinking") {
              next.push({ type: "thinking", text: ev.text });
            } else if (ev.type === "tool_start") {
              next.push({ type: "tool_start", name: ev.name, inputs: ev.inputs });
            } else if (ev.type === "tool_end") {
              next.push({ type: "tool_end", name: ev.name, result: ev.result, permitted: ev.permitted });
            } else if (ev.type === "error") {
              next.push({ type: "error", text: ev.message });
            } else if (ev.type === "turn_done") {
              setTokenInfo(`Tokens: ${state.total_input_tokens}/${state.total_output_tokens}`);
              assistantText = "";
            } else if (ev.type === "done") {
              setStatus("Ready");
            }
            messagesRef.current = next;
            return next;
          });
        }
      } catch (e) {
        setMessages((prev) => [...prev, { type: "error", text: e instanceof Error ? e.message : String(e) }]);
      } finally {
        setIsStreaming(false);
        setStatus("Ready");
      }
    })();
  }, [input, isStreaming, config]);

  return { messages, isStreaming, input, setInput, sendMessage, status, tokenInfo };
}
