// Structured Logging System
// Production-grade logging with context
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
const DEFAULT_CONFIG = {
    level: 'info',
    console: true,
    file: false,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
    jsonFormat: false,
    colorize: true,
};
const LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const LEVEL_COLORS = {
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m', // Green
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
};
const RESET = '\x1b[0m';
export class Logger {
    config;
    context = {};
    fileHandle = null;
    currentFileSize = 0;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        if (this.config.file && !this.config.filePath) {
            this.config.filePath = path.join(os.homedir(), '.octopus', 'logs', 'octopus.log');
        }
    }
    setContext(ctx) {
        this.context = { ...this.context, ...ctx };
    }
    debug(message, meta) {
        this.log('debug', 'general', message, meta);
    }
    info(message, meta) {
        this.log('info', 'general', message, meta);
    }
    warn(message, meta) {
        this.log('warn', 'general', message, meta);
    }
    error(message, error, meta) {
        this.log('error', 'general', message, {
            ...meta,
            error: error?.message,
            stack: error?.stack,
        });
    }
    tool(tool, message, meta) {
        this.log('debug', 'tool', message, { tool, ...meta });
    }
    agent(agentId, message, meta) {
        this.log('info', 'agent', message, { agentId, ...meta });
    }
    log(level, category, message, metadata) {
        // Check level
        if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.level]) {
            return;
        }
        const entry = {
            timestamp: new Date(),
            level,
            category,
            message,
            context: {
                ...this.context,
                tool: metadata?.tool,
                tokens: metadata?.tokens,
                duration: metadata?.duration,
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
    writeConsole(entry) {
        const timestamp = entry.timestamp.toISOString();
        const level = entry.level.toUpperCase().padEnd(5);
        const category = entry.category.padEnd(10);
        let output;
        if (this.config.jsonFormat) {
            output = JSON.stringify(entry);
        }
        else {
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
        }
        else if (entry.level === 'warn') {
            console.warn(output);
        }
        else {
            console.log(output);
        }
    }
    async writeFile(entry) {
        if (!this.config.filePath)
            return;
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
        }
        catch (e) {
            // Logging shouldn't throw
            console.error('Failed to write log file:', e);
        }
    }
    async rotateFile() {
        if (!this.config.filePath)
            return;
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
                }
                else {
                    await fs.rename(oldPath, newPath);
                }
            }
            catch {
                // File doesn't exist
            }
        }
        this.currentFileSize = 0;
    }
    async close() {
        if (this.fileHandle) {
            await this.fileHandle.close();
            this.fileHandle = null;
        }
    }
    // Create child logger with additional context
    child(context) {
        const child = new Logger(this.config);
        child.context = { ...this.context, ...context };
        return child;
    }
}
// Singleton instance
let defaultLogger = null;
export function getLogger() {
    if (!defaultLogger) {
        defaultLogger = new Logger();
    }
    return defaultLogger;
}
export function configureLogger(config) {
    defaultLogger = new Logger(config);
}
export default Logger;
//# sourceMappingURL=logger.js.map