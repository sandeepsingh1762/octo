// Skill Executor
// Executes skills and their scripts

import * as fs from "fs/promises";
import * as path from "path";
import * as child_process from "child_process";
import type { Skill, SkillContext, SkillResult, SkillScript } from "./types.js";

export interface SkillExecutorConfig {
  workingDirectory: string;
  timeout?: number;
  onOutput?: (output: string) => void;
}

export class SkillExecutor {
  private config: SkillExecutorConfig;

  constructor(config: SkillExecutorConfig) {
    this.config = config;
  }

  async execute(skill: Skill, context: SkillContext): Promise<SkillResult> {
    try {
      // Build the complete instructions with context
      let instructions = skill.instructions;

      // Replace placeholders
      instructions = this.replacePlaceholders(instructions, context);

      // Load references and append
      if (skill.references && skill.references.length > 0) {
        const refContents = await this.loadReferences(skill.references);
        if (refContents) {
          instructions += '\n\n## References\n\n' + refContents;
        }
      }

      // Execute scripts if needed
      const scriptOutputs: string[] = [];
      if (skill.scripts && skill.scripts.length > 0) {
        for (const script of skill.scripts) {
          const output = await this.executeScript(script, context);
          if (output) {
            scriptOutputs.push(`### ${script.name}\n${output}`);
          }
        }
      }

      if (scriptOutputs.length > 0) {
        instructions += '\n\n## Script Outputs\n\n' + scriptOutputs.join('\n\n');
      }

      return {
        success: true,
        instructions,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private replacePlaceholders(text: string, context: SkillContext): string {
    let result = text;

    // Standard placeholders
    const placeholders: Record<string, string | undefined> = {
      '{{currentFile}}': context.currentFile,
      '{{selectedText}}': context.selectedText,
      '{{workingDirectory}}': context.workingDirectory,
      '{{userPrompt}}': context.userPrompt,
      '{{event}}': context.event,
    };

    for (const [placeholder, value] of Object.entries(placeholders)) {
      if (value !== undefined) {
        result = result.replace(new RegExp(placeholder, 'g'), value);
      }
    }

    // Arguments
    if (context.arguments) {
      for (const [key, value] of Object.entries(context.arguments)) {
        result = result.replace(new RegExp(`{{args\\.${key}}}`, 'g'), value);
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }

    return result;
  }

  private async loadReferences(references: string[]): Promise<string> {
    const contents: string[] = [];

    for (const refPath of references) {
      try {
        const content = await fs.readFile(refPath, 'utf-8');
        const filename = path.basename(refPath);
        contents.push(`### ${filename}\n\n${content}`);
      } catch (e) {
        // Skip missing references
      }
    }

    return contents.join('\n\n');
  }

  private async executeScript(script: SkillScript, context: SkillContext): Promise<string | null> {
    return new Promise((resolve) => {
      let command: string;
      const args: string[] = [];

      switch (script.language) {
        case 'bash':
          command = 'bash';
          args.push(script.path);
          break;
        case 'python':
          command = 'python';
          args.push(script.path);
          break;
        case 'javascript':
          command = 'node';
          args.push(script.path);
          break;
        case 'typescript':
          command = 'npx';
          args.push('tsx', script.path);
          break;
        default:
          resolve(null);
          return;
      }

      // Add context as environment variables
      const env: Record<string, string> = {
        ...process.env,
        OCTOPUS_WORKING_DIR: context.workingDirectory,
        OCTOPUS_EVENT: context.event || '',
      };

      if (context.currentFile) {
        env.OCTOPUS_CURRENT_FILE = context.currentFile;
      }
      if (context.userPrompt) {
        env.OCTOPUS_USER_PROMPT = context.userPrompt;
      }

      const proc = child_process.spawn(command, args, {
        cwd: context.workingDirectory,
        env,
        timeout: this.config.timeout || 30000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        if (this.config.onOutput) {
          this.config.onOutput(text);
        }
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || null);
        } else {
          resolve(stderr ? `Error: ${stderr}` : null);
        }
      });

      proc.on('error', (error) => {
        resolve(`Error: ${error.message}`);
      });
    });
  }

  // Run a specific script from a skill
  async runScript(skill: Skill, scriptName: string, context: SkillContext): Promise<string | null> {
    const script = skill.scripts?.find(s => s.name === scriptName);
    if (!script) {
      return null;
    }
    return this.executeScript(script, context);
  }
}

export default SkillExecutor;
