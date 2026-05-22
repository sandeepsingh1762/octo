import { registerAllTools } from "./tools/index.js";
import { loadConfig } from "./config/index.js";
import { AgentState, runAgent } from "./agent/loop.js";
import { buildSystemPrompt } from "./agent/system.js";
async function main() {
    registerAllTools();
    const config = await loadConfig();
    const prompt = process.argv.slice(2).join(" ");
    if (!prompt) {
        console.log("Usage: octopus <prompt>");
        console.log("Or run the TUI: octopus-tui");
        process.exit(1);
    }
    const system = await buildSystemPrompt();
    const state = new AgentState();
    const gen = runAgent(prompt, state, config, system);
    for await (const ev of gen) {
        switch (ev.type) {
            case "text":
                process.stdout.write(ev.text);
                break;
            case "thinking":
                if (config.verbose) {
                    process.stdout.write(`\x1b[2m${ev.text.replace(/\n/g, " ")}\x1b[0m`);
                }
                break;
            case "tool_start":
                console.log(`\n\n\x1b[36m\u2699 ${ev.name}\x1b[0m`);
                break;
            case "tool_end":
                if (ev.result.startsWith("Error") || ev.result.startsWith("Denied")) {
                    console.log(`\x1b[31m\u2717 ${ev.result.slice(0, 120)}\x1b[0m`);
                }
                else {
                    console.log(`\x1b[32m\u2713 ${ev.result.split("\n").length} lines\x1b[0m`);
                }
                break;
            case "turn_done":
                console.log(`\n\n\x1b[33m[Tokens: ${ev.input_tokens}/${ev.output_tokens}]\x1b[0m\n`);
                break;
            case "done":
                console.log("\n\nDone.");
                break;
            case "error":
                console.error(`\n\n\x1b[31mError: ${ev.message}\x1b[0m`);
                break;
        }
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map