import { registerTool } from "./registry.js";

const _pendingQuestions: Array<{
  id: string;
  question: string;
  options?: Array<{ label: string; description?: string }>;
  allow_freetext: boolean;
  resolve: (value: string) => void;
}> = [];

export function getPendingQuestions() {
  return _pendingQuestions.splice(0, _pendingQuestions.length);
}

export function hasPendingQuestions(): boolean {
  return _pendingQuestions.length > 0;
}

export function askUserQuestion(
  question: string,
  options?: Array<{ label: string; description?: string }>,
  allow_freetext = true
): Promise<string> {
  return new Promise((resolve) => {
    _pendingQuestions.push({
      id: Math.random().toString(36).slice(2),
      question,
      options,
      allow_freetext,
      resolve,
    });
  });
}

export function registerInteractionTools() {
  registerTool({
    name: "AskUserQuestion",
    description:
      "Pause execution and ask the user a clarifying question. Use this when you need a decision from the user before proceeding. Returns the user's answer as a string.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, description: { type: "string" } },
            required: ["label"],
          },
        },
        allow_freetext: { type: "boolean" },
      },
      required: ["question"],
    },
    func: (p) =>
      askUserQuestion(
        String(p.question),
        p.options as Array<{ label: string; description?: string }> | undefined,
        p.allow_freetext !== false
      ),
    read_only: true,
    concurrent_safe: false,
  });
}
