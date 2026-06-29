"use strict";
/**
 * Review Protocol Engine
 *
 * Generates structured review prompts for multi-model artifact review.
 * Supports Claude, Codex, Gemini, and custom model review formats.
 *
 * Inspired by gstack's dual-voice review (Claude + Codex) but extended
 * to support any number of models with model-specific prompt formatting.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReviewPrompts = generateReviewPrompts;
exports.saveReviewPrompts = saveReviewPrompts;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const index_1 = require("../distillator/index");
const MODEL_SYSTEM_PROMPTS = {
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
async function generateReviewPrompts(projectRoot, artifactId, config) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const artifactsDir = node_path_1.default.join(specGraphDir, "artifacts");
    // Find the artifact file
    const kinds = [
        "requirements", "design", "plan", "contract",
        "verification", "change-record", "implementation", "meta",
    ];
    let foundPath = null;
    for (const kind of kinds) {
        const candidates = [
            node_path_1.default.join(artifactsDir, kind, `${artifactId}.md`),
            node_path_1.default.join(artifactsDir, kind, `${artifactId}.yaml`),
            node_path_1.default.join(artifactsDir, kind, `${artifactId}.txt`),
        ];
        for (const candidate of candidates) {
            try {
                await promises_1.default.access(candidate);
                foundPath = candidate;
                break;
            }
            catch {
                // continue
            }
        }
        if (foundPath)
            break;
    }
    if (!foundPath) {
        throw new Error(`Artifact '${artifactId}' not found in ${artifactsDir}. ` +
            `Searched in: ${kinds.join(", ")}`);
    }
    const fullContent = await promises_1.default.readFile(foundPath, "utf-8");
    const artifactContent = config.includeFull
        ? fullContent
        : (0, index_1.distillMarkdown)(fullContent, { maxLength: 3000 });
    const reviews = config.models.map((model) => {
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
async function saveReviewPrompts(projectRoot, result) {
    const reviewDir = node_path_1.default.join(projectRoot, ".spec-graph", "reviews");
    await promises_1.default.mkdir(reviewDir, { recursive: true });
    const paths = [];
    for (const review of result.reviews) {
        const filename = `${result.artifact_id}-${review.model}-review.md`;
        const filePath = node_path_1.default.join(reviewDir, filename);
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
        await promises_1.default.writeFile(filePath, content, "utf-8");
        review.output_path = filePath;
        paths.push(filePath);
    }
    return paths;
}
//# sourceMappingURL=index.js.map