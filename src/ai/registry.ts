import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { GoogleProvider } from "./google-provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import type { BaseProvider, ProviderConfig } from "./types.js";
import {
  ENHANCED_PROVIDERS,
  detectProviderFromModel,
  getModelConfig,
  KeyManager,
  ModelDiscovery,
} from "./providers-enhanced.js";

export interface ProviderInfo {
  name: string;
  type: string;
  apiKeyEnv: string;
  baseUrl?: string;
  contextLimit: number;
  models: string[];
  costPerMtok?: [number, number];
}

function buildProviders(): Record<string, ProviderInfo> {
  const result: Record<string, ProviderInfo> = {};

  for (const [id, config] of Object.entries(ENHANCED_PROVIDERS)) {
    const providerType =
      config.type === "anthropic"
        ? "anthropic"
        : config.type === "google"
          ? "google"
          : id === "openrouter"
            ? "openrouter"
            : "openai";

    result[id] = {
      name: config.name,
      type: providerType,
      apiKeyEnv: config.apiKeyEnvVar,
      baseUrl: config.baseUrl,
      contextLimit: config.models[0]?.contextWindow ?? 128000,
      models: config.models.map((m) => m.id),
      costPerMtok: config.models[0]
        ? [config.models[0].costPer1kInput * 1000, config.models[0].costPer1kOutput * 1000]
        : undefined,
    };
  }

  return result;
}

export const PROVIDERS: Record<string, ProviderInfo> = buildProviders();

export function detectProvider(model: string): string {
  return detectProviderFromModel(model);
}

/** Resolve model id sent to the provider API */
export function resolveModelId(model: string, providerId?: string): string {
  const pname = providerId ?? detectProvider(model);

  if (pname === "openrouter") {
    if (model.startsWith("openrouter/")) return model;
    if (model.includes("/") && model.split("/")[0] === "openrouter") return model;
    if (!model.trim()) return "";
    return model === "free" ? "openrouter/free" : `openrouter/${model}`;
  }

  return model.includes("/") ? model.split("/").slice(1).join("/") : model;
}

export function bareModel(model: string): string {
  return resolveModelId(model);
}

export function getProvider(model: string): BaseProvider {
  const pname = detectProvider(model);
  const p = PROVIDERS[pname];
  if (!p) return new OpenAIProvider();

  if (pname === "openrouter" || model.startsWith("openrouter/")) {
    return new OpenRouterProvider();
  }

  switch (p.type) {
    case "anthropic":
      return new AnthropicProvider();
    case "google":
      return new GoogleProvider();
    default:
      return new OpenAIProvider();
  }
}

export async function buildProviderConfig(
  model: string,
  overrides?: Partial<ProviderConfig>
): Promise<ProviderConfig> {
  const pname = detectProvider(model);
  const p = PROVIDERS[pname];
  const modelConfig = getModelConfig(model);

  let apiKey = "";
  const fromStore = await keyManager.getKey(pname);
  if (fromStore) {
    apiKey = fromStore;
  } else if (p?.apiKeyEnv) {
    apiKey = process.env[p.apiKeyEnv] ?? "";
  }

  return {
    apiKey,
    baseUrl: p?.baseUrl,
    model: resolveModelId(model, pname),
    maxTokens: modelConfig?.maxOutputTokens ?? 8192,
    ...overrides,
  };
}

export const keyManager = new KeyManager();
export const modelDiscovery = new ModelDiscovery();

export async function getAvailableModels(providerId: string): Promise<string[]> {
  const models = await modelDiscovery.fetchModels(providerId);
  return models.map((m) => m.id);
}

export function getAllProvidersList(): string[] {
  return Object.keys(PROVIDERS);
}

export async function hasValidKey(providerId: string): Promise<boolean> {
  const key = await keyManager.getKey(providerId);
  return key !== null;
}

export async function setProviderKey(providerId: string, key: string): Promise<boolean> {
  return keyManager.setKey(providerId, key);
}

export async function initializeKeyManager(): Promise<void> {
  await keyManager.initialize();
}
