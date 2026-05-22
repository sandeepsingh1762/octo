// Session Management Types

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;  // For tool messages
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SessionContext {
  model: string;
  systemPrompt: string;
  tools: string[];
  workingDirectory: string;
  memories: string[];
}

export interface Session {
  id: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Conversation state
  messages: Message[];
  context: SessionContext;
  
  // Metadata
  tokensUsed: { input: number; output: number };
  cost: number;
  
  // Checkpoints
  checkpoints: SessionCheckpoint[];
}

export interface SessionCheckpoint {
  id: string;
  name?: string;
  timestamp: Date;
  messageCount: number;
  summary?: string;
}

export interface SessionSummary {
  id: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  preview: string;  // First message or summary
}

export interface SessionExport {
  version: string;
  exportedAt: Date;
  session: Session;
}
