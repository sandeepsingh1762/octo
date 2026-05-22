// Caching System
// LRU cache for tool results and other data

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  size: number;
}

export interface CacheConfig {
  maxSize: number;       // Maximum entries
  maxMemory: number;     // Maximum memory in bytes (approximate)
  ttl: number;           // Time-to-live in ms (0 = no expiry)
  onEvict?: (key: string, value: unknown) => void;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 1000,
  maxMemory: 50 * 1024 * 1024,  // 50MB
  ttl: 5 * 60 * 1000,            // 5 minutes
};

export class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;
  private currentMemory = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  set(key: string, value: T): void {
    // Estimate size
    const size = this.estimateSize(value);

    // Check if we need to evict
    while (
      (this.cache.size >= this.config.maxSize || 
       this.currentMemory + size > this.config.maxMemory) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // Remove existing entry if present
    if (this.cache.has(key)) {
      const existing = this.cache.get(key)!;
      this.currentMemory -= existing.size;
      this.cache.delete(key);
    }

    // Add new entry
    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      size,
    };

    this.cache.set(key, entry);
    this.currentMemory += size;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (this.config.ttl > 0 && Date.now() - entry.createdAt > this.config.ttl) {
      this.delete(key);
      return undefined;
    }

    // Update access info
    entry.accessedAt = Date.now();
    entry.accessCount++;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    // Check TTL
    if (this.config.ttl > 0 && Date.now() - entry.createdAt > this.config.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (entry) {
      this.currentMemory -= entry.size;
      
      if (this.config.onEvict) {
        this.config.onEvict(key, entry.value);
      }
      
      return this.cache.delete(key);
    }
    
    return false;
  }

  clear(): void {
    if (this.config.onEvict) {
      for (const [key, entry] of this.cache) {
        this.config.onEvict(key, entry.value);
      }
    }
    
    this.cache.clear();
    this.currentMemory = 0;
  }

  private evictLRU(): void {
    // Get oldest accessed entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) {
      return 8;
    }

    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return 8;
    }

    if (typeof value === 'object') {
      // Rough estimate
      return JSON.stringify(value).length * 2;
    }

    return 100; // Default estimate
  }

  // Statistics
  getStats(): {
    size: number;
    memory: number;
    hitRate: number;
  } {
    let totalAccess = 0;
    let hits = 0;

    for (const entry of this.cache.values()) {
      if (entry.accessCount > 0) {
        hits++;
        totalAccess += entry.accessCount;
      }
    }

    return {
      size: this.cache.size,
      memory: this.currentMemory,
      hitRate: this.cache.size > 0 ? hits / this.cache.size : 0,
    };
  }

  // Iterate entries (for debugging)
  *entries(): IterableIterator<[string, T]> {
    for (const [key, entry] of this.cache) {
      yield [key, entry.value];
    }
  }

  // Get all keys
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  // Prune expired entries
  prune(): number {
    if (this.config.ttl === 0) return 0;

    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.config.ttl) {
        this.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

// Specialized cache for tool results
export class ToolCache extends LRUCache<string> {
  private cacheableTools: Set<string>;

  constructor(cacheableTools: string[] = []) {
    super({
      maxSize: 500,
      maxMemory: 20 * 1024 * 1024,  // 20MB
      ttl: 5 * 60 * 1000,            // 5 minutes
    });

    // Tools that are safe to cache (read-only)
    this.cacheableTools = new Set(cacheableTools.length > 0 ? cacheableTools : [
      'Read',
      'Glob',
      'Grep',
      'CodebaseMap',
      'SymbolFind',
      'SymbolReferences',
      'WebFetchClean',
      'WebFetchMarkdown',
    ]);
  }

  isCacheable(tool: string): boolean {
    return this.cacheableTools.has(tool);
  }

  getCacheKey(tool: string, params: Record<string, unknown>): string {
    // Create deterministic key from tool and params
    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${k}=${JSON.stringify(params[k])}`)
      .join('&');
    
    return `${tool}:${sortedParams}`;
  }

  getToolResult(tool: string, params: Record<string, unknown>): string | undefined {
    if (!this.isCacheable(tool)) {
      return undefined;
    }
    
    const key = this.getCacheKey(tool, params);
    return this.get(key);
  }

  setToolResult(tool: string, params: Record<string, unknown>, result: string): void {
    if (!this.isCacheable(tool)) {
      return;
    }
    
    const key = this.getCacheKey(tool, params);
    this.set(key, result);
  }

  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let invalidated = 0;

    for (const key of this.keys()) {
      if (regex.test(key)) {
        this.delete(key);
        invalidated++;
      }
    }

    return invalidated;
  }
}

export default LRUCache;
