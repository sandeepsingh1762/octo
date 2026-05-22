import { registerAllTools } from "./src/tools/index.js";
import { getAllTools } from "./src/tools/registry.js";
import { detectProvider, buildProviderConfig, PROVIDERS } from "./src/ai/registry.js";
import { AgentState } from "./src/agent/state.js";
import { loadConfig } from "./src/config/index.js";

registerAllTools();
console.log("✅ Tools registered:", getAllTools().length);
console.log("✅ Provider count:", Object.keys(PROVIDERS).length);
console.log("✅ Auto-detect 'gpt-4o' ->", detectProvider("gpt-4o"));
console.log("✅ Auto-detect 'claude-sonnet' ->", detectProvider("claude-sonnet"));
console.log("✅ AgentState created:", new AgentState());
const cfg = await loadConfig();
console.log("✅ Config loaded, model:", cfg.model);
console.log("🐙 OCTOPUS smoke test passed!");
