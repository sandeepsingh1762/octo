import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { GoogleProvider } from "./google-provider.js";
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

export const PROVIDERS: Record<string, ProviderInfo> = {
  anthropic: {
    name: "anthropic",
    type: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    contextLimit: 200000,
    models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    costPerMtok: [3, 15],
  },
  openai: {
    name: "openai",
    type: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    contextLimit: 128000,
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "gpt-4-turbo"],
    costPerMtok: [2.5, 10],
  },
  gemini: {
    name: "gemini",
    type: "google",
    apiKeyEnv: "GEMINI_API_KEY",
    contextLimit: 1000000,
    models: ["gemini-2.5-pro-preview-03-25", "gemini-2.0-flash", "gemini-1.5-pro"],
    costPerMtok: [1.25, 5],
  },
  deepseek: {
    name: "deepseek",
    type: "openai",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    contextLimit: 64000,
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    costPerMtok: [0.27, 1.1],
  },
  ollama: {
    name: "ollama",
    type: "openai",
    apiKeyEnv: "",
    baseUrl: "http://localhost:11434/v1",
    contextLimit: 128000,
    models: ["llama3.3", "qwen2.5-coder", "deepseek-r1", "gemma3"],
  },
  lmstudio: {
    name: "lmstudio",
    type: "openai",
    apiKeyEnv: "",
    baseUrl: "http://localhost:1234/v1",
    contextLimit: 128000,
    models: [],
  },
  custom: {
    name: "custom",
    type: "openai",
    apiKeyEnv: "CUSTOM_API_KEY",
    contextLimit: 128000,
    models: [],
  },
};

const PREFIX_MAP: Array<[string, string]> = [
  ["claude-", "anthropic"],
  ["gpt-", "openai"],
  ["o1", "openai"],
  ["o3", "openai"],
  ["gemini-", "gemini"],
  ["deepseek-", "deepseek"],
  ["llama", "ollama"],
  ["qwen", "ollama"],
  ["mistral", "ollama"],
  ["phi", "ollama"],
];

export function detectProvider(model: string): string {
  if (model.includes("/")) {
    return model.split("/")[0]!;
  }
  const m = model.toLowerCase();
  for (const [prefix, name] of PREFIX_MAP) {
    if (m.startsWith(prefix)) return name;
  }
  return "openai";
}

export function bareModel(model: string): string {
  return model.includes("/") ? model.split("/").slice(1).join("/") : model;
}

export function getProvider(model: string): BaseProvider {
  const pname = detectProvider(model);
  const p = PROVIDERS[pname];
  if (!p) return new OpenAIProvider();
  switch (p.type) {
    case "anthropic":
      return new AnthropicProvider();
    case "google":
      return new GoogleProvider();
    default:
      return new OpenAIProvider();
  }
}

export function buildProviderConfig(model: string, overrides?: Partial<ProviderConfig>): ProviderConfig {
  const pname = detectProvider(model);
  const p = PROVIDERS[pname];
  const apiKey = p?.apiKeyEnv ? (process.env[p.apiKeyEnv] ?? "") : "";
  const baseUrl = p?.baseUrl;
  return {
    apiKey,
    baseUrl,
    model: bareModel(model),
    maxTokens: 8192,
    ...overrides,
  };
}
