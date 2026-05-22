// Slash Command System Types

export type CommandCategory = 
  | 'auth'        // login, logout
  | 'config'      // model, settings, permissions
  | 'session'     // new, save, load, history
  | 'tools'       // enable, disable tools
  | 'agents'      // spawn, list, kill agents
  | 'skills'      // list, run, create skills
  | 'help'        // help, docs
  | 'system';     // clear, exit, debug

export interface CommandArg {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  required: boolean;
  choices?: string[];
  description: string;
  default?: unknown;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: unknown;
  silent?: boolean;  // Don't display message to user
}

export interface CommandContext {
  // Services
  config: ConfigService;
  keyManager: KeyManagerService;
  modelDiscovery: ModelDiscoveryService;
  sessionManager: SessionManagerService;
  spawner: SpawnerService;
  
  // UI helpers
  ui: UIService;
  
  // Current state
  currentModel: string;
  sessionId: string;
}

// Service interfaces (implemented elsewhere)
export interface ConfigService {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
  getAll(): Record<string, unknown>;
}

export interface KeyManagerService {
  getKey(provider: string): Promise<string | null>;
  setKey(provider: string, key: string): Promise<void>;
  validateKey(provider: string, key: string): Promise<boolean>;
  removeKey(provider: string): Promise<void>;
  listProviders(): Array<{ id: string; hasKey: boolean }>;
}

export interface ModelDiscoveryService {
  fetchModels(provider: string): Promise<Array<{ id: string; name: string }>>;
  getAvailableModels(): Array<{ provider: string; model: string }>;
}

export interface SessionManagerService {
  save(name?: string): Promise<string>;
  load(nameOrId: string): Promise<boolean>;
  list(): Promise<Array<{ id: string; name: string; date: Date }>>;
  clear(): void;
  fork(): Promise<string>;
}

export interface SpawnerService {
  spawn(params: unknown): Promise<unknown>;
  cancel(id: string): boolean;
  cancelAll(): number;
  list(): string[];
  getResult(id: string): Promise<unknown>;
}

export interface UIService {
  select<T extends string>(options: { message: string; choices: Array<{ value: T; label: string }> }): Promise<T>;
  confirm(options: { message: string; default?: boolean }): Promise<boolean>;
  input(options: { message: string; default?: string }): Promise<string>;
  password(options: { message: string }): Promise<string>;
  spinner(message: string): { stop: () => void };
  log(message: string): void;
  error(message: string): void;
  success(message: string): void;
  table(data: Array<Record<string, unknown>>): void;
}

export type CommandHandler = (args: Record<string, unknown>, ctx: CommandContext) => Promise<CommandResult>;
export type AutocompleteHandler = (partial: string, ctx: CommandContext) => Promise<string[]>;

export interface SlashCommand {
  name: string;
  aliases: string[];
  description: string;
  category: CommandCategory;
  args?: CommandArg[];
  handler: CommandHandler;
  autocomplete?: AutocompleteHandler;
}

export interface ParsedCommand {
  command: string;
  args: Record<string, unknown>;
  raw: string;
}
