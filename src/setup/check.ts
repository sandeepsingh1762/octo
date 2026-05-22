import { keyManager } from "../ai/registry.js";
import { ENHANCED_PROVIDERS } from "../ai/providers-enhanced.js";
import { isModelConfigured } from "../config/defaults.js";
import type { Config } from "../config/index.js";

export async function hasAnyProviderKey(): Promise<boolean> {
  for (const id of Object.keys(ENHANCED_PROVIDERS)) {
    const p = ENHANCED_PROVIDERS[id];
    if (!p.apiKeyEnvVar) continue;
    const key = await keyManager.getKey(id);
    if (key) return true;
  }
  return false;
}

export async function isReadyToChat(config: Config): Promise<{
  ready: boolean;
  missing: ("api_key" | "model")[];
}> {
  const missing: ("api_key" | "model")[] = [];
  if (!(await hasAnyProviderKey())) missing.push("api_key");
  if (!isModelConfigured(config.model)) missing.push("model");
  return { ready: missing.length === 0, missing };
}
