/**
 * Context Sharing
 *
 * Generate shared context for parallel sub-agents. Each sub-agent in
 * a parallel wave receives:
 *   - Project profile (from sense module)
 *   - Project overview (from plan)
 *   - Other sub-agents' plans (read-only)
 *   - Shared methodology (naming, structure, etc.)
 *
 * **Minimal context**: under 2000 words to avoid overwhelming sub-agents.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectContext {
  profile: {
    language: string | null;
    framework: string | null;
    runtime: string;
    testFramework: string | null;
    brownfield: boolean;
    existingFeatures: string[];
  };
  overview: string;
  methodology: {
    namingConvention: string;
    codeStructure: string;
    commentStyle: string;
    testPattern: string;
  };
}

export interface SharedContext {
  json: string;
  markdown: string;
  wordCount: number;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Generate shared context for a parallel wave.
 * Each sub-agent receives the same context document.
 */
export function generateSharedContext(
  context: ProjectContext,
  taskPlans: Array<{ taskId: string; description: string; files: string[] }>,
): SharedContext {
  const json = JSON.stringify(
    {
      profile: context.profile,
      overview: context.overview,
      methodology: context.methodology,
      otherTasks: taskPlans.map((t) => ({
        taskId: t.taskId,
        description: t.description,
        files: t.files,
        note: 'Read-only — these are other sub-agents\' plans',
      })),
    },
    null,
    2,
  );

  const markdown = buildMarkdown(context, taskPlans);
  const wordCount = markdown.split(/\s+/).filter((w) => w.length > 0).length;

  return { json, markdown, wordCount };
}

/**
 * Validate that shared context is minimal (< 2000 words).
 */
export function validateContextSize(ctx: SharedContext): {
  valid: boolean;
  wordCount: number;
} {
  return { valid: ctx.wordCount < 2000, wordCount: ctx.wordCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMarkdown(
  context: ProjectContext,
  taskPlans: Array<{ taskId: string; description: string; files: string[] }>,
): string {
  const sections: string[] = [];
  sections.push('# Shared Context for Parallel Sub-Agents');
  sections.push('');
  sections.push('This document is shared by all sub-agents in this wave.');
  sections.push('');
  sections.push('## Project Profile');
  sections.push('');
  sections.push(`- Language: ${context.profile.language || 'unknown'}`);
  sections.push(`- Framework: ${context.profile.framework || 'unknown'}`);
  sections.push(`- Runtime: ${context.profile.runtime}`);
  sections.push(`- Test framework: ${context.profile.testFramework || 'unknown'}`);
  sections.push(`- Brownfield: ${context.profile.brownfield ? 'yes' : 'no'}`);
  if (context.profile.existingFeatures.length > 0) {
    sections.push(`- Existing features: ${context.profile.existingFeatures.join(', ')}`);
  }
  sections.push('');
  sections.push('## Project Overview');
  sections.push('');
  sections.push(context.overview);
  sections.push('');
  sections.push('## Methodology');
  sections.push('');
  sections.push(`- Naming: ${context.methodology.namingConvention}`);
  sections.push(`- Code structure: ${context.methodology.codeStructure}`);
  sections.push(`- Comments: ${context.methodology.commentStyle}`);
  sections.push(`- Tests: ${context.methodology.testPattern}`);
  sections.push('');
  if (taskPlans.length > 0) {
    sections.push('## Other Sub-Agents\' Plans (READ-ONLY)');
    sections.push('');
    for (const plan of taskPlans) {
      sections.push(`### ${plan.taskId}`);
      sections.push(`Description: ${plan.description}`);
      sections.push(`Files: ${plan.files.join(', ')}`);
      sections.push('');
    }
  }
  return sections.join('\n');
}
