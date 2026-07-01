/**
 * Prompt Construction — layered prompt generation with methodology weaving.
 *
 * Builds structured prompts with three priority layers:
 *   - MUST: task, acceptance criteria, project constraints
 *   - SHOULD: methodology guidance (woven from knowledge-base)
 *   - MAY: context (upstream artifacts, project profile, history)
 *
 * Output format uses XML-style tags. See knowledge/shared/prompt-schema.md
 * for the full schema specification.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MethodologyEntry {
  source: string; // skill id (e.g., "requirement-analysis")
  category: 'doc_methodology' | 'domain_methodology';
  content: string; // methodology text (from instruction.md)
}

export interface PreviousFailure {
  retryLevel: 1 | 2 | 3 | 4;
  similarToPrevious: boolean;
  failedCriteria: Array<{
    id: string;
    reason: string;
    evidence?: string;
    suggestedFix?: string;
  }>;
}

export interface PromptContext {
  // Required
  sessionId: string;
  stage: string;
  task: string;
  acceptanceCriteria: string[];
  projectConstraints: string[];
  outputSpec: {
    outputPath: string;
    templatePath?: string;
  };

  // Methodology (woven into SHOULD layer)
  methodologies: MethodologyEntry[];

  // Context (woven into MAY layer)
  upstreamArtifacts: Array<{ id: string; path: string; summary: string }>;
  projectProfile: string;
  similarTasks?: string;

  // Optional: present only when retrying after gate failure
  previousFailure?: PreviousFailure;
}

export interface BuiltPrompt {
  xml: string; // XML-style layered prompt ready for agent consumption
  metadata: {
    sessionId: string;
    stage: string;
    methodologySources: string[];
    hasPreviousFailure: boolean;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Build a layered XML prompt from the given context.
 *
 * The prompt follows the schema in knowledge/shared/prompt-schema.md:
 *   - MUST layer: task, acceptance_criteria, project_constraint, output_spec, self_check
 *   - SHOULD layer: methodology (doc + domain)
 *   - MAY layer: context (upstream artifacts, project profile, similar tasks)
 *   - Optional MUST: previous_failure (only when retrying)
 */
