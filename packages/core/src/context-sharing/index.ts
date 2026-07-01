/**
 * Context Sharing — generate shared context for parallel sub-agents.
 *
 * Each sub-agent receives: project profile, project overview, other
 * sub-agents' plans (read-only), and shared methodology.
 * Context is minimal (< 2000 words) to avoid overwhelming sub-agents.
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
  json: string; // JSON format for programmatic access
  markdown: string; // Markdown format for agent reading
  wordCount: number; // for verification
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Generate shared context for a parallel wave.
 * Each sub-agent in the wave receives the same context document.
 */
export function generateSharedContext(
  context: ProjectContext,
  taskPlans: Array<{
    taskId: string;
    description: string;
    files: string[];
  }>
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
    2
  );

  const markdown = buildMarkdown(context, taskPlans);
  const wordCount = markdown.split(/\s+/).filter((w) => w.length > 0).length;

  return { json, markdown, wordCount };
}

/**
 * Validate that shared context is minimal (< 2000 words).
 */
export function validateContextSize(context: SharedContext): { valid: boolean; wordCount: number } {
  return { valid: context.wordCount < 2000, wordCount: context.wordCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMarkdown(
  context: ProjectContext,
  taskPlans: Array<{ taskId: string; description: string; files: string[] }>
): string {
  const sections: string[] = [];

  sections.push('# Shared Context for Parallel Sub-Agents');
  sections.push('');
  sections.push('This document is shared by all sub-agents in this wave. It provides:');
  sections.push('1. Project profile (language, framework, existing features)');
  sections.push('2. Project overview (architecture, key modules)');
  sections.push('3. Methodology (naming, structure, comments, tests)');
  sections.push('4. Other sub-agents\' plans (READ-ONLY)');
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
  sections.push(`### Naming: ${context.methodology.namingConvention}`);
  sections.push(`### Code structure: ${context.methodology.codeStructure}`);
  sections.push(`### Comments: ${context.methodology.commentStyle}`);
  sections.push(`### Tests: ${context.methodology.testPattern}`);
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
