import { registerTool } from "./registry.js";
const _pendingQuestions = [];
export function getPendingQuestions() {
    return _pendingQuestions.splice(0, _pendingQuestions.length);
}
export function hasPendingQuestions() {
    return _pendingQuestions.length > 0;
}
export function askUserQuestion(question, options, allow_freetext = true) {
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
        description: "Pause execution and ask the user a clarifying question. Use this when you need a decision from the user before proceeding. Returns the user's answer as a string.",
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
        func: (p) => askUserQuestion(String(p.question), p.options, p.allow_freetext !== false),
        read_only: true,
        concurrent_safe: false,
    });
}
//# sourceMappingURL=interaction.js.map