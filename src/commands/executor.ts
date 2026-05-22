// Command Executor - Runs slash commands with proper context

import type { CommandContext, CommandResult } from "./types.js";
import { COMMANDS, findCommand } from "./registry.js";
import { parseCommand } from "./parser.js";
import { SettingsManager } from "../config/settings.js";
import { DEFAULT_MODEL } from "../config/defaults.js";
import { loadConfig, saveConfig } from "../config/index.js";
import { KeyManager, ModelDiscovery, ENHANCED_PROVIDERS } from "../ai/providers-enhanced.js";
import { SessionManager } from "../session/manager.js";

export interface ExecutorConfig {
  onOutput?: (text: string) => void;
  onError?: (text: string) => void;
  onInput?: (prompt: string) => Promise<string>;
  onSelect?: (options: Array<{ value: string; label: string }>, prompt: string) => Promise<string>;
}

export class CommandExecutor {
  private settings: SettingsManager;
  private keyManager: KeyManager;
  private modelDiscovery: ModelDiscovery;
  private sessionManager: SessionManager;
  private config: ExecutorConfig;
  private currentModel: string = DEFAULT_MODEL;
  private sessionId: string = '';

  constructor(config: ExecutorConfig = {}) {
    this.config = config;
    this.settings = new SettingsManager();
    this.keyManager = new KeyManager();
    this.modelDiscovery = new ModelDiscovery();
    this.sessionManager = new SessionManager();
  }

  async initialize(): Promise<void> {
    await this.settings.load();
    await this.keyManager.initialize();
    this.currentModel = this.settings.get('model') || DEFAULT_MODEL;
  }

  async execute(input: string): Promise<CommandResult> {
    const parsed = parseCommand(input);
    
    if (!parsed) {
      return {
        success: false,
        message: 'Invalid command format. Use /help for available commands.',
      };
    }

    const command = findCommand(parsed.command);

    if (!command) {
      return {
        success: false,
        message: `Unknown command: ${parsed.command}. Use /help for available commands.`,
      };
    }

    const context = this.buildContext();

    try {
      return await command.handler(parsed.args, context);
    } catch (error) {
      return {
        success: false,
        message: `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private buildContext(): CommandContext {
    return {
      config: {
        get: <T>(key: string) => this.settings.get(key as any) as T | undefined,
        set: async (key: string, value: unknown) => {
          await this.settings.set(key as any, value as any);
          if (key === "model" && typeof value === "string") {
            this.currentModel = value;
            const cfg = await loadConfig();
            cfg.model = value;
            await saveConfig(cfg);
          }
        },
        getAll: () => ({ ...this.settings['settings'] }),
      },
      keyManager: {
        getKey: async (provider: string) => this.keyManager.getKey(provider),
        setKey: async (provider: string, key: string) => {
          await this.keyManager.setKey(provider, key);
        },
        validateKey: async (provider: string, key: string) => this.keyManager.validateKey(provider, key),
        removeKey: async (provider: string) => this.keyManager.removeKey(provider),
        listProviders: () => this.keyManager.listProviders().map(p => ({ id: p.id, hasKey: p.hasKey })),
      },
      modelDiscovery: {
        fetchModels: async (provider: string) => {
          const models = await this.modelDiscovery.fetchModels(provider);
          return models.map(m => ({ id: m.id, name: m.name }));
        },
        getAvailableModels: () => {
          const result: Array<{ provider: string; model: string }> = [];
          for (const [providerId, config] of Object.entries(ENHANCED_PROVIDERS)) {
            for (const model of config.models) {
              result.push({ provider: providerId, model: model.id });
            }
          }
          return result;
        },
      },
      sessionManager: {
        save: async (name?: string) => this.sessionManager.save(name),
        load: async (nameOrId: string) => {
          const session = await this.sessionManager.load(nameOrId);
          return session !== null;
        },
        list: async () => {
          const sessions = await this.sessionManager.list();
          return sessions.map(s => ({
            id: s.id,
            name: s.name || s.id,
            date: s.createdAt,
          }));
        },
        clear: () => {
          this.sessionManager.create();
        },
        fork: async () => {
          return this.sessionManager.fork()?.id || '';
        },
      },
      spawner: {
        spawn: async (_params: unknown) => {
          return { id: 'not-implemented' };
        },
        cancel: (_id: string) => false,
        cancelAll: () => 0,
        list: () => [],
        getResult: async (_id: string) => null,
      },
      ui: {
        select: async <T extends string>(options: { message: string; choices: Array<{ value: T; label: string }> }): Promise<T> => {
          if (this.config.onSelect) {
            const result = await this.config.onSelect(
              options.choices.map(c => ({ value: c.value, label: c.label })),
              options.message
            );
            return result as T;
          }
          throw new Error('No select handler configured');
        },
        confirm: async (options: { message: string; default?: boolean }) => {
          if (this.config.onInput) {
            const result = await this.config.onInput(`${options.message} (y/n)`);
            return result.toLowerCase() === 'y' || result.toLowerCase() === 'yes';
          }
          return options.default ?? false;
        },
        input: async (options: { message: string; default?: string }) => {
          if (this.config.onInput) {
            return this.config.onInput(options.message);
          }
          return options.default || '';
        },
        password: async (options: { message: string }) => {
          if (this.config.onInput) {
            return this.config.onInput(options.message);
          }
          throw new Error('No input handler configured');
        },
        spinner: (message: string) => {
          if (this.config.onOutput) {
            this.config.onOutput(`⏳ ${message}`);
          }
          return {
            stop: () => {},
          };
        },
        log: (message: string) => {
          if (this.config.onOutput) {
            this.config.onOutput(message);
          }
        },
        error: (message: string) => {
          if (this.config.onError) {
            this.config.onError(message);
          }
        },
        success: (message: string) => {
          if (this.config.onOutput) {
            this.config.onOutput(`✓ ${message}`);
          }
        },
        table: (data: Array<Record<string, unknown>>) => {
          if (this.config.onOutput) {
            const lines = data.map(row => 
              Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' | ')
            );
            this.config.onOutput(lines.join('\n'));
          }
        },
      },
      currentModel: this.currentModel,
      sessionId: this.sessionId,
    };
  }

  getSettings(): SettingsManager {
    return this.settings;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  setCurrentModel(model: string): void {
    this.currentModel = model;
  }
}

export default CommandExecutor;
