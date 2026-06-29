import { describe, it, expect, beforeEach } from "vitest";
import {
  RepoScanClassifier,
  LlmClassifier,
  parseLlmResponse,
  LlmBackend,
  LlmRequest,
  LlmResponse,
  ClassifyInput,
} from "./classifier";
import { RepoSignals, runSense } from "./index";
import { FactDimension, ProfileFact } from "../../types/index";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ============ Test fixtures ============

function makeSignals(overrides: Partial<RepoSignals> = {}): RepoSignals {
  return {
    hasPackageJson: true,
    packageManager: "npm",
    hasExportsField: false,
    hasDependencies: [],
    hasDevDependencies: [],
    hasNextConfig: false,
    hasViteConfig: false,
    hasWebpackConfig: false,
    hasReact: false,
    hasVue: false,
    hasTailwind: false,
    hasDesignTokens: false,
    hasOpenApiYaml: false,
    hasPrismaSchema: false,
    hasDockerfile: false,
    hasK8sConfig: false,
    hasGraphqlSchema: false,
    hasGrpcProtos: false,
    hasPlatformioIni: false,
    hasArduinoFiles: false,
    hasRegisterMap: false,
    hasCiConfig: false,
    hasSrcDir: true,
    hasTestDir: false,
    hasGit: false,
    srcFileCount: 10,
    testFileCount: 0,
    ...overrides,
  };
}

function emptyHardEvidence(): Partial<Record<FactDimension, ProfileFact>> {
  return {};
}

// ============ RepoScanClassifier ============

describe("RepoScanClassifier", () => {
  it("returns facts for dimensions not in hard evidence", async () => {
    const clf = new RepoScanClassifier();
    const out = await clf.classify({
      signals: makeSignals({ hasReact: true }),
      hardEvidence: emptyHardEvidence(),
    });

    expect(out.used).toBe(false);
    expect(out.facts.has_ui?.value).toBe("web");
    expect(out.facts.has_ui?.source).toBe("repo");
  });

  it("skips dimensions already established as hard evidence", async () => {
    const clf = new RepoScanClassifier();
    const hardEvidence: Partial<Record<FactDimension, ProfileFact>> = {
      has_ui: {
        value: "cli",
        confidence: "high",
        source: "user",
        evidence: "user override",
      },
    };

    const out = await clf.classify({
      signals: makeSignals({ hasReact: true }),
      hardEvidence,
    });

    // has_ui should NOT be in the classifier output — it's hard evidence
    expect(out.facts.has_ui).toBeUndefined();
  });

  it("uses fallback source (not llm) for low-confidence facts", async () => {
    const clf = new RepoScanClassifier();
    const out = await clf.classify({
      signals: makeSignals(), // no react/vue/etc → has_ui falls back
      hardEvidence: emptyHardEvidence(),
    });

    expect(out.facts.has_ui?.source).toBe("fallback");
  });
});

// ============ parseLlmResponse ============

describe("parseLlmResponse", () => {
  it("parses clean JSON", () => {
    const text =
      '{"has_ui": {"value": "web", "reasoning": "Next.js detected"}}';
    const parsed = parseLlmResponse(text);
    expect(parsed.has_ui?.value).toBe("web");
  });

  it("strips markdown code fences", () => {
    const text = '```json\n{"has_ui": {"value": "web"}}\n```';
    const parsed = parseLlmResponse(text);
    expect(parsed.has_ui?.value).toBe("web");
  });

  it("tolerates leading/trailing prose", () => {
    const text =
      'Here is my analysis:\n{"has_ui": {"value": "web"}}\nThat is all.';
    const parsed = parseLlmResponse(text);
    expect(parsed.has_ui?.value).toBe("web");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseLlmResponse("not json at all")).toThrow();
  });

  it("throws on missing JSON object", () => {
    expect(() => parseLlmResponse("[]")).toThrow();
  });

  it("ignores unknown dimension keys", () => {
    const text = '{"has_ui": {"value": "web"}, "unknown_dim": {"value": "x"}}';
    const parsed = parseLlmResponse(text);
    expect(parsed.has_ui?.value).toBe("web");
    expect((parsed as any).unknown_dim).toBeUndefined();
  });
});

// ============ LlmClassifier fail-closed ============

class FakeLlmBackend implements LlmBackend {
  calls: LlmRequest[] = [];
  response: LlmResponse;
  failOnce: boolean = false;
  private callCount = 0;

  constructor(response: Partial<LlmResponse> = {}) {
    this.response = {
      ok: true,
      text: '{"has_ui": {"value": "web", "reasoning": "test"}}',
      ...response,
    };
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req);
    this.callCount++;
    if (this.failOnce && this.callCount === 1) {
      return { ok: false, text: "", error: "simulated failure" };
    }
    return this.response;
  }
}

