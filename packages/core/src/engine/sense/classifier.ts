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

// ============ HttpLlmBackend (Anthropic Messages API) ============

/**
 * Default LlmBackend that calls the Anthropic Messages API via fetch.
 * Requires ANTHROPIC_API_KEY environment variable. Returns ok=false on
 * any error (missing key, network failure, non-200 response) — the
 * classifier handles fallback.
 */
export class HttpLlmBackend implements LlmBackend {
  private apiKey: string;
  private model: string;
  private apiUrl: string;

  constructor(opts: { apiKey?: string; model?: string; apiUrl?: string } = {}) {
    this.apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.model =
      opts.model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    this.apiUrl = opts.apiUrl || "https://api.anthropic.com/v1/messages";
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.apiKey) {
      return { ok: false, text: "", error: "ANTHROPIC_API_KEY not set" };
    }

    try {
      const resp = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens || 1000,
          system: req.systemPrompt,
          messages: [{ role: "user", content: req.userPrompt }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return {
          ok: false,
          text: "",
          error: `HTTP ${resp.status}: ${errText.slice(0, 200)}`,
        };
      }

      const data = (await resp.json()) as any;
      const text = data?.content?.map((c: any) => c.text || "").join("") || "";
      if (!text) {
        return { ok: false, text: "", error: "empty response from LLM" };
      }
      return { ok: true, text };
    } catch (e: any) {
      return { ok: false, text: "", error: `network error: ${e.message}` };
    }
  }
}

// ============ RepoScanClassifier (default, deterministic) ============

import { inferenceRules } from "./repo-rules";

/**
 * Pure deterministic classifier — runs the existing inference rules.
 * Always returns `used: false` because no LLM is involved; the facts
 * it returns are the same repo-scan results the engine already had.
 */
export class RepoScanClassifier implements SenseClassifier {
  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    const facts: Partial<Record<FactDimension, ProfileFact>> = {};

    for (const rule of inferenceRules.sort((a, b) => b.priority - a.priority)) {
      // Skip dimensions already established as hard evidence
      if (input.hardEvidence[rule.dimension]?.confidence === "high") continue;
      const result = rule.detect(input.signals);
      if (result) {
        facts[rule.dimension] = {
          value: result.value ?? "unknown",
          confidence: result.confidence ?? "low",
          source: result.source ?? "fallback",
          evidence: result.evidence,
        };
      }
    }

    return { facts, used: false, warnings: [] };
  }
}

// ============ LlmClassifier (injectable, fails-closed) ============

/**
 * LLM-backed classifier. Calls an LLM API via LlmBackend to fill in
 * dimensions that repo-scan couldn't establish with high confidence.
 *
 * Fails-closed: on any error (missing API key, network failure, malformed
 * response, dimension downgraded from hard evidence), falls back to
 * RepoScanClassifier results and emits a warning. Never crashes, never
 * silent — every fallback is surfaced.
 */
export class LlmClassifier implements SenseClassifier {
  private backend: LlmBackend;
  private fallback: RepoScanClassifier;

  constructor(backend: LlmBackend) {
    this.backend = backend;
    this.fallback = new RepoScanClassifier();
  }

  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    const warnings: string[] = [];

    // Determine which dimensions need LLM classification
    const neededDims: FactDimension[] = [];
    for (const dim of ALL_DIMENSIONS) {
      const fact = input.hardEvidence[dim];
      if (!fact || fact.confidence !== "high") {
        neededDims.push(dim);
      }
    }

    if (neededDims.length === 0) {
      // All dimensions established by hard evidence — no LLM needed
      return { facts: {}, used: false, warnings: [] };
    }

    // Build the prompt
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(input, neededDims);

    // Call the LLM
    const response = await this.backend.complete({
      systemPrompt,
      userPrompt,
      maxTokens: 1000,
    });

    if (!response.ok) {
      warnings.push(
        `LLM classifier failed (${response.error}); falling back to repo-scan`,
      );
      const fb = await this.fallback.classify(input);
      return {
        facts: fb.facts,
        used: false,
        warnings: [...warnings, ...fb.warnings],
      };
    }

    // Parse the response
    let parsed: Partial<
      Record<FactDimension, { value: string; reasoning?: string }>
    >;
    try {
      parsed = parseLlmResponse(response.text);
    } catch (e: any) {
      warnings.push(
        `LLM response parse failed (${e.message}); falling back to repo-scan`,
      );
      const fb = await this.fallback.classify(input);
      return {
        facts: fb.facts,
        used: false,
        warnings: [...warnings, ...fb.warnings],
      };
    }

