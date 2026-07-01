/**
 * Knowledge Base — built-in library of methodologies.
 *
 * Organized as a directory tree:
 *   knowledge/stages/<stage>/skills/<skill>/{instruction.md, templates/}
 *
 * Each skill contains:
 *   - instruction.md: methodology guidance (OpenSpec-style / BMAD-style)
 *   - templates/: artifact format templates
 *   - gate.yaml (at the stage level): entry/exit criteria
 *
 * Ships with a default knowledge-base (port of OpenSpec instructions +
 * key BMAD skills). Users can extend/override by placing files in
 * .spec-graph/knowledge/.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Skill {
  id: string;
  stage: string;
  /** Full content of instruction.md */
  instruction: string;
  /** template name → content (e.g., "proposal.md" → "# Proposal:...") */
  templates: Record<string, string>;
  metadata: {
    source: 'openspec' | 'bmad' | 'native' | 'user';
    tags: string[];
  };
}

export interface StageInfo {
  id: string;
  gate: {
    entry: Array<{ id: string; description: string }>;
    exit: Array<{ id: string; description: string }>;
  };
  skills: Skill[];
}

export interface KnowledgeBase {
  skills: Map<string, Skill>; // skillId → Skill
  stageInfo: Map<string, StageInfo>; // stageId → StageInfo
  stages: string[];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Load the full knowledge-base from a root directory.
 *
 * Scans: knowledge/stages/<stage>/skills/<skill>/instruction.md
 * Optionally merges overrides from a local directory.
 *
 * @param knowledgeBasePath — path to knowledge/ directory
 * @param localOverridePath — path to .spec-graph/knowledge/ (user overrides)
 */
export function loadKnowledgeBase(
  knowledgeBasePath?: string,
  localOverridePath?: string
): KnowledgeBase {
  const kb: KnowledgeBase = {
    skills: new Map(),
    stageInfo: new Map(),
    stages: [],
  };

  const basePath = knowledgeBasePath || defaultKnowledgePath();
  const stagesPath = path.join(basePath, 'stages');

  if (!fs.existsSync(stagesPath)) {
    console.warn(`[knowledge-base] stages path not found: ${stagesPath}`);
    return kb;
  }

  const stageDirs = fs
    .readdirSync(stagesPath, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const stageDir of stageDirs) {
    const stageId = stageDir.name;
    kb.stages.push(stageId);
    const stageInfo: StageInfo = {
      id: stageId,
      gate: { entry: [], exit: [] },
      skills: [],
    };

    // Load gate.yaml if present
    const gatePath = path.join(stagesPath, stageId, 'gate.yaml');
    if (fs.existsSync(gatePath)) {
      const gateYaml = fs.readFileSync(gatePath, 'utf-8');
      const gate = parseGateYaml(gateYaml);
      stageInfo.gate = gate;
    }

    // Load skills
    const skillsPath = path.join(stagesPath, stageId, 'skills');
    if (fs.existsSync(skillsPath)) {
      const skillDirs = fs
        .readdirSync(skillsPath, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      for (const skillDir of skillDirs) {
        const skillId = skillDir.name;
        const skill = loadSkill(skillsPath, skillId, stageId);
        if (skill) {
          stageInfo.skills.push(skill);
          kb.skills.set(skillId, skill);
        }
      }
    }

    kb.stageInfo.set(stageId, stageInfo);
  }

  // Apply local overrides
  if (localOverridePath && fs.existsSync(localOverridePath)) {
    mergeOverrides(kb, localOverridePath);
  }

  return kb;
}

/**
 * Select the best matching skill for a stage + intent.
 *
 * Strategy:
 *   1. If only one skill exists for the stage, return it.
 *   2. If intent keywords match a skill's tags, prefer that skill.
 *   3. Otherwise, return the first skill for the stage.
 */
export function selectSkill(
  kb: KnowledgeBase,
  stage: string,
  intent: string
): Skill | null {
  const stageSkills = Array.from(kb.skills.values()).filter(
    (s) => s.stage === stage
  );

  if (stageSkills.length === 0) return null;
  if (stageSkills.length === 1) return stageSkills[0];

  // Keyword matching: if intent contains a skill's tag, prefer it
  const lowerIntent = intent.toLowerCase();
  for (const skill of stageSkills) {
    for (const tag of skill.metadata.tags) {
      if (lowerIntent.includes(tag)) return skill;
    }
  }

  return stageSkills[0];
}

/**
 * List all skills for a stage.
 */
export function getSkillsForStage(kb: KnowledgeBase, stage: string): Skill[] {
  return Array.from(kb.skills.values()).filter((s) => s.stage === stage);
}

/**
 * Get a stage's gate configuration (entry + exit criteria).
 */
export function getStageGate(
  kb: KnowledgeBase,
  stage: string
): { entry: Array<{ id: string; description: string }>; exit: Array<{ id: string; description: string }> } | null {
  return kb.stageInfo.get(stage)?.gate || null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultKnowledgePath(): string {
  // Default: shipped with the package
  return path.join(__dirname, '..', '..', 'knowledge');
}

function loadSkill(
  skillsPath: string,
  skillId: string,
  stageId: string
): Skill | null {
  const skillDir = path.join(skillsPath, skillId);
  if (!fs.existsSync(skillDir)) return null;

  let instruction = '';
  const instructionPath = path.join(skillDir, 'instruction.md');
  if (fs.existsSync(instructionPath)) {
    instruction = fs.readFileSync(instructionPath, 'utf-8');
  }

  const templates: Record<string, string> = {};
  const templatesDir = path.join(skillDir, 'templates');
  if (fs.existsSync(templatesDir)) {
    const templateFiles = fs
      .readdirSync(templatesDir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith('.md'));
    for (const tf of templateFiles) {
      templates[tf.name] = fs.readFileSync(
        path.join(templatesDir, tf.name),
        'utf-8'
      );
    }
  }

  // Heuristic: classify source based on skill name patterns
  const source = classifySource(skillId, instruction);

  // Extract tags from instruction content (simple keyword extraction)
  const tags = extractTags(skillId, instruction);

  return {
    id: skillId,
    stage: stageId,
    instruction,
    templates,
    metadata: { source, tags },
  };
}

function classifySource(
  skillId: string,
  instruction: string
): 'openspec' | 'bmad' | 'native' | 'user' {
  // OpenSpec-style skills: proposal, specs, design, tasks, requirement-analysis, etc.
  const openSpecSkills = [
    'requirement-analysis',
    'specs-authoring',
    'design-authoring',
    'task-decomposition',
  ];
  if (openSpecSkills.includes(skillId)) return 'openspec';

  // BMAD-style skills: security, review, etc.
  if (
    instruction.includes('review') ||
    instruction.includes('brainstorm') ||
    instruction.includes('expert')
  )
    return 'bmad';

  return 'native';
}

function extractTags(skillId: string, instruction: string): string[] {
  const tags: string[] = [];
  const tagHints: Record<string, string[]> = {
    'requirement-analysis': ['proposal', 'specify', 'requirements'],
    'specs-authoring': ['specs', 'requirements', 'delta'],
    'design-authoring': ['design', 'architecture', 'decisions'],
    'task-decomposition': ['tasks', 'planning', 'checklist'],
    'code-generation': ['code', 'implementation', 'typescript'],
    'code-review': ['review', 'security', 'quality'],
    'test-strategy': ['test', 'coverage', 'edge-cases'],
    'e2e-verification': ['acceptance', 'e2e', 'verification'],
    'ci-integration': ['ci', 'deploy', 'pr'],
  };
  return tagHints[skillId] || [];
}

// ---------------------------------------------------------------------------
// Gate YAML parser (knowledge-base specific)
// ---------------------------------------------------------------------------

function parseGateYaml(yaml: string): {
  entry: Array<{ id: string; description: string }>;
  exit: Array<{ id: string; description: string }>;
} {
  const result = {
    entry: [] as Array<{ id: string; description: string }>,
    exit: [] as Array<{ id: string; description: string }>,
  };

  let section: 'entry' | 'exit' | null = null;
  let current: { id: string; description: string } | null = null;

  for (const line of yaml.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;

    const sectionMatch = line.match(/^(\w+):\s*$/);
    if (sectionMatch && (sectionMatch[1] === 'entry' || sectionMatch[1] === 'exit')) {
      section = sectionMatch[1];
      continue;
    }

    if (section) {
      const idMatch = line.match(/^\s{2}-\s+id:\s*(.+)/);
      if (idMatch && idMatch[1]) {
        if (current?.id) result[section].push(current);
        current = { id: idMatch[1].trim(), description: '' };
      } else if (current && line.match(/^\s{4}description:\s*(.+)/)) {
        const descMatch = line.match(/^\s{4}description:\s*(.+)/);
        if (descMatch && descMatch[1]) current.description = descMatch[1].trim();
      }
    }
  }
  if (section && current?.id) result[section].push(current);

  return result;
}

// ---------------------------------------------------------------------------
// Local overrides
// ---------------------------------------------------------------------------

function mergeOverrides(kb: KnowledgeBase, localPath: string): void {
  // Scan for user-added skills and override existing ones
  if (!fs.existsSync(localPath)) return;

  const stageDirs = fs
    .readdirSync(localPath, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const stageDir of stageDirs) {
    const skillsPath = path.join(localPath, stageDir.name, 'skills');
    if (!fs.existsSync(skillsPath)) continue;

    const skillDirs = fs
      .readdirSync(skillsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const skillDir of skillDirs) {
      const skill = loadSkill(skillsPath, skillDir.name, stageDir.name);
      if (skill) {
        skill.metadata.source = 'user';
        kb.skills.set(skill.id, skill);

        const stageInfo = kb.stageInfo.get(stageDir.name);
        if (stageInfo) {
          const existingIdx = stageInfo.skills.findIndex(
            (s) => s.id === skill.id
          );
          if (existingIdx >= 0) {
            stageInfo.skills[existingIdx] = skill;
          } else {
            stageInfo.skills.push(skill);
          }
        }
      }
    }
  }
}
