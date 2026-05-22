// Error Handling & Recovery
// Comprehensive error handling for production

export type ErrorCategory = 
  | 'network'
  | 'api'
  | 'tool'
  | 'permission'
  | 'validation'
  | 'timeout'
  | 'rate_limit'
  | 'context_overflow'
  | 'unknown';

export interface ErrorResult {
  handled: boolean;
  retry: boolean;
  retryAfter?: number;     // milliseconds
  fallback?: unknown;
  message: string;
  category: ErrorCategory;
}

export interface ErrorHandlerConfig {
  maxRetries: number;
  retryBackoff: number;      // base backoff in ms
  retryBackoffMax: number;   // max backoff in ms
  onError?: (error: Error, category: ErrorCategory) => void;
}

const DEFAULT_CONFIG: ErrorHandlerConfig = {
  maxRetries: 3,
  retryBackoff: 1000,
  retryBackoffMax: 30000,
};

export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private retryCounts: Map<string, number> = new Map();

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  categorize(error: Error): ErrorCategory {
    const msg = error.message.toLowerCase();

    // Network errors
    if (msg.includes('network') || 
        msg.includes('econnrefused') || 
        msg.includes('enotfound') ||
        msg.includes('dns') ||
        msg.includes('socket')) {
      return 'network';
    }

    // Rate limiting
    if (msg.includes('429') || 
        msg.includes('rate limit') || 
        msg.includes('too many requests') ||
        msg.includes('quota')) {
      return 'rate_limit';
    }

    // API errors
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
      return 'api';
    }
    if (msg.includes('api') || msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      return 'api';
    }

    // Context overflow
    if (msg.includes('context') || 
        msg.includes('token') || 
        msg.includes('maximum') ||
        msg.includes('length exceeded')) {
      return 'context_overflow';
    }

    // Timeout
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
      return 'timeout';
    }

    // Permission
    if (msg.includes('permission') || 
        msg.includes('access denied') || 
        msg.includes('eacces') ||
        msg.includes('forbidden')) {
      return 'permission';
    }

    // Tool errors
    if (msg.includes('tool') || msg.includes('command failed')) {
      return 'tool';
    }

    // Validation
    if (msg.includes('invalid') || 
        msg.includes('validation') || 
        msg.includes('required') ||
        msg.includes('schema')) {
      return 'validation';
    }

    return 'unknown';
  }

  handle(error: Error, key?: string): ErrorResult {
    const category = this.categorize(error);
    const errorKey = key || error.message.slice(0, 50);

    // Notify callback
    if (this.config.onError) {
      this.config.onError(error, category);
    }

    // Get retry count
    const retries = (this.retryCounts.get(errorKey) || 0) + 1;
    this.retryCounts.set(errorKey, retries);

    // Calculate backoff
    const backoff = Math.min(
      this.config.retryBackoff * Math.pow(2, retries - 1),
      this.config.retryBackoffMax
    );

    // Handle by category
    switch (category) {
      case 'network':
        if (retries <= this.config.maxRetries) {
          return {
            handled: true,
            retry: true,
            retryAfter: backoff,
            message: `Network error, retrying in ${backoff}ms`,
            category,
          };
        }
        return {
          handled: false,
          retry: false,
          message: 'Network error persists after max retries',
          category,
        };

      case 'rate_limit':
        // Extract retry-after header if available
        const retryAfterMatch = error.message.match(/retry.?after[:\s]+(\d+)/i);
        const retryAfter = retryAfterMatch 
          ? parseInt(retryAfterMatch[1]) * 1000 
          : 60000;
        
        return {
          handled: true,
          retry: true,
          retryAfter,
          message: `Rate limited, waiting ${retryAfter / 1000}s`,
          category,
        };

      case 'api':
        if (retries <= this.config.maxRetries) {
          return {
            handled: true,
            retry: true,
            retryAfter: backoff,
            message: `API error, retrying in ${backoff}ms`,
            category,
          };
        }
        return {
          handled: false,
          retry: false,
          message: 'API error persists',
          category,
        };

      case 'context_overflow':
        return {
          handled: true,
          retry: false,
          message: 'Context overflow - need to compact',
          category,
        };

      case 'timeout':
        if (retries <= this.config.maxRetries) {
          return {
            handled: true,
            retry: true,
            retryAfter: backoff,
            message: `Timeout, retrying with longer wait`,
            category,
          };
        }
        return {
          handled: false,
          retry: false,
          message: 'Operation timed out',
          category,
        };

      case 'permission':
        return {
          handled: false,
          retry: false,
          message: 'Permission denied - requires user intervention',
          category,
        };

      case 'validation':
        return {
          handled: false,
          retry: false,
          message: `Validation error: ${error.message}`,
          category,
        };

      case 'tool':
        if (retries <= 1) {
          return {
            handled: true,
            retry: true,
            retryAfter: backoff,
            message: `Tool failed, retrying once`,
            category,
          };
        }
        return {
          handled: false,
          retry: false,
          message: `Tool error: ${error.message}`,
          category,
        };

      default:
        if (retries <= 1) {
          return {
            handled: true,
            retry: true,
            retryAfter: backoff,
            message: `Unknown error, attempting retry`,
            category,
          };
        }
        return {
          handled: false,
          retry: false,
          message: error.message,
          category,
        };
    }
  }

  resetRetries(key?: string): void {
    if (key) {
      this.retryCounts.delete(key);
    } else {
      this.retryCounts.clear();
    }
  }

  // Utility: wrap async function with error handling
  async wrap<T>(
    fn: () => Promise<T>,
    key?: string
  ): Promise<{ success: true; result: T } | { success: false; error: ErrorResult }> {
    try {
      const result = await fn();
      this.resetRetries(key);
      return { success: true, result };
    } catch (error) {
      const errorResult = this.handle(error as Error, key);
      
      if (errorResult.retry && errorResult.retryAfter) {
        await this.sleep(errorResult.retryAfter);
        return this.wrap(fn, key);
      }
      
      return { success: false, error: errorResult };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create specific error classes
export class OctopusError extends Error {
  category: ErrorCategory;
  retryable: boolean;

  constructor(message: string, category: ErrorCategory, retryable = false) {
    super(message);
    this.name = 'OctopusError';
    this.category = category;
    this.retryable = retryable;
  }
}

export class NetworkError extends OctopusError {
  constructor(message: string) {
    super(message, 'network', true);
    this.name = 'NetworkError';
  }
}

export class APIError extends OctopusError {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message, 'api', statusCode !== 401 && statusCode !== 403);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}

export class RateLimitError extends OctopusError {
  retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message, 'rate_limit', true);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ToolError extends OctopusError {
  toolName: string;

  constructor(message: string, toolName: string) {
    super(message, 'tool', false);
    this.name = 'ToolError';
    this.toolName = toolName;
  }
}

export class ValidationError extends OctopusError {
  field?: string;

  constructor(message: string, field?: string) {
    super(message, 'validation', false);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export default ErrorHandler;
