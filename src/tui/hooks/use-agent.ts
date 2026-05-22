import { useState, useCallback, useRef, useEffect } from "react";
import { runAgent, type AgentEvent } from "../../agent/loop.js";
import { AgentState } from "../../agent/state.js";
import type { Config } from "../../config/index.js";
import { buildSystemPrompt } from "../../agent/system.js";
import { CommandExecutor } from "../../commands/executor.js";
import { getSetupHint, isModelConfigured } from "../../config/defaults.js";
import { isReadyToChat } from "../../setup/check.js";
import { saveConfig } from "../../config/index.js";

export type MessageItem =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; name: string; inputs: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: string; permitted: boolean }
  | { type: "error"; text: string }
  | { type: "system"; text: string };

interface UseAgentReturn {
  messages: MessageItem[];
  isStreaming: boolean;
  input: string;
  setInput: (s: string) => void;
  sendMessage: () => void;
  status: string;
  tokenInfo: string;
  model: string;
  promptLine: string | null;
  needsSetup: boolean;
}

export function useAgent(config: Config): UseAgentReturn {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [tokenInfo, setTokenInfo] = useState("");
  const [currentModel, setCurrentModel] = useState(config.model);
  const [promptLine, setPromptLine] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(!isModelConfigured(config.model));
  const [activeConfig, setActiveConfig] = useState(config);

  const stateRef = useRef(new AgentState());
  const systemRef = useRef("");
  const promptResolverRef = useRef<((value: string) => void) | null>(null);
  const executorRef = useRef<CommandExecutor | null>(null);
  const setupShownRef = useRef(false);

  const waitForPrompt = useCallback((prompt: string): Promise<string> => {
    setPromptLine(prompt);
    return new Promise((resolve) => {
      promptResolverRef.current = (value: string) => {
        setPromptLine(null);
        promptResolverRef.current = null;
        resolve(value);
      };
    });
  }, []);

  useEffect(() => {
    buildSystemPrompt().then((p) => {
      systemRef.current = p;
    });

    const executor = new CommandExecutor({
      onOutput: (text) => {
        setMessages((prev) => [...prev, { type: "system", text }]);
      },
      onError: (text) => {
        setMessages((prev) => [...prev, { type: "error", text }]);
      },
      onInput: waitForPrompt,
      onSelect: async (options, prompt) => {
        setMessages((prev) => [
          ...prev,
          { type: "system", text: `${prompt}\n${options.map((o, i) => `  ${i + 1}. ${o.label}`).join("\n")}` },
        ]);
        const answer = await waitForPrompt("Enter number:");
        const idx = parseInt(answer, 10) - 1;
        if (idx >= 0 && idx < options.length) return options[idx]!.value;
        return options[0]!.value;
      },
    });

    executor.initialize().then(async () => {
      executorRef.current = executor;
      const m = executor.getSettings().get("model") || config.model;
      if (m) {
        setCurrentModel(m);
        setActiveConfig((c) => ({ ...c, model: m }));
      }
      const { ready, missing } = await isReadyToChat({ ...config, model: m || config.model });
      setNeedsSetup(!ready);
      if (!setupShownRef.current && !ready) {
        setupShownRef.current = true;
        setMessages([
          {
            type: "system",
            text:
              getSetupHint() +
              (missing.includes("api_key") ? "\n\n⚠ No API key found — type /login" : "") +
              (missing.includes("model") ? "\n\n⚠ No model — type /model <id>" : ""),
          },
        ]);
      }
    });
  }, [config, waitForPrompt]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Interactive prompt mode (for /login etc.)
    if (promptResolverRef.current) {
      setInput("");
      promptResolverRef.current(text);
      return;
    }

    setInput("");

    if (text.startsWith("/")) {
      setMessages((prev) => [...prev, { type: "user", text }]);

      (async () => {
        const executor = executorRef.current;
        if (!executor) {
          setMessages((prev) => [...prev, { type: "error", text: "Command system not initialized" }]);
          return;
        }

        setStatus("Running command...");
        try {
          const result = await executor.execute(text);

          if (result.success) {
            setMessages((prev) => [...prev, { type: "system", text: result.message }]);

            const data = result.data as { model?: string } | undefined;
            if (data?.model) {
              setCurrentModel(data.model);
              setActiveConfig((c) => ({ ...c, model: data.model! }));
              await saveConfig({ ...activeConfig, model: data.model });
              setNeedsSetup(false);
            } else if (text.startsWith("/model")) {
              const m = executor.getSettings().get("model");
              if (m) {
                setCurrentModel(m);
                setActiveConfig((c) => ({ ...c, model: m }));
                await saveConfig({ ...activeConfig, model: m });
                setNeedsSetup(false);
              }
            } else if (text.startsWith("/login")) {
              const { ready } = await isReadyToChat(activeConfig);
              setNeedsSetup(!ready);
            } else if (text.startsWith("/new")) {
              stateRef.current = new AgentState();
              setMessages([{ type: "system", text: "Started new session" }]);
            } else if (text.startsWith("/clear")) {
              setMessages([]);
            }
          } else {
            setMessages((prev) => [...prev, { type: "error", text: result.message }]);
          }
        } catch (e) {
          setMessages((prev) => [
            ...prev,
            { type: "error", text: e instanceof Error ? e.message : String(e) },
          ]);
        } finally {
          setStatus("Ready");
        }
      })();

      return;
    }

    (async () => {
      const cfg = { ...activeConfig, model: currentModel };
      const { ready, missing } = await isReadyToChat(cfg);
      if (!ready) {
        setMessages((prev) => [
          ...prev,
          { type: "user", text },
          {
            type: "error",
            text: `Setup required: ${missing.join(", ")}. Type /login then /model <id>`,
          },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { type: "user", text }]);
      setIsStreaming(true);
      setStatus("Thinking...");

      const state = stateRef.current;

      try {
        const gen = runAgent(text, state, cfg, systemRef.current);
        let assistantText = "";
        for await (const ev of gen) {
          if (ev.type === "text") {
            assistantText += ev.text;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.type === "assistant") {
                next[next.length - 1] = { type: "assistant", text: assistantText };
              } else {
                next.push({ type: "assistant", text: assistantText });
              }
              return next;
            });
          } else if (ev.type === "thinking") {
            setMessages((prev) => [...prev, { type: "thinking", text: ev.text }]);
          } else if (ev.type === "tool_start") {
            setMessages((prev) => [
              ...prev,
              { type: "tool_start", name: ev.name, inputs: ev.inputs },
            ]);
          } else if (ev.type === "tool_end") {
            setMessages((prev) => [
              ...prev,
              { type: "tool_end", name: ev.name, result: ev.result, permitted: ev.permitted },
            ]);
          } else if (ev.type === "error") {
            setMessages((prev) => [...prev, { type: "error", text: ev.message }]);
          } else if (ev.type === "turn_done") {
            setTokenInfo(`Tokens: ${state.total_input_tokens}/${state.total_output_tokens}`);
            assistantText = "";
          } else if (ev.type === "done") {
            setStatus("Ready");
          }
        }
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { type: "error", text: e instanceof Error ? e.message : String(e) },
        ]);
      } finally {
        setIsStreaming(false);
        setStatus("Ready");
      }
    })();
  }, [input, isStreaming, activeConfig, currentModel]);

  return {
    messages,
    isStreaming,
    input,
    setInput,
    sendMessage,
    status,
    tokenInfo,
    model: currentModel || "(not set)",
    promptLine,
    needsSetup,
  };
}
