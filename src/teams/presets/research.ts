// Research Team Preset
// A team optimized for information gathering and research tasks

import type { TeamDefinition, AgentRole } from "../types.js";

const webResearcher: AgentRole = {
  id: 'web-researcher',
  name: 'Web Researcher',
  description: 'Searches and gathers information from the web',
  capabilities: ['web search', 'information gathering', 'source evaluation'],
  tools: ['WebSearchMulti', 'WebFetchClean', 'WebFetchMarkdown', 'WebSearchAndFetch'],
  systemPrompt: `You are a web researcher.
Search for relevant, accurate information.
Evaluate source credibility.
Cite your sources.
Summarize findings clearly.`,
};

const docReader: AgentRole = {
  id: 'doc-reader',
  name: 'Documentation Reader',
  description: 'Reads and analyzes documentation',
  capabilities: ['documentation analysis', 'technical reading'],
  tools: ['Read', 'WebFetchMarkdown', 'Glob', 'Grep'],
  systemPrompt: `You are a documentation specialist.
Read and understand technical documentation.
Extract key information and examples.
Identify relevant sections for the task at hand.`,
};

const codebaseExplorer: AgentRole = {
  id: 'codebase-explorer',
  name: 'Codebase Explorer',
  description: 'Explores and understands existing codebases',
  capabilities: ['code exploration', 'pattern recognition', 'architecture analysis'],
  tools: ['Read', 'Glob', 'Grep', 'CodebaseMap', 'SymbolFind', 'SymbolReferences'],
  systemPrompt: `You are a codebase explorer.
Navigate and understand code structures.
Identify patterns, conventions, and architecture.
Find relevant code examples.`,
};

const summarizer: AgentRole = {
  id: 'summarizer',
  name: 'Research Summarizer',
  description: 'Synthesizes and summarizes research findings',
  capabilities: ['summarization', 'synthesis', 'report writing'],
  tools: ['Read'],
  systemPrompt: `You are a research summarizer.
Synthesize information from multiple sources.
Create clear, actionable summaries.
Highlight key findings and recommendations.
Organize information logically.`,
};

const factChecker: AgentRole = {
  id: 'fact-checker',
  name: 'Fact Checker',
  description: 'Verifies information accuracy',
  capabilities: ['verification', 'fact checking', 'source validation'],
  tools: ['WebSearchMulti', 'WebFetchClean', 'Read'],
  systemPrompt: `You are a fact checker.
Verify claims against reliable sources.
Identify potential inaccuracies.
Cross-reference information.
Report confidence levels.`,
};

const coordinator: AgentRole = {
  id: 'research-lead',
  name: 'Research Lead',
  description: 'Coordinates research efforts and ensures comprehensive coverage',
  capabilities: ['coordination', 'research planning', 'quality control'],
  tools: ['Read', 'WebSearchMulti'],
  systemPrompt: `You are the research lead.
Plan and coordinate research activities.
Ensure comprehensive coverage of the topic.
Validate research quality.
Synthesize team findings into coherent reports.`,
};

export const researchTeam: TeamDefinition = {
  id: 'research-team',
  name: 'Research Team',
  description: 'A team specialized in information gathering, research, and analysis',
  pattern: 'supervisor',
  coordinator,
  specialists: new Map([
    ['web-researcher', webResearcher],
    ['doc-reader', docReader],
    ['codebase-explorer', codebaseExplorer],
    ['summarizer', summarizer],
    ['fact-checker', factChecker],
  ]),
  defaultTimeout: 90000, // 90 seconds per agent
};

export default researchTeam;
