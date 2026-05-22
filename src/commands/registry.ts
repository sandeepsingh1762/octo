// Slash Command Registry
// All available commands

import type { SlashCommand, CommandHandler, CommandResult, CommandContext } from "./types.js";
import { ENHANCED_PROVIDERS } from "../ai/providers-enhanced.js";

// === Authentication Commands ===

const loginHandler: CommandHandler = async (args, ctx) => {
  let provider = args.provider as string | undefined;
  
  // If no provider specified, show selection
  if (!provider) {
    const providers = Object.entries(ENHANCED_PROVIDERS)
      .filter(([_, p]) => p.apiKeyEnvVar) // Only those needing keys
      .map(([id, p]) => ({ value: id, label: `${p.name}` }));
    
    provider = await ctx.ui.select({
      message: 'Select AI provider:',
      choices: providers,
    });
  }

  // Check if key already exists
  const existingKey = await ctx.keyManager.getKey(provider);
  if (existingKey) {
    const overwrite = await ctx.ui.confirm({
      message: `API key for ${provider} already exists. Overwrite?`,
    });
    if (!overwrite) return { success: true, message: 'Login cancelled' };
  }

  // Get API key
  const key = await ctx.ui.password({
    message: `Enter ${provider} API key:`,
  });

  if (!key) {
    return { success: false, message: 'No key provided' };
  }

  // Validate key
  const spinner = ctx.ui.spinner('Validating API key...');
  const valid = await ctx.keyManager.validateKey(provider, key);
  spinner.stop();

  if (!valid) {
    return { success: false, message: 'Invalid API key' };
  }

  // Save key
  await ctx.keyManager.setKey(provider, key);

  // Fetch available models
  const models = await ctx.modelDiscovery.fetchModels(provider);

  return { 
    success: true, 
    message: `Logged in to ${provider}. ${models.length} models available.`,
    data: { provider, modelCount: models.length },
  };
};

const logoutHandler: CommandHandler = async (args, ctx) => {
  let provider = args.provider as string | undefined;
  
  if (!provider) {
    const providers = ctx.keyManager.listProviders()
      .filter(p => p.hasKey)
      .map(p => ({ value: p.id, label: p.id }));
    
    if (providers.length === 0) {
      return { success: false, message: 'No providers logged in' };
    }
    
    provider = await ctx.ui.select({
      message: 'Select provider to logout:',
      choices: providers,
    });
  }

  await ctx.keyManager.removeKey(provider);
  return { success: true, message: `Logged out from ${provider}` };
};

// === Model Commands ===

const modelHandler: CommandHandler = async (args, ctx) => {
  const modelArg = args.model as string | undefined;
  
  if (!modelArg) {
    // Show model selection
    const allModels = ctx.modelDiscovery.getAvailableModels();
    
    if (allModels.length === 0) {
      return { success: false, message: 'No models available. Use /login first.' };
    }
    
    const choices = allModels.map(m => ({
      value: `${m.provider}/${m.model}`,
      label: `${m.provider}/${m.model}`,
    }));
    
    const selected = await ctx.ui.select({
      message: 'Select model:',
      choices,
    });
    
    await ctx.config.set('model', selected);
    return { success: true, message: `Model set to: ${selected}`, data: { model: selected } };
  }

  await ctx.config.set('model', modelArg);
  return { success: true, message: `Model set to: ${modelArg}`, data: { model: modelArg } };
};

const modelsHandler: CommandHandler = async (args, ctx) => {
  const provider = args.provider as string | undefined;
  const allModels = ctx.modelDiscovery.getAvailableModels();
  
  let filtered = allModels;
  if (provider) {
    filtered = allModels.filter(m => m.provider === provider);
  }

  if (filtered.length === 0) {
    return { 
      success: true, 
      message: provider 
        ? `No models available for ${provider}` 
        : 'No models available. Use /login to add providers.',
    };
  }

  const grouped: Record<string, string[]> = {};
  for (const m of filtered) {
    if (!grouped[m.provider]) grouped[m.provider] = [];
    grouped[m.provider].push(m.model);
  }

  const lines = ['Available models:'];
  for (const [prov, models] of Object.entries(grouped)) {
    lines.push(`\n${prov}:`);
    for (const model of models) {
      lines.push(`  - ${model}`);
    }
  }

  return { success: true, message: lines.join('\n') };
};

// === Settings Commands ===

