/**
 * Review Protocol Engine
 *
 * Generates structured review prompts for multi-model artifact review.
 * Supports Claude, Codex, Gemini, and custom model review formats.
 *
 * Inspired by gstack's dual-voice review (Claude + Codex) but extended
 * to support any number of models with model-specific prompt formatting.
 */
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
/**
 * Generate review prompts for an artifact.
 */
export declare function generateReviewPrompts(projectRoot: string, artifactId: string, config: ReviewConfig): Promise<ReviewResult>;
/**
 * Save review prompts to files.
 */
export declare function saveReviewPrompts(projectRoot: string, result: ReviewResult): Promise<string[]>;
