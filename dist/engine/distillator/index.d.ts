/**
 * Document Distillator
 *
 * Compresses artifact documents into minimal summaries for context injection.
 * Uses rule-based extraction: headings, bullets, key sentences, code blocks.
 * Reduces token usage when injecting large artifacts into dispatch manifests.
 *
 * Inspired by BMAD's distillator but adapted for spec-graph's neutral engine.
 */
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
export declare function distillMarkdown(content: string, options?: DistillOptions): string;
/**
 * Distill an artifact file from the spec-graph artifacts directory.
 */
export declare function distillArtifact(projectRoot: string, artifactId: string, options?: DistillOptions): Promise<DistillResult>;
/**
 * Save distilled output to the distilled directory.
 */
export declare function saveDistilled(projectRoot: string, artifactId: string, content: string): Promise<string>;
