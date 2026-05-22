import * as fs from "fs/promises";
import * as path from "path";
export const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".octopus");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DEFAULTS = {
    model: "gpt-4o",
    max_tokens: 8192,
    permission_mode: "auto",
    verbose: false,
    thinking: false,
    thinking_budget: 10000,
    max_tool_output: 32000,
    max_agent_depth: 3,
    max_concurrent_agents: 3,
    custom_base_url: "",
};
export async function loadConfig() {
    try {
        const text = await fs.readFile(CONFIG_FILE, "utf-8");
        return { ...DEFAULTS, ...JSON.parse(text) };
    }
    catch {
        return { ...DEFAULTS };
    }
}
export async function saveConfig(cfg) {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const data = { ...cfg };
    for (const k of Object.keys(data)) {
        if (k.startsWith("_"))
            delete data[k];
    }
    await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
}
//# sourceMappingURL=index.js.map