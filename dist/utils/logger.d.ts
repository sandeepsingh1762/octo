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
    maxFileSize?: number;
    maxFiles?: number;
    jsonFormat?: boolean;
    colorize?: boolean;
}
export declare class Logger {
    private config;
    private context;
    private fileHandle;
    private currentFileSize;
    constructor(config?: Partial<LoggerConfig>);
    setContext(ctx: {
        sessionId?: string;
        agentId?: string;
    }): void;
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: Error, meta?: Record<string, unknown>): void;
    tool(tool: string, message: string, meta?: Record<string, unknown>): void;
    agent(agentId: string, message: string, meta?: Record<string, unknown>): void;
    log(level: LogLevel, category: string, message: string, metadata?: Record<string, unknown>): void;
    private writeConsole;
    private writeFile;
    private rotateFile;
    close(): Promise<void>;
    child(context: {
        sessionId?: string;
        agentId?: string;
    }): Logger;
}
export declare function getLogger(): Logger;
export declare function configureLogger(config: Partial<LoggerConfig>): void;
export default Logger;
//# sourceMappingURL=logger.d.ts.map