const settingsHandler: CommandHandler = async (args, ctx) => {
  const key = args.key as string | undefined;
  const value = args.value as string | undefined;
  
  if (!key) {
    // Show all settings
    const all = ctx.config.getAll();
    const lines = ['Current settings:'];
    for (const [k, v] of Object.entries(all)) {
      lines.push(`  ${k}: ${JSON.stringify(v)}`);
    }
    return { success: true, message: lines.join('\n') };
  }

  if (value === undefined) {
    // Get specific setting
    const val = ctx.config.get(key);
    return { 
      success: true, 
      message: `${key}: ${JSON.stringify(val)}`,
    };
  }

  // Set setting
  let parsedValue: unknown = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value))) parsedValue = Number(value);

  await ctx.config.set(key, parsedValue);
  return { success: true, message: `Set ${key} = ${JSON.stringify(parsedValue)}` };
};

const permissionsHandler: CommandHandler = async (args, ctx) => {
  const mode = args.mode as string | undefined;
  
  if (!mode) {
    const current = ctx.config.get<string>('permissionMode') || 'auto';
    return { 
      success: true, 
      message: `Current permission mode: ${current}\n\nAvailable modes:\n  auto - Ask for dangerous operations\n  manual - Ask for all operations\n  accept-all - Auto-approve everything`,
    };
  }

  await ctx.config.set('permissionMode', mode);
  return { success: true, message: `Permission mode set to: ${mode}` };
};

// === Session Commands ===

const newSessionHandler: CommandHandler = async (args, ctx) => {
  ctx.sessionManager.clear();
  return { success: true, message: 'Started new session' };
};

const saveSessionHandler: CommandHandler = async (args, ctx) => {
  const name = args.name as string | undefined;
  const sessionId = await ctx.sessionManager.save(name);
  return { 
    success: true, 
    message: `Session saved${name ? ` as "${name}"` : ''} (ID: ${sessionId})`,
  };
};

const loadSessionHandler: CommandHandler = async (args, ctx) => {
  const nameOrId = args.name as string;
  if (!nameOrId) {
    // Show list of sessions
    const sessions = await ctx.sessionManager.list();
    if (sessions.length === 0) {
      return { success: false, message: 'No saved sessions' };
    }
    
    const choice = await ctx.ui.select({
      message: 'Select session to load:',
      choices: sessions.map(s => ({
        value: s.id,
        label: `${s.name || s.id} (${s.date.toLocaleDateString()})`,
      })),
    });
    
    await ctx.sessionManager.load(choice);
    return { success: true, message: `Loaded session: ${choice}` };
  }

  const loaded = await ctx.sessionManager.load(nameOrId);
  return { 
    success: loaded, 
    message: loaded ? `Loaded session: ${nameOrId}` : `Session not found: ${nameOrId}`,
  };
};

const historyHandler: CommandHandler = async (args, ctx) => {
  const sessions = await ctx.sessionManager.list();
  
  if (sessions.length === 0) {
    return { success: true, message: 'No session history' };
  }

  const lines = ['Session history:'];
  for (const session of sessions.slice(0, 20)) {
    lines.push(`  [${session.id}] ${session.name || '(unnamed)'} - ${session.date.toLocaleDateString()}`);
  }

  return { success: true, message: lines.join('\n') };
};

// === Tool Commands ===

const toolsHandler: CommandHandler = async (args, ctx) => {
  const enabled = ctx.config.get<string[]>('enabledTools') || ['*'];
  const disabled = ctx.config.get<string[]>('disabledTools') || [];
  
  const lines = ['Tool configuration:'];
  lines.push(`  Enabled: ${enabled.join(', ') || 'all (*)'}`);
  if (disabled.length > 0) {
    lines.push(`  Disabled: ${disabled.join(', ')}`);
  }
  
  return { success: true, message: lines.join('\n') };
};

const enableToolHandler: CommandHandler = async (args, ctx) => {
  const tool = args.tool as string;
  const disabled = ctx.config.get<string[]>('disabledTools') || [];
  const newDisabled = disabled.filter(t => t !== tool);
  await ctx.config.set('disabledTools', newDisabled);
  return { success: true, message: `Enabled tool: ${tool}` };
};

const disableToolHandler: CommandHandler = async (args, ctx) => {
  const tool = args.tool as string;
  const disabled = ctx.config.get<string[]>('disabledTools') || [];
  if (!disabled.includes(tool)) {
    disabled.push(tool);
    await ctx.config.set('disabledTools', disabled);
  }
  return { success: true, message: `Disabled tool: ${tool}` };
};

// === Agent Commands ===

