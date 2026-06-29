/**
 * SenseClassifier — abstraction over the "LLM only participates in Sense"
 * stage of the Sense→Compose→Enforce pipeline.
 *
 * Per CLAUDE.md §Sense:
 *   - LLM 输出必须落成 profile.yaml 给人复核再冻结
 *   - LLM 不能下调硬证据(repo high-confidence 优先)
 *   - 失败闭合 / 不静默通过 — LLM 失败时 fallback 到 repo scan + warning
 *
 * Two implementations:
 *   - RepoScanClassifier: deterministic, default, current logic
 *   - LlmClassifier: injectable, calls LLM API via LlmBackend, fails-closed
 */
import { FactDimension, ProfileFact } from "../../types/index";
import { RepoSignals } from "./index";
export interface ClassifyInput {
    signals: RepoSignals;
    /** User's free-text description of the project (from --description flag). */
    description?: string;
    /**
     * Facts already established by repo-scan with high confidence.
     * Classifier MUST NOT downgrade these — only fill in dimensions
     * where repo-scan had low confidence or unknown value.
     */
    hardEvidence: Partial<Record<FactDimension, ProfileFact>>;
}
export interface ClassifyOutput {
    /** Facts the classifier is opining on. Only for dimensions NOT in hardEvidence. */
    facts: Partial<Record<FactDimension, ProfileFact>>;
    /** Whether the classifier actually ran (vs. fell back). */
    used: boolean;
    /** Warnings emitted (e.g., fell back to repo scan due to missing API key). */
    warnings: string[];
}
export interface SenseClassifier {
    classify(input: ClassifyInput): Promise<ClassifyOutput>;
}
export interface LlmRequest {
    systemPrompt: string;
    userPrompt: string;
    /** Max tokens for the response. */
    maxTokens?: number;
}
export interface LlmResponse {
    text: string;
    /** Whether the call succeeded. */
    ok: boolean;
    /** Error message if !ok. */
    error?: string;
}
/**
 * Backend abstraction for LLM API calls. Production impl would call
 * Anthropic / OpenAI; tests inject a fake. The classifier handles failure
 * by falling back to repo-scan results — never crashes, never silent.
 */
export interface LlmBackend {
    complete(req: LlmRequest): Promise<LlmResponse>;
}
/**
 * Default LlmBackend that calls the Anthropic Messages API via fetch.
 * Requires ANTHROPIC_API_KEY environment variable. Returns ok=false on
 * any error (missing key, network failure, non-200 response) — the
 * classifier handles fallback.
 */
export declare class HttpLlmBackend implements LlmBackend {
    private apiKey;
    private model;
    private apiUrl;
    constructor(opts?: {
        apiKey?: string;
        model?: string;
        apiUrl?: string;
    });
    complete(req: LlmRequest): Promise<LlmResponse>;
}
/**
 * Pure deterministic classifier — runs the existing inference rules.
 * Always returns `used: false` because no LLM is involved; the facts
 * it returns are the same repo-scan results the engine already had.
 */
export declare class RepoScanClassifier implements SenseClassifier {
    classify(input: ClassifyInput): Promise<ClassifyOutput>;
}
/**
 * LLM-backed classifier. Calls an LLM API via LlmBackend to fill in
 * dimensions that repo-scan couldn't establish with high confidence.
 *
 * Fails-closed: on any error (missing API key, network failure, malformed
 * response, dimension downgraded from hard evidence), falls back to
 * RepoScanClassifier results and emits a warning. Never crashes, never
 * silent — every fallback is surfaced.
 */
export declare class LlmClassifier implements SenseClassifier {
    private backend;
    private fallback;
    constructor(backend: LlmBackend);
    classify(input: ClassifyInput): Promise<ClassifyOutput>;
}
/**
 * Parse the LLM response as JSON. Throws on invalid JSON.
 * Tolerates markdown code fences and leading/trailing prose.
 */
export declare function parseLlmResponse(text: string): Partial<Record<FactDimension, {
    value: string;
    reasoning?: string;
}>>;
