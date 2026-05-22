import type { BaseProvider, ProviderConfig } from "./types.js";
export interface ProviderInfo {
    name: string;
    type: string;
    apiKeyEnv: string;
    baseUrl?: string;
    contextLimit: number;
    models: string[];
    costPerMtok?: [number, number];
}
export declare const PROVIDERS: Record<string, ProviderInfo>;
export declare function detectProvider(model: string): string;
export declare function bareModel(model: string): string;
export declare function getProvider(model: string): BaseProvider;
export declare function buildProviderConfig(model: string, overrides?: Partial<ProviderConfig>): ProviderConfig;
//# sourceMappingURL=registry.d.ts.map