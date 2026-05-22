export declare const CONFIG_DIR: string;
export declare const CONFIG_FILE: string;
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
    [key: string]: unknown;
}
export declare function loadConfig(): Promise<Config>;
export declare function saveConfig(cfg: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map