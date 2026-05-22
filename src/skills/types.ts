// Skills System Types
// Compatible with Agent Skills Open Standard (Cursor, Claude Code, OpenCode)

export interface Skill {
  name: string;
  description: string;
  version: string;
  author?: string;
  
  // When to trigger
  triggers: SkillTriggers;
  
  // What the skill provides
  instructions: string;
  scripts?: SkillScript[];
  references?: string[];
  assets?: string[];
  
  // Metadata
  path: string;
  loadedAt: Date;
}

export interface SkillTriggers {
  manual: boolean;               // /skill-name
  automatic: boolean;            // Agent decides
  patterns?: string[];           // File patterns (globs)
  keywords?: string[];           // Keywords in prompt
  events?: SkillEvent[];         // Agent events
}

export type SkillEvent = 
  | 'session:start'
  | 'file:open'
  | 'file:save'
  | 'error:lint'
  | 'error:build'
  | 'error:test'
  | 'commit:before'
  | 'commit:after';

export interface SkillScript {
  name: string;
  path: string;
  description?: string;
  language: 'bash' | 'python' | 'javascript' | 'typescript';
}

export interface SkillMetadata {
  // Parsed from SKILL.md frontmatter
  name: string;
  description: string;
  version: string;
  author?: string;
  triggers?: Partial<SkillTriggers>;
  scripts?: string[];
  references?: string[];
}

export interface SkillContext {
  // Current state
  currentFile?: string;
  selectedText?: string;
  workingDirectory: string;
  
  // Event that triggered skill
  event?: SkillEvent;
  eventData?: unknown;
  
  // User input
  userPrompt?: string;
  userMessage?: string;
  arguments?: Record<string, string>;
  
  // Session info
  sessionId?: string;
}

export interface SkillResult {
  success: boolean;
  output?: string;
  instructions?: string;
  toolCalls?: Array<{ tool: string; params: Record<string, unknown> }>;
  error?: string;
}

// Skill file structure
export const SKILL_PATHS = [
  '.octopus/skills/',           // Project skills
  '~/.octopus/skills/',         // User skills
  '.cursor/skills/',            // Cursor compatibility
  '.claude/skills/',            // Claude Code compatibility
  '.agents/skills/',            // OpenCode compatibility
];
