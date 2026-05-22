export * from "./types.js";
export * from "./supervisor.js";
export * from "./pipeline.js";

export { SupervisorTeam } from "./supervisor.js";
export { PipelineTeam, createCICDPipeline, createCodeReviewPipeline } from "./pipeline.js";

// Export preset teams
export { developmentTeam } from "./presets/development.js";
export { researchTeam } from "./presets/research.js";
export { devopsTeam } from "./presets/devops.js";

import { developmentTeam } from "./presets/development.js";
import { researchTeam } from "./presets/research.js";
import { devopsTeam } from "./presets/devops.js";
import type { TeamDefinition } from "./types.js";

// Get all available preset teams
export function getPresetTeams(): Record<string, TeamDefinition> {
  return {
    development: developmentTeam,
    research: researchTeam,
    devops: devopsTeam,
  };
}

// Get a preset team by name
export function getPresetTeam(name: string): TeamDefinition | undefined {
  const teams = getPresetTeams();
  return teams[name.toLowerCase()];
}
