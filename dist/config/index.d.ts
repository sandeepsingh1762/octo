export declare const CONFIG_DIR: string;
export declare const CONFIG_FILE: string;
export declare const PROJECT_CONFIG_FILE = ".octopus/config.json";
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
    auto_compact: boolean;
    auto_compact_threshold: number;
    show_cost: boolean;
    show_tokens: boolean;
    debug: boolean;
    log_level: "debug" | "info" | "warn" | "error";
    enabled_tools: string[];
    disabled_tools: string[];
    auto_save_session: boolean;
    session_history_limit: number;
    [key: string]: unknown;
}
export declare function loadConfig(): Promise<Config>;
export declare function saveConfig(cfg: Config, scope?: 'user' | 'project'): Promise<void>;
export declare function getConfigDefault(key: keyof Config): unknown;
export declare function getConfigDefaults(): Config;
export * from "./settings.js";
export * from "./defaults.js";
//# sourceMappingURL=index.d.ts.map