// DevOps Team Preset
// A team optimized for build, test, deploy, and operations tasks

import type { TeamDefinition, AgentRole } from "../types.js";

const builder: AgentRole = {
  id: 'builder',
  name: 'Build Engineer',
  description: 'Handles build processes and compilation',
  capabilities: ['building', 'compilation', 'dependency management'],
  tools: ['Bash', 'Read', 'Glob'],
  systemPrompt: `You are a build engineer.
Handle build processes and compilation.
Manage dependencies.
Troubleshoot build failures.
Optimize build performance.`,
};

const tester: AgentRole = {
  id: 'test-runner',
  name: 'Test Runner',
  description: 'Executes tests and analyzes results',
  capabilities: ['test execution', 'test analysis', 'coverage'],
  tools: ['Bash', 'TestRun', 'Read'],
  systemPrompt: `You are a test automation engineer.
Run test suites and analyze results.
Identify failing tests and their causes.
Report test coverage.
Suggest fixes for test failures.`,
};

const deployer: AgentRole = {
  id: 'deployer',
  name: 'Deployment Engineer',
  description: 'Handles deployments and releases',
  capabilities: ['deployment', 'release management', 'rollback'],
  tools: ['Bash', 'Read', 'Write'],
  systemPrompt: `You are a deployment engineer.
Handle deployments to various environments.
Ensure deployment safety.
Be prepared to rollback if needed.
Document deployment steps.`,
};

const monitor: AgentRole = {
  id: 'monitor',
  name: 'Operations Monitor',
  description: 'Monitors systems and checks health',
  capabilities: ['monitoring', 'health checks', 'alerting'],
  tools: ['Bash', 'WebFetchClean', 'Read'],
  systemPrompt: `You are an operations monitor.
Monitor system health and performance.
Check service availability.
Identify potential issues.
Report status clearly.`,
};

const configManager: AgentRole = {
  id: 'config-manager',
  name: 'Configuration Manager',
  description: 'Manages configuration and environment settings',
  capabilities: ['configuration', 'environment management', 'secrets'],
  tools: ['Read', 'Write', 'Bash', 'Glob'],
  systemPrompt: `You are a configuration manager.
Manage configuration files and environment variables.
Ensure consistency across environments.
Handle secrets securely (never expose them).
Document configuration changes.`,
};

const coordinator: AgentRole = {
  id: 'devops-lead',
  name: 'DevOps Lead',
  description: 'Coordinates DevOps activities and ensures pipeline health',
  capabilities: ['coordination', 'pipeline management', 'incident response'],
  tools: ['Read', 'Bash'],
  systemPrompt: `You are the DevOps lead.
Coordinate build, test, and deployment activities.
Ensure pipeline reliability.
Respond to incidents.
Maintain infrastructure as code.`,
};

export const devopsTeam: TeamDefinition = {
  id: 'devops-team',
  name: 'DevOps Team',
  description: 'A team specialized in build, test, deployment, and operations',
  pattern: 'pipeline', // DevOps often works as a pipeline
  coordinator,
  specialists: new Map([
    ['builder', builder],
    ['test-runner', tester],
    ['deployer', deployer],
    ['monitor', monitor],
    ['config-manager', configManager],
  ]),
  defaultTimeout: 180000, // 3 minutes per agent (deployments can take time)
};

export default devopsTeam;