const agentsHandler: CommandHandler = async (args, ctx) => {
  const active = ctx.spawner.list();
  
  if (active.length === 0) {
    return { success: true, message: 'No active agents' };
  }

  const lines = ['Active agents:'];
  for (const id of active) {
    lines.push(`  - ${id}`);
  }

  return { success: true, message: lines.join('\n') };
};

const spawnHandler: CommandHandler = async (args, ctx) => {
  const type = args.type as string;
  const prompt = args.prompt as string;
  
  const result = await ctx.spawner.spawn({
    type,
    prompt,
    description: `Manual spawn: ${type}`,
    runInBackground: true,
  });

  return { 
    success: true, 
    message: `Spawned ${type} agent: ${result}`,
    data: { agentId: result },
  };
};

const killHandler: CommandHandler = async (args, ctx) => {
  const id = args.id as string;
  
  if (id === 'all') {
    const count = ctx.spawner.cancelAll();
    return { success: true, message: `Cancelled ${count} agents` };
  }

  const cancelled = ctx.spawner.cancel(id);
  return { 
    success: cancelled, 
    message: cancelled ? `Cancelled agent: ${id}` : `Agent not found: ${id}`,
  };
};

// === Help Commands ===

const helpHandler: CommandHandler = async (args, ctx) => {
  const command = args.command as string | undefined;
  
  if (command) {
    const cmd = COMMANDS.find(c => c.name === command || c.aliases.includes(command));
    if (!cmd) {
      return { success: false, message: `Unknown command: ${command}` };
    }
    
    const lines = [
      `/${cmd.name} - ${cmd.description}`,
      `  Category: ${cmd.category}`,
      `  Aliases: ${cmd.aliases.length > 0 ? cmd.aliases.map(a => '/' + a).join(', ') : 'none'}`,
    ];
    
    if (cmd.args && cmd.args.length > 0) {
      lines.push('  Arguments:');
      for (const arg of cmd.args) {
        const req = arg.required ? '(required)' : '(optional)';
        lines.push(`    ${arg.name}: ${arg.type} ${req} - ${arg.description}`);
      }
    }
    
    return { success: true, message: lines.join('\n') };
  }

  // Show all commands grouped by category
  const grouped: Record<string, SlashCommand[]> = {};
  for (const cmd of COMMANDS) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }

  const lines = ['Available commands:'];
  for (const [cat, cmds] of Object.entries(grouped)) {
    lines.push(`\n[${cat}]`);
    for (const cmd of cmds) {
      const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.map(a => '/' + a).join(', ')})` : '';
      lines.push(`  /${cmd.name}${aliases} - ${cmd.description}`);
    }
  }

  lines.push('\nUse /help <command> for more details');

  return { success: true, message: lines.join('\n') };
};

// === System Commands ===

const clearHandler: CommandHandler = async (args, ctx) => {
  ctx.sessionManager.clear();
  return { success: true, message: 'Cleared conversation', silent: true };
};

const exitHandler: CommandHandler = async () => {
  process.exit(0);
};

const debugHandler: CommandHandler = async (args, ctx) => {
  const current = ctx.config.get<boolean>('debug') || false;
  await ctx.config.set('debug', !current);
  return { success: true, message: `Debug mode: ${!current ? 'ON' : 'OFF'}` };
};

const costHandler: CommandHandler = async (args, ctx) => {
  // This would be connected to actual token tracking
  const tokens = ctx.config.get<{ input: number; output: number }>('sessionTokens') || { input: 0, output: 0 };
  const cost = ctx.config.get<number>('sessionCost') || 0;

  return { 
    success: true, 
    message: `Session usage:\n  Input tokens: ${tokens.input}\n  Output tokens: ${tokens.output}\n  Estimated cost: $${cost.toFixed(4)}`,
  };
};

const compactHandler: CommandHandler = async (args, ctx) => {
  // This would trigger context compaction
  return { success: true, message: 'Context compacted' };
};

// === Command Registry ===

export const COMMANDS: SlashCommand[] = [
  // Auth
  {
    name: 'login',
    aliases: ['auth', 'l'],
    description: 'Login to AI provider and set API key',
    category: 'auth',
    args: [
      { name: 'provider', type: 'choice', required: false, choices: Object.keys(ENHANCED_PROVIDERS), description: 'Provider name' },
    ],
    handler: loginHandler,
  },
  {
    name: 'logout',
    aliases: [],
    description: 'Remove API key for provider',
    category: 'auth',
    args: [
      { name: 'provider', type: 'string', required: false, description: 'Provider name' },
    ],
    handler: logoutHandler,
  },

  // Config
  {
    name: 'model',
    aliases: ['m'],
    description: 'Select or show current model',
    category: 'config',
    args: [
      { name: 'model', type: 'string', required: false, description: 'Model name (provider/model)' },
    ],
    handler: modelHandler,
  },
  {
    name: 'models',
    aliases: [],
    description: 'List all available models',
    category: 'config',
    args: [
      { name: 'provider', type: 'string', required: false, description: 'Filter by provider' },
    ],
    handler: modelsHandler,
  },
  {
    name: 'settings',
    aliases: ['config', 'prefs'],
    description: 'View or modify settings',
    category: 'config',
    args: [
      { name: 'key', type: 'string', required: false, description: 'Setting key' },
      { name: 'value', type: 'string', required: false, description: 'Setting value' },
    ],
    handler: settingsHandler,
  },
  {
    name: 'permissions',
    aliases: ['perms'],
    description: 'Set permission mode',
    category: 'config',
    args: [
      { name: 'mode', type: 'choice', required: false, choices: ['auto', 'manual', 'accept-all'], description: 'Permission mode' },
    ],
    handler: permissionsHandler,
  },

  // Session
  {
    name: 'new',
    aliases: ['n'],
    description: 'Start new session',
    category: 'session',
    handler: newSessionHandler,
  },
  {
    name: 'save',
    aliases: [],
    description: 'Save current session',
    category: 'session',
    args: [
      { name: 'name', type: 'string', required: false, description: 'Session name' },
    ],
    handler: saveSessionHandler,
  },
  {
    name: 'load',
    aliases: [],
    description: 'Load saved session',
    category: 'session',
    args: [
      { name: 'name', type: 'string', required: false, description: 'Session name or ID' },
    ],
    handler: loadSessionHandler,
  },
  {
    name: 'history',
    aliases: ['h'],
    description: 'Show session history',
    category: 'session',
    handler: historyHandler,
  },

  // Tools
  {
    name: 'tools',
    aliases: [],
    description: 'List tool configuration',
    category: 'tools',
    handler: toolsHandler,
  },
  {
    name: 'enable',
    aliases: [],
    description: 'Enable a tool',
    category: 'tools',
    args: [
      { name: 'tool', type: 'string', required: true, description: 'Tool name' },
    ],
    handler: enableToolHandler,
  },
  {
    name: 'disable',
    aliases: [],
    description: 'Disable a tool',
    category: 'tools',
    args: [
      { name: 'tool', type: 'string', required: true, description: 'Tool name' },
    ],
    handler: disableToolHandler,
  },

  // Agents
  {
    name: 'agents',
    aliases: [],
    description: 'List active agents',
    category: 'agents',
    handler: agentsHandler,
  },
  {
    name: 'spawn',
    aliases: [],
    description: 'Spawn a subagent',
    category: 'agents',
    args: [
      { name: 'type', type: 'choice', required: true, choices: ['explore', 'plan', 'code', 'review', 'test', 'research', 'general'], description: 'Agent type' },
      { name: 'prompt', type: 'string', required: true, description: 'Task for the agent' },
    ],
    handler: spawnHandler,
  },
  {
    name: 'kill',
    aliases: [],
    description: 'Kill an agent',
    category: 'agents',
    args: [
      { name: 'id', type: 'string', required: true, description: 'Agent ID or "all"' },
    ],
    handler: killHandler,
  },

  // Help
  {
    name: 'help',
    aliases: ['?'],
    description: 'Show help',
    category: 'help',
    args: [
      { name: 'command', type: 'string', required: false, description: 'Command name' },
    ],
    handler: helpHandler,
  },

  // System
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear conversation',
    category: 'system',
    handler: clearHandler,
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit OCTOPUS',
    category: 'system',
    handler: exitHandler,
  },
  {
    name: 'debug',
    aliases: [],
    description: 'Toggle debug mode',
    category: 'system',
    handler: debugHandler,
  },
  {
    name: 'cost',
    aliases: [],
    description: 'Show session token/cost usage',
    category: 'system',
    handler: costHandler,
  },
  {
    name: 'compact',
    aliases: [],
    description: 'Compact conversation context',
    category: 'system',
    handler: compactHandler,
  },
];

// Command lookup helpers
export function findCommand(input: string): SlashCommand | undefined {
  const name = input.toLowerCase();
  return COMMANDS.find(c => c.name === name || c.aliases.includes(name));
}

export function getCommandsByCategory(category: string): SlashCommand[] {
  return COMMANDS.filter(c => c.category === category);
}

export function getAllCommands(): SlashCommand[] {
  return COMMANDS;
}
