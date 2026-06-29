/**
 * Review Protocol Engine
 *
 * Generates structured review prompts for multi-model artifact review.
 * Supports Claude, Codex, Gemini, and custom model review formats.
 *
 * Inspired by gstack's dual-voice review (Claude + Codex) but extended
 * to support any number of models with model-specific prompt formatting.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { distillMarkdown } from "../distillator/index";

export interface ReviewConfig {
  /** Models to request review from */
  models: string[];
  /** Include full artifact or distilled version */
  includeFull: boolean;
  /** Focus areas for review */
  focusAreas: string[];
  /** Output format */
  format: "prompts" | "json" | "files";
}

export interface ReviewResult {
  artifact_id: string;
  source_path: string;
  reviews: ReviewPrompt[];
  generated_at: string;
}

export interface ReviewPrompt {
  model: string;
  system_prompt: string;
  user_prompt: string;
  artifact_content: string;
  output_path?: string;
}

const MODEL_SYSTEM_PROMPTS: Record<string, string> = {
  claude: `You are a thorough code and specification reviewer. Analyze the provided artifact for:
1. Correctness — Does it match the stated requirements?
2. Completeness — Are all necessary aspects covered?
3. Consistency — Does it align with other project artifacts?
4. Clarity — Is it understandable and well-structured?
5. Risks — Are there potential issues, edge cases, or gaps?

Provide a structured review with:
- **Summary**: One-paragraph assessment
- **Strengths**: What's done well
- **Issues**: Specific problems with severity (critical/major/minor)
- **Suggestions**: Actionable improvements
- **Verdict**: APPROVE / REQUEST_CHANGES / REJECT`,

  codex: `You are a detail-oriented specification reviewer. Focus on technical precision:
1. Requirements coverage — Are all requirements addressed?
2. Technical accuracy — Are the technical details correct?
3. Implementation feasibility — Can this be built as described?
4. Edge cases — Are boundary conditions handled?
5. Dependencies — Are all dependencies identified?

Provide a structured review with:
- **Assessment**: Pass/Fail with confidence level
- **Findings**: Numbered list of specific findings
- **Blockers**: Issues that must be resolved before approval
- **Recommendations**: Suggested improvements`,

  gemini: `You are a comprehensive artifact reviewer. Evaluate holistically:
1. Purpose alignment — Does this serve its intended purpose?
2. Quality — Is the artifact well-crafted?
3. Integration — How does this fit with the broader system?
4. Maintenance — Will this be easy to maintain and evolve?
5. Documentation — Is it well-documented?

Provide a structured review with:
- **Overview**: High-level assessment
- **Detailed Findings**: Categorized observations
- **Action Items**: Specific next steps
- **Risk Assessment**: Low/Medium/High with justification`,
};

const DEFAULT_SYSTEM_PROMPT = `You are a specification reviewer. Analyze the provided artifact for correctness, completeness, consistency, and clarity. Provide a structured review with findings, issues, and recommendations.`;

/**
 * Generate review prompts for an artifact.
 */
export async function generateReviewPrompts(
  projectRoot: string,
  artifactId: string,
  config: ReviewConfig,
): Promise<ReviewResult> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const artifactsDir = path.join(specGraphDir, "artifacts");

  // Find the artifact file
  const kinds = [
    "requirements", "design", "plan", "contract",
    "verification", "change-record", "implementation", "meta",
  ];

  let foundPath: string | null = null;
  for (const kind of kinds) {
    const candidates = [
      path.join(artifactsDir, kind, `${artifactId}.md`),
      path.join(artifactsDir, kind, `${artifactId}.yaml`),
      path.join(artifactsDir, kind, `${artifactId}.txt`),
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        foundPath = candidate;
        break;
      } catch {
        // continue
      }
    }
    if (foundPath) break;
  }

  if (!foundPath) {
    throw new Error(
      `Artifact '${artifactId}' not found in ${artifactsDir}. ` +
      `Searched in: ${kinds.join(", ")}`,
    );
  }

  const fullContent = await fs.readFile(foundPath, "utf-8");
  const artifactContent = config.includeFull
    ? fullContent
    : distillMarkdown(fullContent, { maxLength: 3000 });

  const reviews: ReviewPrompt[] = config.models.map((model) => {
    const systemPrompt = MODEL_SYSTEM_PROMPTS[model] || DEFAULT_SYSTEM_PROMPT;
    const focusText = config.focusAreas.length > 0
      ? `\n\n**Focus areas**: ${config.focusAreas.join(", ")}`
      : "";

    const userPrompt = `Please review the following artifact: **${artifactId}**

Source: ${foundPath}
${focusText}

---

${artifactContent}

---

Provide your structured review as specified in your instructions.`;

    return {
      model,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      artifact_content: artifactContent,
    };
  });

  return {
    artifact_id: artifactId,
    source_path: foundPath,
    reviews,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Save review prompts to files.
 */
export async function saveReviewPrompts(
  projectRoot: string,
  result: ReviewResult,
): Promise<string[]> {
  const reviewDir = path.join(projectRoot, ".spec-graph", "reviews");
  await fs.mkdir(reviewDir, { recursive: true });

  const paths: string[] = [];
  for (const review of result.reviews) {
    const filename = `${result.artifact_id}-${review.model}-review.md`;
    const filePath = path.join(reviewDir, filename);

    const content = `# Review Request: ${result.artifact_id}

**Model**: ${review.model}
**Generated**: ${result.generated_at}
**Source**: ${result.source_path}

## System Prompt

${review.system_prompt}

---

## Review Task

${review.user_prompt}
`;

    await fs.writeFile(filePath, content, "utf-8");
    review.output_path = filePath;
    paths.push(filePath);
  }

  return paths;
}
