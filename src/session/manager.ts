// Session Manager
// Save, load, and manage conversation sessions

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import type {
  Session,
  SessionSummary,
  SessionCheckpoint,
  SessionContext,
  Message,
  SessionExport,
} from "./types.js";

function generateId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class SessionManager {
  private currentSession: Session | null = null;
  private sessionsDir: string;

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir || path.join(os.homedir(), '.octopus', 'sessions');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  // Create a new session
  create(context: Partial<SessionContext> = {}): Session {
    const session: Session = {
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      messages: [],
      context: {
        model: context.model || 'default',
        systemPrompt: context.systemPrompt || '',
        tools: context.tools || [],
        workingDirectory: context.workingDirectory || process.cwd(),
        memories: context.memories || [],
      },
      tokensUsed: { input: 0, output: 0 },
      cost: 0,
      checkpoints: [],
    };

    this.currentSession = session;
    return session;
  }

  // Get current session
  getCurrent(): Session | null {
    return this.currentSession;
  }

  // Add message to current session
  addMessage(message: Omit<Message, 'id' | 'timestamp'>): Message {
    if (!this.currentSession) {
      this.create();
    }

    const fullMessage: Message = {
      ...message,
      id: generateId(),
      timestamp: new Date(),
    };

    this.currentSession!.messages.push(fullMessage);
    this.currentSession!.updatedAt = new Date();

    return fullMessage;
  }

  // Update token usage
  updateTokens(input: number, output: number, cost: number = 0): void {
    if (this.currentSession) {
      this.currentSession.tokensUsed.input += input;
      this.currentSession.tokensUsed.output += output;
      this.currentSession.cost += cost;
    }
  }

  // Save current session
  async save(name?: string): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to save');
    }

    if (name) {
      this.currentSession.name = name;
    }

    const filename = `${this.currentSession.id}.json`;
    const filepath = path.join(this.sessionsDir, filename);

    await fs.writeFile(
      filepath,
      JSON.stringify(this.currentSession, null, 2),
      'utf-8'
    );

    return this.currentSession.id;
  }

  // Load a session
  async load(idOrName: string): Promise<Session | null> {
    // Try by ID first
    const byIdPath = path.join(this.sessionsDir, `${idOrName}.json`);
    try {
      const data = await fs.readFile(byIdPath, 'utf-8');
      const session = JSON.parse(data) as Session;
      
      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      session.messages.forEach(m => m.timestamp = new Date(m.timestamp));
      session.checkpoints.forEach(c => c.timestamp = new Date(c.timestamp));

      this.currentSession = session;
      return session;
    } catch {
      // Not found by ID, try by name
    }

    // Search by name
    const sessions = await this.list();
    const byName = sessions.find(s => s.name === idOrName);
    if (byName) {
      return this.load(byName.id);
    }

    return null;
  }

  // List all saved sessions
  async list(): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];

    try {
      const files = await fs.readdir(this.sessionsDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const filepath = path.join(this.sessionsDir, file);
          const data = await fs.readFile(filepath, 'utf-8');
          const session = JSON.parse(data) as Session;

          const firstUserMessage = session.messages.find(m => m.role === 'user');
          const preview = firstUserMessage?.content.slice(0, 100) || '(empty)';

          summaries.push({
            id: session.id,
            name: session.name,
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt),
            messageCount: session.messages.length,
            preview,
          });
        } catch {
          // Skip corrupted files
        }
      }
    } catch {
      // Directory doesn't exist
    }

    // Sort by most recent
    summaries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return summaries;
  }

  // Delete a session
  async delete(idOrName: string): Promise<boolean> {
    const filepath = path.join(this.sessionsDir, `${idOrName}.json`);
    
    try {
      await fs.unlink(filepath);
      
      if (this.currentSession?.id === idOrName) {
        this.currentSession = null;
      }
      
      return true;
    } catch {
      // Try by name
      const sessions = await this.list();
      const byName = sessions.find(s => s.name === idOrName);
      if (byName) {
        return this.delete(byName.id);
      }
      return false;
    }
  }

  // Clear current session (start fresh)
  clear(): void {
    this.currentSession = null;
  }

  // Create a checkpoint
  createCheckpoint(name?: string): SessionCheckpoint | null {
    if (!this.currentSession) return null;

    const checkpoint: SessionCheckpoint = {
      id: generateId(),
      name,
      timestamp: new Date(),
      messageCount: this.currentSession.messages.length,
    };

    this.currentSession.checkpoints.push(checkpoint);
    return checkpoint;
  }

  // Restore to a checkpoint
  restoreCheckpoint(checkpointId: string): boolean {
    if (!this.currentSession) return false;

    const checkpoint = this.currentSession.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) return false;

    // Truncate messages to checkpoint
    this.currentSession.messages = this.currentSession.messages.slice(0, checkpoint.messageCount);
    
    // Remove checkpoints after this one
    const checkpointIndex = this.currentSession.checkpoints.indexOf(checkpoint);
    this.currentSession.checkpoints = this.currentSession.checkpoints.slice(0, checkpointIndex + 1);

    return true;
  }

  // Fork current session (create copy with new ID)
  fork(): Session | null {
    if (!this.currentSession) return null;

    const forked: Session = {
      ...JSON.parse(JSON.stringify(this.currentSession)),
      id: generateId(),
      name: this.currentSession.name ? `${this.currentSession.name} (fork)` : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      checkpoints: [],
    };

    // Convert dates
    forked.messages.forEach(m => m.timestamp = new Date(m.timestamp));

    return forked;
  }

  // Export session
  async export(format: 'json' | 'markdown' = 'json'): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to export');
    }

    if (format === 'markdown') {
      return this.exportAsMarkdown();
    }

    const exported: SessionExport = {
      version: '1.0',
      exportedAt: new Date(),
      session: this.currentSession,
    };

    return JSON.stringify(exported, null, 2);
  }

  private exportAsMarkdown(): string {
    if (!this.currentSession) return '';

    const lines: string[] = [
      `# Session: ${this.currentSession.name || this.currentSession.id}`,
      '',
      `Created: ${this.currentSession.createdAt.toISOString()}`,
      `Messages: ${this.currentSession.messages.length}`,
      `Tokens: ${this.currentSession.tokensUsed.input + this.currentSession.tokensUsed.output}`,
      '',
      '---',
      '',
    ];

    for (const message of this.currentSession.messages) {
      const roleLabel = message.role === 'user' ? '**User**' : 
                       message.role === 'assistant' ? '**Assistant**' :
                       message.role === 'system' ? '*System*' :
                       `*Tool: ${message.name}*`;
      
      lines.push(`### ${roleLabel}`);
      lines.push('');
      lines.push(message.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  // Import session
  async import(data: string): Promise<Session> {
    const parsed = JSON.parse(data) as SessionExport | Session;

    let session: Session;
    if ('session' in parsed) {
      session = parsed.session;
    } else {
      session = parsed;
    }

    // Generate new ID
    session.id = generateId();
    session.createdAt = new Date(session.createdAt);
    session.updatedAt = new Date();
    session.messages.forEach(m => m.timestamp = new Date(m.timestamp));
    session.checkpoints.forEach(c => c.timestamp = new Date(c.timestamp));

    this.currentSession = session;
    await this.save();

    return session;
  }

  // Get messages for LLM context
  getContextMessages(limit?: number): Message[] {
    if (!this.currentSession) return [];

    const messages = this.currentSession.messages;
    if (limit && messages.length > limit) {
      return messages.slice(-limit);
    }
    return messages;
  }

  // Get session statistics
  getStats(): {
    messageCount: number;
    tokensUsed: { input: number; output: number };
    cost: number;
    duration: number;
    checkpoints: number;
  } | null {
    if (!this.currentSession) return null;

    return {
      messageCount: this.currentSession.messages.length,
      tokensUsed: this.currentSession.tokensUsed,
      cost: this.currentSession.cost,
      duration: Date.now() - this.currentSession.createdAt.getTime(),
      checkpoints: this.currentSession.checkpoints.length,
    };
  }
}

export default SessionManager;
