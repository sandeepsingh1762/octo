// Command Parser
// Parses user input to detect and extract slash commands

import type { ParsedCommand, SlashCommand } from "./types.js";
import { findCommand, getAllCommands } from "./registry.js";

export function isCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  
  if (!trimmed.startsWith('/')) {
    return null;
  }

  // Remove leading slash
  const withoutSlash = trimmed.slice(1);
  
  // Split into command and rest
  const parts = withoutSlash.split(/\s+/);
  const commandName = parts[0]?.toLowerCase();
  
  if (!commandName) {
    return null;
  }

  // Find the command
  const command = findCommand(commandName);
  
  if (!command) {
    return null;
  }

  // Parse arguments
  const args: Record<string, unknown> = {};
  const argParts = parts.slice(1);

  if (command.args && command.args.length > 0) {
    // Handle named args (--key=value or --key value)
    const namedArgs = new Map<string, string>();
    const positionalArgs: string[] = [];
    
    for (let i = 0; i < argParts.length; i++) {
      const part = argParts[i];
      
      if (part.startsWith('--')) {
        const keyValue = part.slice(2);
        if (keyValue.includes('=')) {
          const [key, ...valueParts] = keyValue.split('=');
          namedArgs.set(key!, valueParts.join('='));
        } else {
          // Next part is the value
          const key = keyValue;
          const value = argParts[i + 1];
          if (value && !value.startsWith('--')) {
            namedArgs.set(key, value);
            i++;
          } else {
            namedArgs.set(key, 'true');
          }
        }
      } else if (part.startsWith('-')) {
        // Short form: -k value
        const key = part.slice(1);
        const value = argParts[i + 1];
        if (value && !value.startsWith('-')) {
          namedArgs.set(key, value);
          i++;
        } else {
          namedArgs.set(key, 'true');
        }
      } else {
        positionalArgs.push(part);
      }
    }

    // Map named args to command args
    for (const [key, value] of namedArgs) {
      const argDef = command.args.find(a => a.name === key || a.name.startsWith(key));
      if (argDef) {
        args[argDef.name] = parseArgValue(value, argDef.type);
      }
    }

    // Map positional args
    let posIndex = 0;
    for (const argDef of command.args) {
      if (args[argDef.name] === undefined && posIndex < positionalArgs.length) {
        // Handle remaining args as a single string for the last arg
        if (posIndex === positionalArgs.length - 1 || argDef === command.args[command.args.length - 1]) {
          const remainingArgs = positionalArgs.slice(posIndex).join(' ');
          args[argDef.name] = parseArgValue(remainingArgs, argDef.type);
          break;
        } else {
          args[argDef.name] = parseArgValue(positionalArgs[posIndex]!, argDef.type);
          posIndex++;
        }
      }
    }

    // Set defaults for missing optional args
    for (const argDef of command.args) {
      if (args[argDef.name] === undefined && argDef.default !== undefined) {
        args[argDef.name] = argDef.default;
      }
    }
  }

  return {
    command: command.name,
    args,
    raw: input,
  };
}

function parseArgValue(value: string, type: string): unknown {
  switch (type) {
    case 'number':
      return Number(value);
    case 'boolean':
      return value === 'true' || value === '1' || value === 'yes';
    default:
      return value;
  }
}

// Autocomplete suggestions
export function getCompletions(partial: string): string[] {
  if (!partial.startsWith('/')) {
    return [];
  }

  const withoutSlash = partial.slice(1).toLowerCase();
  const commands = getAllCommands();

  // If just starting, show all commands
  if (!withoutSlash) {
    return commands.map(c => '/' + c.name);
  }

  // Filter commands by prefix
  const matches: string[] = [];
  
  for (const cmd of commands) {
    if (cmd.name.startsWith(withoutSlash)) {
      matches.push('/' + cmd.name);
    }
    for (const alias of cmd.aliases) {
      if (alias.startsWith(withoutSlash)) {
        matches.push('/' + alias);
      }
    }
  }

  return matches;
}

// Validate command arguments
export function validateCommand(parsed: ParsedCommand): { valid: boolean; errors: string[] } {
  const command = findCommand(parsed.command);
  
  if (!command) {
    return { valid: false, errors: [`Unknown command: ${parsed.command}`] };
  }

  const errors: string[] = [];

  if (command.args) {
    for (const argDef of command.args) {
      const value = parsed.args[argDef.name];
      
      // Check required
      if (argDef.required && value === undefined) {
        errors.push(`Missing required argument: ${argDef.name}`);
        continue;
      }

      // Check choices
      if (value !== undefined && argDef.choices && argDef.choices.length > 0) {
        if (!argDef.choices.includes(String(value))) {
          errors.push(`Invalid value for ${argDef.name}: ${value}. Must be one of: ${argDef.choices.join(', ')}`);
        }
      }

      // Check type
      if (value !== undefined) {
        if (argDef.type === 'number' && isNaN(Number(value))) {
          errors.push(`${argDef.name} must be a number`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// Format help text for a command
export function formatCommandHelp(command: SlashCommand): string {
  const lines = [
    `/${command.name} - ${command.description}`,
  ];

  if (command.aliases.length > 0) {
    lines.push(`Aliases: ${command.aliases.map(a => '/' + a).join(', ')}`);
  }

  if (command.args && command.args.length > 0) {
    lines.push('');
    lines.push('Arguments:');
    for (const arg of command.args) {
      const req = arg.required ? '(required)' : '(optional)';
      let typeStr: string = arg.type;
      if (arg.choices) {
        typeStr = arg.choices.join('|');
      }
      lines.push(`  ${arg.name}: ${typeStr} ${req}`);
      lines.push(`    ${arg.description}`);
    }
  }

  return lines.join('\n');
}
