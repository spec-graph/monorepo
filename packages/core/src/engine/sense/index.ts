/**
 * Sense Engine — Minimal Version
 *
 * Per architecture decision: spec-graph does NOT scan or analyze the project.
 * All analysis is the AI agent's responsibility.
 *
 * The agent:
 *   1. Reads project files itself (or spawns sub-agents)
 *   2. Analyzes tech stack, structure, dimensions
 *   3. Calls spec-graph init --stack X --build Y --profile-override "..."
 *
 * spec-graph only:
 *   - Receives parameters from the agent
 *   - Writes profile.yaml with those parameters
 *   - Does NOT scan files, does NOT collect signals, does NOT infer
 */

import { Profile, FactDimension, ProfileFact } from "../../types/index";

export interface SenseResult {
  profile: Profile;
  warnings: string[];
}

export interface SenseOptions {
  /** User's free-text description of the project (stored in profile for agent reference). */
  description?: string;
}

/**
 * Build a profile skeleton with all dimensions = unknown.
 *
 * The AI agent is expected to fill these via:
 *   - --stack (maps to language/build detection)
 *   - --build (maps to boundary/has_ui/deployment)
 *   - --profile-override (direct dimension overrides)
 */
export async function runSense(
  _projectRoot: string,
  options: SenseOptions = {},
): Promise<SenseResult> {
  const warnings: string[] = [];

  // All dimensions start as unknown — agent fills them via overrides
  const facts: Partial<Record<FactDimension, ProfileFact>> = {};
  const allDimensions: FactDimension[] = [
    "has_ui",
    "boundary",
    "topology",
    "deployment",
    "consumers",
    "field",
    "criticality",
    "team",
    "persistence",
  ];

  for (const dim of allDimensions) {
    facts[dim] = {
      value: "unknown",
      confidence: "low",
      source: "fallback",
      evidence: "Not analyzed by spec-graph — AI agent should provide via --stack / --build / --profile-override",
    };
  }

  if (options.description) {
    warnings.push(
      "Description stored in profile. AI agent should use it as context when filling dimensions.",
    );
  }

  const profile: Profile = {
    version: "1",
    meta: {
      created_at: new Date().toISOString(),
      source: {
        repo_scan: false,
        llm_classified: false,
      },
    },
    facts: facts as Record<FactDimension, ProfileFact>,
  };

  // Store description in overrides if provided (agent can read it)
  if (options.description) {
    (profile as any).description = options.description;
  }

  return { profile, warnings };
}
