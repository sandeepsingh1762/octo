// Product defaults — no hardcoded API keys or user-specific models.
// Override via environment or ~/.octopus/config.json

import * as os from "os";
import * as path from "path";

export const OCTOPUS_HOME = process.env.OCTOPUS_HOME || path.join(os.homedir(), ".octopus");

/** Empty until user runs /login and /model */
export const DEFAULT_MODEL = process.env.OCTOPUS_DEFAULT_MODEL?.trim() || "";

export const DEFAULT_PROVIDER = process.env.OCTOPUS_DEFAULT_PROVIDER?.trim() || "";

export const PRODUCT_NAME = process.env.OCTOPUS_PRODUCT_NAME || "OCTOPUS";

export const PRODUCT_VERSION = process.env.OCTOPUS_VERSION || "0.1.0";

export function isModelConfigured(model: string | undefined | null): boolean {
  return Boolean(model && model.trim().length > 0);
}

export function getSetupHint(): string {
  return [
    "Welcome! Set up your AI provider:",
    "  1. /login          — choose provider and enter API key",
    "  2. /model <id>     — e.g. openrouter/free, claude-sonnet-4-6, gpt-4o",
    "  3. /help           — all commands",
    "",
    "Or set env: OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.",
    "Optional: OCTOPUS_DEFAULT_MODEL=openrouter/free",
  ].join("\n");
}
