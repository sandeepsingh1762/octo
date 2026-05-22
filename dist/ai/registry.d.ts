import type { BaseProvider, ProviderConfig } from "./types.js";
import { KeyManager, ModelDiscovery } from "./providers-enhanced.js";
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
/** Resolve model id sent to the provider API */
export declare function resolveModelId(model: string, providerId?: string): string;
export declare function bareModel(model: string): string;
export declare function getProvider(model: string): BaseProvider;
export declare function buildProviderConfig(model: string, overrides?: Partial<ProviderConfig>): Promise<ProviderConfig>;
export declare const keyManager: KeyManager;
export declare const modelDiscovery: ModelDiscovery;
export declare function getAvailableModels(providerId: string): Promise<string[]>;
export declare function getAllProvidersList(): string[];
export declare function hasValidKey(providerId: string): Promise<boolean>;
export declare function setProviderKey(providerId: string, key: string): Promise<boolean>;
export declare function initializeKeyManager(): Promise<void>;
//# sourceMappingURL=registry.d.ts.map