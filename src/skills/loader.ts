// Skill Loader
// Discovers and loads skills from various locations

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { glob } from "glob";
import type { Skill, SkillMetadata, SkillTriggers, SkillScript, SKILL_PATHS } from "./types.js";

const DEFAULT_SKILL_PATHS = [
  '.octopus/skills/',
  path.join(os.homedir(), '.octopus', 'skills'),
  '.cursor/skills/',
  '.claude/skills/',
  '.agents/skills/',
];

export class SkillLoader {
  private skills: Map<string, Skill> = new Map();
  private searchPaths: string[];
  private workingDirectory: string;

  constructor(workingDirectory?: string, additionalPaths?: string[]) {
    this.workingDirectory = workingDirectory || process.cwd();
    this.searchPaths = [
      ...DEFAULT_SKILL_PATHS.map(p => 
        p.startsWith('.') ? path.join(this.workingDirectory, p) : p
      ),
      ...(additionalPaths || []),
    ];
  }

  async loadAll(): Promise<Skill[]> {
    this.skills.clear();

    for (const searchPath of this.searchPaths) {
      await this.loadFromPath(searchPath);
    }

    return Array.from(this.skills.values());
  }

  private async loadFromPath(searchPath: string): Promise<void> {
    try {
      // Check if path exists
      await fs.access(searchPath);
    } catch {
      return; // Path doesn't exist
    }

    // Find all SKILL.md files
    const skillFiles = await glob('**/SKILL.md', {
      cwd: searchPath,
      absolute: true,
    });

    for (const skillFile of skillFiles) {
      try {
        const skill = await this.loadSkill(skillFile);
        if (skill) {
          this.skills.set(skill.name, skill);
        }
      } catch (e) {
        console.error(`Failed to load skill from ${skillFile}:`, e);
      }
    }
  }

  private async loadSkill(skillFile: string): Promise<Skill | null> {
    const content = await fs.readFile(skillFile, 'utf-8');
    const skillDir = path.dirname(skillFile);

    // Parse frontmatter and content
    const { metadata, instructions } = this.parseSkillFile(content);

    if (!metadata.name) {
      // Use directory name as fallback
      metadata.name = path.basename(skillDir);
    }

    // Load scripts
    const scripts: SkillScript[] = [];
    if (metadata.scripts) {
      for (const scriptName of metadata.scripts) {
        const scriptPath = path.join(skillDir, 'scripts', scriptName);
        try {
          await fs.access(scriptPath);
          scripts.push({
            name: scriptName,
            path: scriptPath,
            language: this.detectScriptLanguage(scriptName),
          });
        } catch {
          // Script doesn't exist
        }
      }
    }

    // Also check for scripts directory
    const scriptsDir = path.join(skillDir, 'scripts');
    try {
      const scriptFiles = await fs.readdir(scriptsDir);
      for (const scriptFile of scriptFiles) {
        if (!scripts.some(s => s.name === scriptFile)) {
          scripts.push({
            name: scriptFile,
            path: path.join(scriptsDir, scriptFile),
            language: this.detectScriptLanguage(scriptFile),
          });
        }
      }
    } catch {
      // No scripts directory
    }

    // Load references
    const references: string[] = [];
    if (metadata.references) {
      for (const refName of metadata.references) {
        const refPath = path.join(skillDir, 'references', refName);
        try {
          await fs.access(refPath);
          references.push(refPath);
        } catch {
          // Reference doesn't exist
        }
      }
    }

    // Build triggers
    const triggers: SkillTriggers = {
      manual: true, // Default to manual
      automatic: metadata.triggers?.automatic || false,
      patterns: metadata.triggers?.patterns,
      keywords: metadata.triggers?.keywords,
      events: metadata.triggers?.events,
    };

    return {
      name: metadata.name,
      description: metadata.description || '',
      version: metadata.version || '1.0.0',
      author: metadata.author,
      triggers,
      instructions,
      scripts: scripts.length > 0 ? scripts : undefined,
      references: references.length > 0 ? references : undefined,
      path: skillDir,
      loadedAt: new Date(),
    };
  }

  private parseSkillFile(content: string): { metadata: SkillMetadata; instructions: string } {
    let metadata: SkillMetadata = {
      name: '',
      description: '',
      version: '1.0.0',
    };
    let instructions = content;

    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      instructions = frontmatterMatch[2].trim();

      // Simple YAML parsing (basic key: value)
      const lines = yaml.split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.slice(0, colonIndex).trim();
          let value = line.slice(colonIndex + 1).trim();
          
          // Handle arrays (simple format)
          if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1);
            (metadata as unknown as Record<string, unknown>)[key] = value.split(',').map(v => v.trim().replace(/['"]/g, ''));
          } else {
            (metadata as unknown as Record<string, unknown>)[key] = value.replace(/['"]/g, '');
          }
        }
      }
    } else {
      // Try to extract metadata from first heading/paragraph
      const nameMatch = content.match(/^#\s+(.+)$/m);
      if (nameMatch) {
        metadata.name = nameMatch[1];
      }

      const descMatch = content.match(/^#\s+.+\n+(.+?)(?:\n\n|$)/m);
      if (descMatch) {
        metadata.description = descMatch[1];
      }
    }

    return { metadata, instructions };
  }

  private detectScriptLanguage(filename: string): SkillScript['language'] {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.sh':
      case '.bash':
        return 'bash';
      case '.py':
        return 'python';
      case '.js':
      case '.mjs':
        return 'javascript';
      case '.ts':
        return 'typescript';
      default:
        return 'bash';
    }
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  findByTrigger(options: {
    event?: string;
    keyword?: string;
    pattern?: string;
  }): Skill[] {
    const matching: Skill[] = [];

    for (const skill of this.skills.values()) {
      // Skip non-automatic skills unless specifically triggered
      if (!skill.triggers.automatic) continue;

      // Check event
      if (options.event && skill.triggers.events?.includes(options.event as any)) {
        matching.push(skill);
        continue;
      }

      // Check keyword
      if (options.keyword && skill.triggers.keywords) {
        const keywordLower = options.keyword.toLowerCase();
        if (skill.triggers.keywords.some(k => keywordLower.includes(k.toLowerCase()))) {
          matching.push(skill);
          continue;
        }
      }

      // Check pattern
      if (options.pattern && skill.triggers.patterns) {
        const patternLower = options.pattern.toLowerCase();
        for (const p of skill.triggers.patterns) {
          // Simple glob matching
          const regex = new RegExp(
            '^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
            'i'
          );
          if (regex.test(patternLower)) {
            matching.push(skill);
            break;
          }
        }
      }
    }

    return matching;
  }

  async reload(): Promise<Skill[]> {
    return this.loadAll();
  }
}

export default SkillLoader;
