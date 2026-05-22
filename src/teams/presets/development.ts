// Development Team Preset
// A team optimized for software development tasks

import type { TeamDefinition, AgentRole } from "../types.js";

const filePicker: AgentRole = {
  id: 'file-picker',
  name: 'File Picker',
  description: 'Finds and identifies relevant files in the codebase',
  capabilities: ['file search', 'pattern matching', 'codebase navigation'],
  tools: ['Glob', 'Read', 'CodebaseMap', 'SymbolFind', 'Grep'],
  systemPrompt: `You are a file picker agent specialized in finding relevant files.
Your job is to identify which files are relevant to a task.
Search thoroughly and provide clear paths to the files found.
Explain why each file is relevant.`,
};

const planner: AgentRole = {
  id: 'planner',
  name: 'Development Planner',
  description: 'Creates implementation plans and architectural decisions',
  capabilities: ['planning', 'design', 'architecture', 'research'],
  tools: ['Read', 'Glob', 'Grep', 'WebSearchMulti'],
  systemPrompt: `You are a development planner.
Your job is to create clear, actionable implementation plans.
Consider best practices, potential issues, and dependencies.
Break down complex tasks into manageable steps.`,
};

const coder: AgentRole = {
  id: 'coder',
  name: 'Developer',
  description: 'Writes, edits, and refactors code',
  capabilities: ['coding', 'implementation', 'refactoring', 'debugging'],
  tools: ['Read', 'Write', 'Edit', 'StrReplace', 'Glob', 'Grep', 'Bash', 'DiagnosticsGet', 'FormatCode'],
  systemPrompt: `You are a skilled developer.
Write clean, well-documented code following best practices.
Handle edge cases and error conditions properly.
Verify your changes work before completing.`,
};

const reviewer: AgentRole = {
  id: 'reviewer',
  name: 'Code Reviewer',
  description: 'Reviews code for quality, bugs, and best practices',
  capabilities: ['code review', 'quality assurance', 'bug detection'],
  tools: ['Read', 'Grep', 'DiagnosticsGet', 'TypeCheck', 'SymbolReferences'],
  systemPrompt: `You are a code reviewer.
Review code for:
- Correctness and potential bugs
- Security vulnerabilities
- Performance issues
- Code style and best practices
- Maintainability
Provide specific, actionable feedback.`,
};

const tester: AgentRole = {
  id: 'tester',
  name: 'Tester',
  description: 'Writes and runs tests',
  capabilities: ['testing', 'test writing', 'test analysis'],
  tools: ['Read', 'Write', 'Bash', 'TestRun', 'TestGenerate'],
  systemPrompt: `You are a testing specialist.
Write comprehensive tests covering:
- Happy paths
- Edge cases
- Error conditions
Ensure tests are maintainable and clearly document expected behavior.`,
};

const coordinator: AgentRole = {
  id: 'lead-developer',
  name: 'Lead Developer',
  description: 'Coordinates the development team and makes architectural decisions',
  capabilities: ['coordination', 'planning', 'decision making', 'review'],
  tools: ['Read', 'Glob', 'Grep'],
  systemPrompt: `You are the lead developer coordinating this team.
Analyze tasks and delegate to the appropriate team members.
Ensure quality standards are met.
Synthesize results from team members into coherent deliverables.`,
};

export const developmentTeam: TeamDefinition = {
  id: 'development-team',
  name: 'Development Team',
  description: 'A full-stack development team for building and maintaining software',
  pattern: 'supervisor',
  coordinator,
  specialists: new Map([
    ['file-picker', filePicker],
    ['planner', planner],
    ['coder', coder],
    ['reviewer', reviewer],
    ['tester', tester],
  ]),
  defaultTimeout: 120000, // 2 minutes per agent
};

export default developmentTeam;
