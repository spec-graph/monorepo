"use strict";
/**
 * Document Distillator
 *
 * Compresses artifact documents into minimal summaries for context injection.
 * Uses rule-based extraction: headings, bullets, key sentences, code blocks.
 * Reduces token usage when injecting large artifacts into dispatch manifests.
 *
 * Inspired by BMAD's distillator but adapted for spec-graph's neutral engine.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.distillMarkdown = distillMarkdown;
exports.distillArtifact = distillArtifact;
exports.saveDistilled = saveDistilled;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
/**
 * Distill a markdown document into a compressed summary.
 */
function distillMarkdown(content, options = {}) {
    const maxLength = options.maxLength || 2000;
    const preserveCode = options.preserveCode !== false;
    const preserveHeadings = options.preserveHeadings !== false;
    const lines = content.split("\n");
    const result = [];
    let inCodeBlock = false;
    let codeBlockContent = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Track code blocks
        if (line.startsWith("```")) {
            if (inCodeBlock) {
                // End of code block
                if (preserveCode) {
                    result.push(codeBlockContent.join("\n"));
                    result.push("```");
                }
                codeBlockContent = [];
                inCodeBlock = false;
            }
            else {
                // Start of code block
                inCodeBlock = true;
                if (preserveCode) {
                    result.push(line);
                }
            }
            continue;
        }
        if (inCodeBlock) {
            if (preserveCode) {
                codeBlockContent.push(line);
            }
            continue;
        }
        // Headings
        if (preserveHeadings && /^#{1,6}\s/.test(line)) {
            result.push(line);
            continue;
        }
        // Bullet points
        if (/^[\s]*[-*+]\s/.test(line)) {
            result.push(line);
            continue;
        }
        // Key sentences (containing important keywords)
        const keyWords = [
            "must", "shall", "required", "critical", "important",
            "warning", "caution", "decision", "conclusion",
            "acceptance criteria", "scope", "depends on",
            "prerequisite", "constraint", "risk",
        ];
        const lowerLine = line.toLowerCase();
        if (keyWords.some((kw) => lowerLine.includes(kw))) {
            result.push(line);
            continue;
        }
        // Numbered lists
        if (/^\d+\.\s/.test(line)) {
            result.push(line);
            continue;
        }
        // Empty lines (for readability)
        if (line.trim() === "" && result.length > 0 && result[result.length - 1].trim() !== "") {
            result.push("");
        }
    }
    // Trim to max length
    let output = result.join("\n");
    if (output.length > maxLength) {
        // Progressive truncation: first remove empty lines, then shorten
        output = output.slice(0, maxLength);
        // Try to end at a complete line
        const lastNewline = output.lastIndexOf("\n");
        if (lastNewline > maxLength * 0.8) {
            output = output.slice(0, lastNewline);
        }
        output += "\n\n... [truncated]";
    }
    return output;
}
/**
 * Distill an artifact file from the spec-graph artifacts directory.
 */
async function distillArtifact(projectRoot, artifactId, options = {}) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const artifactsDir = node_path_1.default.join(specGraphDir, "artifacts");
    // Search for the artifact file
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
    const content = await promises_1.default.readFile(foundPath, "utf-8");
    const originalLength = content.length;
    // Choose distillation strategy based on file type
    let compressed;
    if (foundPath.endsWith(".md")) {
        compressed = distillMarkdown(content, options);
    }
    else {
        // For YAML/other: just truncate
        const maxLen = options.maxLength || 2000;
        compressed = content.length > maxLen
            ? content.slice(0, maxLen) + "\n\n... [truncated]"
            : content;
    }
    return {
        original_length: originalLength,
        compressed_length: compressed.length,
        compression_ratio: originalLength > 0
            ? Math.round((1 - compressed.length / originalLength) * 100)
            : 0,
        output: compressed,
        source: foundPath,
    };
}
/**
 * Save distilled output to the distilled directory.
 */
async function saveDistilled(projectRoot, artifactId, content) {
    const distilledDir = node_path_1.default.join(projectRoot, ".spec-graph", "distilled");
    await promises_1.default.mkdir(distilledDir, { recursive: true });
    const outputPath = node_path_1.default.join(distilledDir, `${artifactId}.md`);
    await promises_1.default.writeFile(outputPath, content, "utf-8");
    return outputPath;
}
//# sourceMappingURL=index.js.map