// Complete Settings System
// Comprehensive configuration with defaults and persistence

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { DEFAULT_MODEL, OCTOPUS_HOME } from "./defaults.js";

export interface OctopusSettings {
  // Model
  model: string;
  fallbackModel?: string;
  
  // Tokens
  maxTokens: number;
  maxContextTokens: number;
  autoCompactThreshold: number;
  
  // Permissions
  permissionMode: 'auto' | 'manual' | 'accept-all';
  
  // Thinking/Reasoning
  enableThinking: boolean;
  thinkingBudget: number;
  showThinkingInUI: boolean;
  
  // Tools
  enabledTools: string[];
  disabledTools: string[];
  toolTimeout: number;
  maxToolOutput: number;
  
  // SubAgents
  maxAgentDepth: number;
  maxConcurrentAgents: number;
  defaultSubAgentModel?: string;
  
  // Memory
  enableMemory: boolean;
  memoryScope: 'user' | 'project' | 'both';
  
  // UI
  theme: 'dark' | 'light' | 'auto';
  verbose: boolean;
  showCost: boolean;
  showTokens: boolean;
  
  // Session
  autoSave: boolean;
  autoSaveInterval: number;
  
  // Debug
  debug: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Advanced
  customSystemPrompt?: string;
  customBaseUrl?: string;
  httpProxy?: string;
  
  // Session tracking (runtime)
  sessionTokens?: { input: number; output: number };
  sessionCost?: number;
}

export const DEFAULT_SETTINGS: OctopusSettings = {
  // Model
  model: DEFAULT_MODEL,
  
  // Tokens
  maxTokens: 8192,
  maxContextTokens: 128000,
  autoCompactThreshold: 0.9,
  
  // Permissions
  permissionMode: 'auto',
  
  // Thinking
  enableThinking: false,
  thinkingBudget: 10000,
  showThinkingInUI: true,
  
  // Tools
  enabledTools: ['*'],
  disabledTools: [],
  toolTimeout: 30,
  maxToolOutput: 32000,
  
  // SubAgents
  maxAgentDepth: 2,
  maxConcurrentAgents: 5,
  
  // Memory
  enableMemory: true,
  memoryScope: 'both',
  
  // UI
  theme: 'dark',
  verbose: false,
  showCost: true,
  showTokens: true,
  
  // Session
  autoSave: true,
  autoSaveInterval: 5,
  
  // Debug
  debug: false,
  logLevel: 'info',
};

// Setting validation rules
const VALIDATORS: Record<string, (value: unknown) => boolean> = {
  maxTokens: (v) => typeof v === 'number' && v > 0 && v <= 100000,
  maxContextTokens: (v) => typeof v === 'number' && v > 0 && v <= 2000000,
  autoCompactThreshold: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  permissionMode: (v) => ['auto', 'manual', 'accept-all'].includes(String(v)),
  thinkingBudget: (v) => typeof v === 'number' && v >= 0,
  toolTimeout: (v) => typeof v === 'number' && v > 0,
  maxToolOutput: (v) => typeof v === 'number' && v > 0,
  maxAgentDepth: (v) => typeof v === 'number' && v >= 1 && v <= 5,
  maxConcurrentAgents: (v) => typeof v === 'number' && v >= 1 && v <= 20,
  memoryScope: (v) => ['user', 'project', 'both'].includes(String(v)),
  theme: (v) => ['dark', 'light', 'auto'].includes(String(v)),
  autoSaveInterval: (v) => typeof v === 'number' && v >= 1,
  logLevel: (v) => ['debug', 'info', 'warn', 'error'].includes(String(v)),
};

export class SettingsManager {
  private settings: OctopusSettings;
  private configPath: string;
  private projectConfigPath: string | null = null;
  private loaded = false;

  constructor(projectPath?: string) {
    this.settings = { ...DEFAULT_SETTINGS };
    this.configPath = path.join(OCTOPUS_HOME, 'settings.json');
    
    if (projectPath) {
      this.projectConfigPath = path.join(projectPath, '.octopus', 'settings.json');
    }
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    // Load user settings
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const userSettings = JSON.parse(data) as Partial<OctopusSettings>;
      this.mergeSettings(userSettings);
    } catch {
      // No user settings file
    }

    // Load project settings (override user)
    if (this.projectConfigPath) {
      try {
        const data = await fs.readFile(this.projectConfigPath, 'utf-8');
        const projectSettings = JSON.parse(data) as Partial<OctopusSettings>;
        this.mergeSettings(projectSettings);
      } catch {
        // No project settings file
      }
    }

    this.loaded = true;
  }

  private mergeSettings(partial: Partial<OctopusSettings>): void {
    for (const [key, value] of Object.entries(partial)) {
      if (key in DEFAULT_SETTINGS && value !== undefined) {
        const validator = VALIDATORS[key];
        if (!validator || validator(value)) {
          (this.settings as unknown as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  async save(scope: 'user' | 'project' = 'user'): Promise<void> {
    const targetPath = scope === 'project' && this.projectConfigPath 
      ? this.projectConfigPath 
      : this.configPath;

    // Only save non-default values
    const toSave: Partial<OctopusSettings> = {};
    for (const [key, value] of Object.entries(this.settings)) {
      if (value !== (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key]) {
        (toSave as unknown as Record<string, unknown>)[key] = value;
      }
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(toSave, null, 2), 'utf-8');
  }

  get<K extends keyof OctopusSettings>(key: K): OctopusSettings[K] {
    return this.settings[key];
  }

  async set<K extends keyof OctopusSettings>(key: K, value: OctopusSettings[K]): Promise<void> {
    const validator = VALIDATORS[key];
    if (validator && !validator(value)) {
      throw new Error(`Invalid value for ${key}: ${value}`);
    }
    this.settings[key] = value;
    await this.save();
  }

  getAll(): OctopusSettings {
    return { ...this.settings };
  }

  async reset(key?: keyof OctopusSettings): Promise<void> {
    if (key) {
      this.settings[key] = DEFAULT_SETTINGS[key] as never;
    } else {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    await this.save();
  }

  // Convenience methods
  isToolEnabled(tool: string): boolean {
    if (this.settings.disabledTools.includes(tool)) {
      return false;
    }
    if (this.settings.enabledTools.includes('*')) {
      return true;
    }
    return this.settings.enabledTools.includes(tool);
  }

  async enableTool(tool: string): Promise<void> {
    const disabled = this.settings.disabledTools.filter(t => t !== tool);
    this.settings.disabledTools = disabled;
    await this.save();
  }

  async disableTool(tool: string): Promise<void> {
    if (!this.settings.disabledTools.includes(tool)) {
      this.settings.disabledTools.push(tool);
      await this.save();
    }
  }

  // Export/import
  async export(): Promise<string> {
    return JSON.stringify(this.settings, null, 2);
  }

  async import(json: string): Promise<void> {
    const imported = JSON.parse(json) as Partial<OctopusSettings>;
    this.mergeSettings(imported);
    await this.save();
  }
}

export default SettingsManager;
