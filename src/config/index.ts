import * as fs from "fs/promises";
import * as path from "path";
import { OCTOPUS_HOME, DEFAULT_MODEL } from "./defaults.js";

export const CONFIG_DIR = OCTOPUS_HOME;
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
export const PROJECT_CONFIG_FILE = ".octopus/config.json";

export interface Config {
  model: string;
  max_tokens: number;
  permission_mode: "auto" | "accept-all" | "manual";
  verbose: boolean;
  thinking: boolean;
  thinking_budget: number;
  max_tool_output: number;
  max_agent_depth: number;
  max_concurrent_agents: number;
  custom_base_url: string;
  // Advanced settings
  auto_compact: boolean;
  auto_compact_threshold: number;
  show_cost: boolean;
  show_tokens: boolean;
  debug: boolean;
  log_level: "debug" | "info" | "warn" | "error";
  // Tool settings
  enabled_tools: string[];
  disabled_tools: string[];
  // Session settings
  auto_save_session: boolean;
  session_history_limit: number;
  [key: string]: unknown;
}

const DEFAULTS: Config = {
  model: DEFAULT_MODEL,
  max_tokens: 8192,
  permission_mode: "auto",
  verbose: false,
  thinking: false,
  thinking_budget: 10000,
  max_tool_output: 32000,
  max_agent_depth: 3,
  max_concurrent_agents: 3,
  custom_base_url: "",
  // Advanced settings
  auto_compact: true,
  auto_compact_threshold: 100000,
  show_cost: true,
  show_tokens: true,
  debug: false,
  log_level: "info",
  // Tool settings
  enabled_tools: [],
  disabled_tools: [],
  // Session settings
  auto_save_session: false,
  session_history_limit: 100,
};

// Load config with project override support
export async function loadConfig(): Promise<Config> {
  let config = { ...DEFAULTS };

  // Load user config
  try {
    const text = await fs.readFile(CONFIG_FILE, "utf-8");
    config = { ...config, ...JSON.parse(text) };
  } catch {
    // No user config
  }

  // Merge model from settings.json (slash commands persist there)
  try {
    const settingsPath = path.join(CONFIG_DIR, "settings.json");
    const text = await fs.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(text) as { model?: string };
    if (settings.model) config.model = settings.model;
  } catch {
    // No settings file
  }

  // Load project config (overrides user config)
  try {
    const projectPath = path.join(process.cwd(), PROJECT_CONFIG_FILE);
    const text = await fs.readFile(projectPath, "utf-8");
    config = { ...config, ...JSON.parse(text) };
  } catch {
    // No project config
  }

  if (!config.model && DEFAULT_MODEL) config.model = DEFAULT_MODEL;

  return config;
}

export async function saveConfig(cfg: Config, scope: 'user' | 'project' = 'user'): Promise<void> {
  const targetPath = scope === 'project' 
    ? path.join(process.cwd(), PROJECT_CONFIG_FILE)
    : CONFIG_FILE;
    
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  
  // Only save non-default values
  const data: Partial<Config> = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (key.startsWith("_")) continue;
    if (value !== DEFAULTS[key]) {
      data[key] = value;
    }
  }
  
  await fs.writeFile(targetPath, JSON.stringify(data, null, 2), "utf-8");
}

// Get a specific config value
export function getConfigDefault(key: keyof Config): unknown {
  return DEFAULTS[key];
}

// Get all defaults
export function getConfigDefaults(): Config {
  return { ...DEFAULTS };
}

// Export settings system
export * from "./settings.js";
export * from "./defaults.js";