describe("LlmClassifier", () => {
  it("returns LLM-classified facts on success", async () => {
    const backend = new FakeLlmBackend({
      ok: true,
      text: '{"has_ui": {"value": "web", "reasoning": "React detected"}, "team": {"value": "multi"}}',
    });
    const clf = new LlmClassifier(backend);

    const out = await clf.classify({
      signals: makeSignals(),
      hardEvidence: emptyHardEvidence(),
      description: "A React app",
    });

    expect(out.used).toBe(true);
    expect(out.facts.has_ui?.value).toBe("web");
    expect(out.facts.has_ui?.source).toBe("llm");
    expect(out.facts.has_ui?.confidence).toBe("low"); // LLM is always low until human review
    expect(out.facts.team?.value).toBe("multi");
  });

  it("fail-closes to repo scan when backend fails", async () => {
    const backend = new FakeLlmBackend({
      ok: false,
      text: "",
      error: "no API key",
    });
    const clf = new LlmClassifier(backend);

    const out = await clf.classify({
      signals: makeSignals({ hasReact: true }),
      hardEvidence: emptyHardEvidence(),
    });

    expect(out.used).toBe(false);
    expect(out.warnings.some((w) => w.includes("LLM classifier failed"))).toBe(
      true,
    );
    // Should still have facts (from repo-scan fallback)
    expect(out.facts.has_ui?.value).toBe("web");
    expect(out.facts.has_ui?.source).toBe("repo");
  });

  it("fail-closes when LLM returns malformed JSON", async () => {
    const backend = new FakeLlmBackend({ ok: true, text: "not json" });
    const clf = new LlmClassifier(backend);

    const out = await clf.classify({
      signals: makeSignals(),
      hardEvidence: emptyHardEvidence(),
    });

    expect(out.used).toBe(false);
    expect(out.warnings.some((w) => w.includes("parse failed"))).toBe(true);
  });

  it("never downgrades hard evidence", async () => {
    const backend = new FakeLlmBackend({
      ok: true,
      text: '{"has_ui": {"value": "native", "reasoning": "user said native"}}',
    });
    const clf = new LlmClassifier(backend);

    const hardEvidence: Partial<Record<FactDimension, ProfileFact>> = {
      has_ui: {
        value: "web",
        confidence: "high",
        source: "repo",
        evidence: "React detected",
      },
    };

    const out = await clf.classify({
      signals: makeSignals({ hasReact: true }),
      hardEvidence,
    });

    // LLM tried to say "native" but hard evidence says "web" — must be ignored
    expect(out.facts.has_ui).toBeUndefined();
    expect(out.warnings.some((w) => w.includes("hard-evidence"))).toBe(true);
  });

  it("skips LLM call when all dimensions are hard evidence", async () => {
    const backend = new FakeLlmBackend();
    const clf = new LlmClassifier(backend);

    const allHard: Partial<Record<FactDimension, ProfileFact>> = {};
    const dims: FactDimension[] = [
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
    for (const d of dims) {
      allHard[d] = {
        value: "x",
        confidence: "high",
        source: "repo",
        evidence: "test",
      };
    }

    const out = await clf.classify({
      signals: makeSignals(),
      hardEvidence: allHard,
    });

    expect(backend.calls.length).toBe(0);
    expect(out.used).toBe(false);
  });

  it("fills missing dimensions from repo scan", async () => {
    const backend = new FakeLlmBackend({
      ok: true,
      text: '{"team": {"value": "multi"}}', // only classifies one dimension
    });
    const clf = new LlmClassifier(backend);

    const out = await clf.classify({
      signals: makeSignals({ hasReact: true }),
      hardEvidence: emptyHardEvidence(),
    });

    // has_ui: not in LLM response, filled from repo scan
    expect(out.facts.has_ui?.value).toBe("web");
    expect(out.facts.has_ui?.source).toBe("repo");
    // team: from LLM
    expect(out.facts.team?.value).toBe("multi");
    expect(out.facts.team?.source).toBe("llm");
    // Warning about partial fill
    expect(out.warnings.some((w) => w.includes("did not classify"))).toBe(true);
  });

  it("passes description through to LLM prompt", async () => {
    const backend = new FakeLlmBackend();
    const clf = new LlmClassifier(backend);

    await clf.classify({
      signals: makeSignals(),
      hardEvidence: emptyHardEvidence(),
      description: "A temperature control firmware with mobile app",
    });

    expect(backend.calls.length).toBe(1);
    expect(backend.calls[0].userPrompt).toContain(
      "temperature control firmware",
    );
  });
});

// ============ runSense integration ============

describe("runSense with classifier", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-sense-"));
  });

  it("uses RepoScanClassifier by default (no LLM)", async () => {
    const result = await runSense(tmpDir);

    // Default: no LLM, so llm_classified must be false
    expect(result.profile.meta.source.llm_classified).toBe(false);
    // No 'llm' source in any fact
    for (const fact of Object.values(result.profile.facts)) {
      if (fact.source === "llm") {
        throw new Error("default runSense should not produce llm-source facts");
      }
    }
  });

  it("sets llm_classified=true when LlmClassifier is used", async () => {
    const backend = new FakeLlmBackend({
      ok: true,
      text: '{"team": {"value": "multi", "reasoning": "large codebase"}}',
    });
    const classifier = new LlmClassifier(backend);

    const result = await runSense(tmpDir, { classifier });

    expect(result.profile.meta.source.llm_classified).toBe(true);
    expect(result.profile.facts.team.value).toBe("multi");
    expect(result.profile.facts.team.source).toBe("llm");
  });

  it("sets llm_classified=false when LlmClassifier falls back", async () => {
    const backend = new FakeLlmBackend({ ok: false, error: "no key" });
    const classifier = new LlmClassifier(backend);

    const result = await runSense(tmpDir, { classifier });

    expect(result.profile.meta.source.llm_classified).toBe(false);
    expect(
      result.warnings.some((w) => w.includes("LLM classifier failed")),
    ).toBe(true);
  });
});
