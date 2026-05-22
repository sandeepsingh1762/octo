// Structured Logging System
// Production-grade logging with context

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  context: {
    sessionId?: string;
    agentId?: string;
    tool?: string;
    tokens?: number;
    duration?: number;
  };
  metadata?: Record<string, unknown>;
  stack?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  console: boolean;
  file: boolean;
  filePath?: string;
  maxFileSize?: number;     // bytes
  maxFiles?: number;
  jsonFormat?: boolean;
  colorize?: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  console: true,
  file: false,
  maxFileSize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 5,
  jsonFormat: false,
  colorize: true,
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',  // Cyan
  info: '\x1b[32m',   // Green
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
};

const RESET = '\x1b[0m';

export class Logger {
  private config: LoggerConfig;
  private context: {
    sessionId?: string;
    agentId?: string;
  } = {};
  private fileHandle: fs.FileHandle | null = null;
  private currentFileSize = 0;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.file && !this.config.filePath) {
      this.config.filePath = path.join(os.homedir(), '.octopus', 'logs', 'octopus.log');
    }
  }

  setContext(ctx: { sessionId?: string; agentId?: string }): void {
    this.context = { ...this.context, ...ctx };
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', 'general', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', 'general', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', 'general', message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log('error', 'general', message, {
      ...meta,
      error: error?.message,
      stack: error?.stack,
    });
  }

  tool(tool: string, message: string, meta?: Record<string, unknown>): void {
    this.log('debug', 'tool', message, { tool, ...meta });
  }

  agent(agentId: string, message: string, meta?: Record<string, unknown>): void {
    this.log('info', 'agent', message, { agentId, ...meta });
  }

  log(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    // Check level
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category,
      message,
      context: {
        ...this.context,
        tool: metadata?.tool as string | undefined,
        tokens: metadata?.tokens as number | undefined,
        duration: metadata?.duration as number | undefined,
      },
      metadata,
    };

    // Console output
    if (this.config.console) {
      this.writeConsole(entry);
    }

    // File output
    if (this.config.file) {
      this.writeFile(entry);
    }
  }

  private writeConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const category = entry.category.padEnd(10);

    let output: string;

    if (this.config.jsonFormat) {
      output = JSON.stringify(entry);
    } else {
      const color = this.config.colorize ? LEVEL_COLORS[entry.level] : '';
      const reset = this.config.colorize ? RESET : '';
      
      output = `${timestamp} ${color}${level}${reset} [${category}] ${entry.message}`;
      
      if (entry.context.sessionId) {
        output += ` session=${entry.context.sessionId}`;
      }
      if (entry.context.tool) {
        output += ` tool=${entry.context.tool}`;
      }
      if (entry.context.duration) {
        output += ` duration=${entry.context.duration}ms`;
      }
      if (entry.context.tokens) {
        output += ` tokens=${entry.context.tokens}`;
      }
    }

    if (entry.level === 'error') {
      console.error(output);
      if (entry.metadata?.stack) {
        console.error(entry.metadata.stack);
      }
    } else if (entry.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  private async writeFile(entry: LogEntry): Promise<void> {
    if (!this.config.filePath) return;

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.config.filePath), { recursive: true });

      // Check file size for rotation
      if (this.config.maxFileSize && this.currentFileSize > this.config.maxFileSize) {
        await this.rotateFile();
      }

      // Format entry
      const line = JSON.stringify(entry) + '\n';
      
      // Append to file
      await fs.appendFile(this.config.filePath, line, 'utf-8');
      this.currentFileSize += line.length;
    } catch (e) {
      // Logging shouldn't throw
      console.error('Failed to write log file:', e);
    }
  }

  private async rotateFile(): Promise<void> {
    if (!this.config.filePath) return;

    const maxFiles = this.config.maxFiles || 5;
    
    // Rotate existing files
    for (let i = maxFiles - 1; i >= 0; i--) {
      const oldPath = i === 0 
        ? this.config.filePath 
        : `${this.config.filePath}.${i}`;
      const newPath = `${this.config.filePath}.${i + 1}`;

      try {
        if (i === maxFiles - 1) {
          await fs.unlink(oldPath);
        } else {
          await fs.rename(oldPath, newPath);
        }
      } catch {
        // File doesn't exist
      }
    }

    this.currentFileSize = 0;
  }

  async close(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }

  // Create child logger with additional context
  child(context: { sessionId?: string; agentId?: string }): Logger {
    const child = new Logger(this.config);
    child.context = { ...this.context, ...context };
    return child;
  }
}

// Singleton instance
let defaultLogger: Logger | null = null;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}

export function configureLogger(config: Partial<LoggerConfig>): void {
  defaultLogger = new Logger(config);
}

export default Logger;
