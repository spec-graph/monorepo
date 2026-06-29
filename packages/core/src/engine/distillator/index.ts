/**
 * Document Distillator
 *
 * Compresses artifact documents into minimal summaries for context injection.
 * Uses rule-based extraction: headings, bullets, key sentences, code blocks.
 * Reduces token usage when injecting large artifacts into dispatch manifests.
 *
 * Inspired by BMAD's distillator but adapted for spec-graph's neutral engine.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface DistillOptions {
  /** Maximum output length in characters (default: 2000) */
  maxLength?: number;
  /** Preserve code blocks (default: true) */
  preserveCode?: boolean;
  /** Preserve headings (default: true) */
  preserveHeadings?: boolean;
}

export interface DistillResult {
  original_length: number;
  compressed_length: number;
  compression_ratio: number;
  output: string;
  source: string;
}

/**
 * Distill a markdown document into a compressed summary.
 */
export function distillMarkdown(
  content: string,
  options: DistillOptions = {},
): string {
  const maxLength = options.maxLength || 2000;
  const preserveCode = options.preserveCode !== false;
  const preserveHeadings = options.preserveHeadings !== false;

  const lines = content.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

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
      } else {
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
export async function distillArtifact(
  projectRoot: string,
  artifactId: string,
  options: DistillOptions = {},
): Promise<DistillResult> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const artifactsDir = path.join(specGraphDir, "artifacts");

  // Search for the artifact file
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

  const content = await fs.readFile(foundPath, "utf-8");
  const originalLength = content.length;

  // Choose distillation strategy based on file type
  let compressed: string;
  if (foundPath.endsWith(".md")) {
    compressed = distillMarkdown(content, options);
  } else {
    // For YAML/other: just truncate
    const maxLen = options.maxLength || 2000;
    compressed = content.length > maxLen
      ? content.slice(0, maxLen) + "\n\n... [truncated]"
      : content;
  }

  return {
    original_length: originalLength,
    compressed_length: compressed.length,
    compression_ratio:
      originalLength > 0
        ? Math.round((1 - compressed.length / originalLength) * 100)
        : 0,
    output: compressed,
    source: foundPath,
  };
}

/**
 * Save distilled output to the distilled directory.
 */
export async function saveDistilled(
  projectRoot: string,
  artifactId: string,
  content: string,
): Promise<string> {
  const distilledDir = path.join(projectRoot, ".spec-graph", "distilled");
  await fs.mkdir(distilledDir, { recursive: true });
  const outputPath = path.join(distilledDir, `${artifactId}.md`);
  await fs.writeFile(outputPath, content, "utf-8");
  return outputPath;
}
