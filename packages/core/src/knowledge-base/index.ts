/**
 * Knowledge Base — built-in library of methodologies.
 *
 * Organized as a directory tree:
 *   knowledge/stages/<stage>/skills/<skill>/{instruction.md, templates/}
 *
 * Each skill contains:
 *   - instruction.md: methodology guidance (OpenSpec-style / BMAD-style)
 *   - templates/: artifact format templates
 *
 * Ships with a default knowledge-base (port of OpenSpec instructions +
 * key BMAD skills). Users can extend/override by placing files in
 * .spec-graph/knowledge/.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Skill {
  id: string;
  stage: string;
  instruction: string;
  templates: Record<string, string>; // templateName → content
  metadata: {
    source: 'openspec' | 'bmad' | 'native' | 'user';
    tags: string[];
  };
}

export interface KnowledgeBase {
  skills: Map<string, Skill>;
  stages: string[];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  // TODO: read knowledge/ directory tree + .spec-graph/knowledge/ overrides
  throw new Error('knowledge-base.loadKnowledgeBase not yet implemented');
}

export function selectSkill(
  kb: KnowledgeBase,
  stage: string,
  intent: string
): Skill | null {
  // TODO: match skills by stage + intent relevance
  throw new Error('knowledge-base.selectSkill not yet implemented');
}

export function getSkillsForStage(kb: KnowledgeBase, stage: string): Skill[] {
  return Array.from(kb.skills.values()).filter((s) => s.stage === stage);
}