    // Build facts from parsed response, never overriding hard evidence
    const facts: Partial<Record<FactDimension, ProfileFact>> = {};
    let downgraded = 0;
    for (const [dimStr, item] of Object.entries(parsed)) {
      const dim = dimStr as FactDimension;
      if (
        !item ||
        typeof item !== "object" ||
        typeof (item as any).value !== "string"
      )
        continue;
      // Guard: LLM must not downgrade existing hard evidence
      if (input.hardEvidence[dim]?.confidence === "high") {
        downgraded++;
        continue;
      }
      facts[dim] = {
        value: (item as any).value,
        confidence: "low", // LLM output is always low confidence until human review freezes it
        source: "llm",
        evidence:
          (item as any).reasoning || `LLM classified as ${(item as any).value}`,
      };
    }

    if (downgraded > 0) {
      warnings.push(
        `LLM attempted to override ${downgraded} hard-evidence dimension(s); ignored`,
      );
    }

    // Fill any remaining gaps with repo-scan fallback
    const stillMissing = neededDims.filter((d) => !facts[d]);
    if (stillMissing.length > 0) {
      const fb = await this.fallback.classify(input);
      for (const dim of stillMissing) {
        if (fb.facts[dim]) facts[dim] = fb.facts[dim];
      }
      warnings.push(
        `LLM did not classify ${stillMissing.length} dimension(s); filled from repo-scan`,
      );
    }

    return { facts, used: true, warnings };
  }
}

// ============ Helpers ============

const ALL_DIMENSIONS: FactDimension[] = [
  "has_ui",
  "boundary",
  "topology",
  "deployment",
  "consumers",
  "field",
  "criticality",
  "team",
  "persistence",
];

function buildSystemPrompt(): string {
  return `You are a project profile classifier. Given a description of a software project and repo signals, classify the project along these 9 dimensions. Respond with a JSON object only — no prose, no markdown.

Dimensions and allowed values:
- has_ui: "none" | "cli" | "gui" | "web" | "native"
- boundary: "internal" | "published-api" | "published-lib" | "hardware-iface"
- topology: "mono" | "federated"
- deployment: "process" | "package" | "binary" | "firmware" | "hosted-service"
- consumers: "self" | "internal-team" | "external-public"
- field: "greenfield" | "brownfield"
- criticality: "prototype" | "standard" | "compliance"
- team: "solo" | "small" | "multi"
- persistence: "none" | "embedded-store" | "database"

Output format:
{
  "has_ui": { "value": "web", "reasoning": "Next.js config detected" },
  ...
}

Only include dimensions you can confidently classify from the inputs. Omit dimensions you cannot determine.`;
}

function buildUserPrompt(
  input: ClassifyInput,
  neededDims: FactDimension[],
): string {
  const lines: string[] = [];
  if (input.description) {
    lines.push(`Project description: ${input.description}`);
  }
  lines.push("");
  lines.push("Repo signals:");
  lines.push(JSON.stringify(input.signals, null, 2));
  lines.push("");
  lines.push(
    "Dimensions needing classification (those not established by hard repo evidence):",
  );
  lines.push(neededDims.join(", "));
  return lines.join("\n");
}

/**
 * Parse the LLM response as JSON. Throws on invalid JSON.
 * Tolerates markdown code fences and leading/trailing prose.
 */
export function parseLlmResponse(
  text: string,
): Partial<Record<FactDimension, { value: string; reasoning?: string }>> {
  // Strip markdown code fences if present
  let s = text.trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) s = fenceMatch[1].trim();

  // Find the first { and last } — tolerate leading/trailing prose
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("no JSON object found in response");
  }
  const jsonStr = s.slice(start, end + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e: any) {
    throw new Error(`invalid JSON: ${e.message}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("response is not an object");
  }

  // Validate keys are known dimensions
  const result: Partial<
    Record<FactDimension, { value: string; reasoning?: string }>
  > = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (
      ALL_DIMENSIONS.includes(k as FactDimension) &&
      typeof v === "object" &&
      v !== null
    ) {
      const item = v as any;
      if (typeof item.value === "string") {
        result[k as FactDimension] = {
          value: item.value,
          reasoning: item.reasoning,
        };
      }
    }
  }
  return result;
}