export function buildPrompt(context: PromptContext): BuiltPrompt {
  const lines: string[] = [];

  // Header
  lines.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<spec_graph_prompt version="1.0" session="${escapeXml(context.sessionId)}" stage="${escapeXml(context.stage)}">`,
    ``
  );

  // ─── MUST layer ──────────────────────────────────────────────────────────
  lines.push(
    `  <task level="MUST">`,
    `    ${escapeXml(context.task)}`,
    `  </task>`,
    ``
  );

  lines.push(
    `  <acceptance_criteria level="MUST">`,
    escapeXml(bulletList(context.acceptanceCriteria))
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
    `  </acceptance_criteria>`,
    ``
  );

  lines.push(
    `  <project_constraint level="MUST">`,
    escapeXml(bulletList(context.projectConstraints))
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
    `  </project_constraint>`,
    ``
  );

  // ─── SHOULD layer ────────────────────────────────────────────────────────
  lines.push(`  <methodology level="SHOULD">`);
  for (const m of context.methodologies) {
    lines.push(`    <${m.category} source="${escapeXml(m.source)}">`);
    const indented = escapeXml(m.content)
      .split('\n')
      .map((l) => `      ${l}`)
      .join('\n');
    lines.push(indented);
    lines.push(`    </${m.category}>`);
  }
  lines.push(`  </methodology>`, ``);

  // ─── MAY layer ───────────────────────────────────────────────────────────
  lines.push(`  <context level="MAY">`);

  if (context.upstreamArtifacts.length > 0) {
    lines.push(`    <upstream>`);
    for (const a of context.upstreamArtifacts) {
      lines.push(
        `      <artifact id="${escapeXml(a.id)}" path="${escapeXml(a.path)}">`,
        `        ${escapeXml(a.summary)}`,
        `      </artifact>`
      );
    }
    lines.push(`    </upstream>`);
  }

  lines.push(
    `    <project_profile>`,
    `      ${escapeXml(context.projectProfile)}`,
    `    </project_profile>`
  );

  if (context.similarTasks) {
    lines.push(
      `    <similar_tasks>`,
      `      ${escapeXml(context.similarTasks)}`,
      `    </similar_tasks>`
    );
  }

  lines.push(`  </context>`, ``);

  // ─── Optional MUST: previous_failure ─────────────────────────────────────
  if (context.previousFailure) {
    const pf = context.previousFailure;
    lines.push(`  <previous_failure level="MUST">`);
    lines.push(
      `    <diagnosis retry-level="${pf.retryLevel}" similar-to-previous="${pf.similarToPrevious}">`
    );
    lines.push(`      <failed_criteria>`);
    for (const c of pf.failedCriteria) {
      lines.push(`        <criterion id="${escapeXml(c.id)}">`);
      lines.push(`          <reason>${escapeXml(c.reason)}</reason>`);
      if (c.evidence) lines.push(`          <evidence>${escapeXml(c.evidence)}</evidence>`);
      if (c.suggestedFix) lines.push(`          <suggested_fix>${escapeXml(c.suggestedFix)}</suggested_fix>`);
      lines.push(`        </criterion>`);
    }
    lines.push(`      </failed_criteria>`);
    lines.push(`    </diagnosis>`);
    lines.push(``);
    lines.push(`    Please address the failed criteria in your next attempt.`);
    lines.push(`  </previous_failure>`, ``);
  }

  // ─── MUST: output_spec + self_check ──────────────────────────────────────
  lines.push(`  <output_spec level="MUST">`);
  lines.push(`    Write to: ${escapeXml(context.outputSpec.outputPath)}`);
  if (context.outputSpec.templatePath) {
    lines.push(`    Template: ${escapeXml(context.outputSpec.templatePath)}`);
  }
  lines.push(`  </output_spec>`, ``);

  lines.push(
    `  <self_check level="MUST">`,
    `    Before submitting, verify:`,
    `    - All acceptance criteria are met`,
    `    - Methodology guidance was followed (or deviations noted)`,
    `    - Output is at the specified path`,
    `    Return your self-check result in the structured format specified by the agent adapter.`,
    `  </self_check>`,
    ``
  );

  lines.push(`</spec_graph_prompt>`);

  const xml = lines.join('\n');

  return {
    xml,
    metadata: {
      sessionId: context.sessionId,
      stage: context.stage,
      methodologySources: context.methodologies.map((m) => m.source),
      hasPreviousFailure: !!context.previousFailure,
    },
  };
}

/**
 * Weave methodologies from the knowledge-base into a single string.
 *
 * Loads instruction.md for each skillId and returns the concatenated content,
 * tagged by category (doc_methodology vs domain_methodology).
 *
 * @param skillIds - skill ids to weave (e.g., ["requirement-analysis", "security-basics"])
 * @param knowledgeBasePath - root path of the knowledge-base (e.g., packages/core/knowledge)
 */
export function weaveMethodology(
  skillIds: string[],
  knowledgeBasePath: string
): MethodologyEntry[] {
  const entries: MethodologyEntry[] = [];

  for (const skillId of skillIds) {
    // Walk the knowledge-base to find the skill's instruction.md
    const stagesPath = path.join(knowledgeBasePath, 'stages');
    if (!fs.existsSync(stagesPath)) continue;

    const stages = fs.readdirSync(stagesPath, { withFileTypes: true });
    for (const stageDir of stages) {
      if (!stageDir.isDirectory()) continue;
      const instructionPath = path.join(
        stagesPath,
        stageDir.name,
        'skills',
        skillId,
        'instruction.md'
      );
      if (fs.existsSync(instructionPath)) {
        const content = fs.readFileSync(instructionPath, 'utf-8');
        // Simple heuristic: if the skill is about docs (proposal/specs/design/tasks),
        // it's doc_methodology; otherwise domain_methodology.
        const docSkills = [
          'requirement-analysis',
          'specs-authoring',
          'design-authoring',
          'task-decomposition',
        ];
        const category = docSkills.includes(skillId)
          ? 'doc_methodology'
          : 'domain_methodology';
        entries.push({ source: skillId, category, content });
      }
    }
  }

  return entries;
}

/**
 * Summarize an artifact for inclusion in the MAY layer.
 *
 * For now: truncate to first 500 chars. In the future: use context-distiller
 * or LLM-based summarization.
 */
export function summarizeArtifact(artifactId: string, content: string): string {
  const truncated = content.slice(0, 500);
  return content.length > 500 ? `${truncated}...` : truncated;
}
