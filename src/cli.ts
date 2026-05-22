import { registerAllTools } from "./tools/index.js";
import { loadConfig, saveConfig } from "./config/index.js";
import { AgentState, runAgent, type AgentEvent } from "./agent/loop.js";
import { buildSystemPrompt } from "./agent/system.js";
import { initializeKeyManager, setProviderKey } from "./ai/registry.js";
import { CommandExecutor } from "./commands/executor.js";

async function runSlashCommand(executor: CommandExecutor, line: string): Promise<void> {
  const result = await executor.execute(line);
  if (result.success) {
    console.log(`\x1b[35m${result.message}\x1b[0m`);
  } else {
    console.error(`\x1b[31m${result.message}\x1b[0m`);
  }
}

async function main() {
  registerAllTools();
  await initializeKeyManager();

  const args = process.argv.slice(2);

  // Non-interactive setup: octopus --login openrouter (uses OPENROUTER_API_KEY env)
  if (args[0] === "--login") {
    const provider = args[1] || "openrouter";
    const envVar =
      provider === "openrouter" ? "OPENROUTER_API_KEY" : `${provider.toUpperCase()}_API_KEY`;
    const key = process.env[envVar];
    if (!key) {
      console.error(`Set ${envVar} in your environment first.`);
      process.exit(1);
    }
    const ok = await setProviderKey(provider, key);
    const config = await loadConfig();
    await saveConfig(config);
    const modelHint = config.model
      ? `Model: ${config.model}`
      : "Run /model <id> to choose a model (e.g. openrouter/free)";
    console.log(ok ? `Logged in to ${provider}. ${modelHint}` : `Login failed for ${provider}`);
    process.exit(ok ? 0 : 1);
  }

  // Interactive slash command: octopus --cmd "/help"
  if (args[0] === "--cmd") {
    const cmd = args.slice(1).join(" ");
    const executor = new CommandExecutor({
      onOutput: (t) => console.log(t),
      onError: (t) => console.error(t),
      onInput: async (prompt) => {
        console.log(prompt);
        return "";
      },
    });
    await executor.initialize();
    await runSlashCommand(executor, cmd);
    process.exit(0);
  }

  const prompt = args.join(" ");

  if (!prompt) {
    console.log("OCTOPUS CLI");
    console.log("  octopus <prompt>              Run agent with a prompt");
    console.log("  octopus --login [provider]    Save API key from env (default: openrouter)");
    console.log("  octopus --cmd \"/help\"         Run a slash command");
    console.log("  octopus-tui                   Interactive terminal UI");
    console.log("");
    console.log("Setup: set your provider API key in env, then:");
    console.log("  octopus --login <provider>     e.g. openrouter, anthropic, openai");
    console.log("  octopus --cmd \"/model <id>\"    e.g. openrouter/free");
    console.log("  octopus \"Your task here\"");
    process.exit(1);
  }

  const config = await loadConfig();
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
        } else {
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
