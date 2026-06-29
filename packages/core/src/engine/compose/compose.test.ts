import { describe, it, expect } from "vitest";
import { runCompose } from "./index";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Profile } from "../../types/index";

function makeProfile(overrides: Partial<Record<string, string>> = {}): Profile {
  const value = (key: string, fallback: string) => overrides[key] || fallback;

  return {
    version: "1",
    meta: {
      created_at: new Date().toISOString(),
      source: {
        repo_scan: true,
        llm_classified: false,
      },
    },
    facts: {
      has_ui: {
        value: value("has_ui", "none"),
        confidence: "low",
        source: "llm",
      },
      boundary: {
        value: value("boundary", "internal"),
        confidence: "low",
        source: "llm",
      },
      topology: {
        value: value("topology", "mono"),
        confidence: "low",
        source: "llm",
      },
      deployment: {
        value: value("deployment", "process"),
        confidence: "low",
        source: "llm",
      },
      consumers: {
        value: value("consumers", "self"),
        confidence: "low",
        source: "llm",
      },
      field: {
        value: value("field", "brownfield"),
        confidence: "high",
        source: "repo",
      },
      criticality: {
        value: value("criticality", "standard"),
        confidence: "low",
        source: "llm",
      },
      team: { value: value("team", "small"), confidence: "low", source: "llm" },
      persistence: {
        value: value("persistence", "unknown"),
        confidence: "low",
        source: "llm",
      },
    },
    repo_signals: {},
  };
}

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-compose-"));
}

describe("Compose Engine", () => {
  it("should compose a graph with built-in packs from an external project", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    expect(result.graph.version).toBe("1");
    expect(result.graph.pipeline_skeleton.stages).toEqual([
      "implement",
      "review",
      "test",
      "accept",
    ]);
    expect(result.packsUsed.map((p) => p.name)).toContain("foundation");
    expect(result.packsUsed.map((p) => p.name)).toContain("feature");
    expect(result.graph.artifacts.length).toBeGreaterThan(0);
    expect(result.graph.checks.length).toBeGreaterThan(0);
    expect(result.graph.gates.length).toBeGreaterThan(0);
  });

  it("should include agents from foundation.pack", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    expect(result.graph.agents.length).toBeGreaterThan(0);
    const agentIds = result.graph.agents.map((a) => a.id);
    expect(agentIds).toContain("pm");
    expect(agentIds).toContain("architect");
    expect(agentIds).toContain("developer");
    expect(agentIds).toContain("reviewer");
    expect(agentIds).toContain("qa");
  });

  it("should include agent_bindings from foundation.pack", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    expect(result.graph.agent_bindings.length).toBeGreaterThan(0);
    const bindings = result.graph.agent_bindings;
    const proposeBinding = bindings.find((b) => b.action === "propose");
    expect(proposeBinding).toBeDefined();
    expect(proposeBinding!.agent_id).toBe("pm");
    expect(proposeBinding!.provided_by).toBe("foundation");

    const implementBinding = bindings.find((b) => b.action === "implement");
    expect(implementBinding).toBeDefined();
    expect(implementBinding!.agent_id).toBe("developer");
  });

  it("should override agent_bindings when higher-priority pack declares same action", async () => {
    const projectRoot = await makeTempProject();
    // Create a project-local pack that overrides the 'design' binding
    const packDir = path.join(projectRoot, "packs", "my-domain.pack");
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(
      path.join(packDir, "pack.yaml"),
      `name: my-domain
version: "1.0.0"
kind: domain
priority: 20
description: "Custom domain pack"
applies_when: always
provides:
  agents:
    - id: my-designer
      description: "Custom designer agent"
      prompt_ref: agents/my-designer.md
      model_tier: capable
      input_artifact_kinds: [requirement/*]
      output_artifact_kinds: [design/*]
      actions: [design]
  agent_bindings:
    design: my-designer
  artifacts: []
  actions: []
`,
    );

    const result = await runCompose(projectRoot, makeProfile(), "feature");

    const designBinding = result.graph.agent_bindings.find(
      (b) => b.action === "design",
    );
    expect(designBinding).toBeDefined();
    expect(designBinding!.agent_id).toBe("my-designer");
    expect(designBinding!.provided_by).toBe("my-domain");
    // Other bindings should still come from foundation
    const proposeBinding = result.graph.agent_bindings.find(
      (b) => b.action === "propose",
    );
    expect(proposeBinding!.provided_by).toBe("foundation");
  });

  it("should merge agents from multiple packs without duplicates", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    // All agents should have unique ids
    const agentIds = result.graph.agents.map((a) => a.id);
    const uniqueIds = new Set(agentIds);
    expect(uniqueIds.size).toBe(agentIds.length);
  });

  it("should assign model_tier to each agent", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    for (const agent of result.graph.agents) {
      expect(agent.model_tier).toBeDefined();
      expect(["fast", "standard", "capable"]).toContain(agent.model_tier);
    }
    // developer should be standard, architect should be capable
    const dev = result.graph.agents.find((a) => a.id === "developer");
    expect(dev?.model_tier).toBe("standard");
    const arch = result.graph.agents.find((a) => a.id === "architect");
    expect(arch?.model_tier).toBe("capable");
  });

  it("should include meetings from foundation.pack", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    expect(result.graph.meetings.length).toBeGreaterThan(0);
    const reqMeeting = result.graph.meetings.find(
      (m) => m.id === "requirements-meeting",
    );
    expect(reqMeeting).toBeDefined();
    expect(reqMeeting!.participants.length).toBeGreaterThan(0);
    expect(reqMeeting!.participants.some((p) => p.agent_id === "pm")).toBe(
      true,
    );
    expect(
      reqMeeting!.participants.some((p) => p.agent_id === "architect"),
    ).toBe(true);
    expect(reqMeeting!.participants.some((p) => p.agent_id === "qa")).toBe(
      true,
    );
  });

  it("should have configurable min/max rounds on meetings", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    const reqMeeting = result.graph.meetings.find(
      (m) => m.id === "requirements-meeting",
    );
    expect(reqMeeting).toBeDefined();
    expect(reqMeeting!.min_rounds).toBeGreaterThanOrEqual(1);
    expect(reqMeeting!.max_rounds).toBeGreaterThan(reqMeeting!.min_rounds);
    // Foundation default: 2 min, 10 max
    expect(reqMeeting!.min_rounds).toBe(2);
    expect(reqMeeting!.max_rounds).toBe(10);
  });

  it("should have multiple round phases in meetings", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    const reqMeeting = result.graph.meetings.find(
      (m) => m.id === "requirements-meeting",
    );
    expect(reqMeeting).toBeDefined();
    expect(reqMeeting!.rounds.length).toBeGreaterThanOrEqual(3);
    // Round template should have at least one of each phase
    const phases = reqMeeting!.rounds.map((r) => r.phase);
    expect(phases).toContain("diverge");
    expect(phases).toContain("challenge");
    expect(phases).toContain("converge");
  });

  it("should allow meeting override by higher-priority pack", async () => {
    const projectRoot = await makeTempProject();
    const packDir = path.join(projectRoot, "packs", "my-domain.pack");
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(
      path.join(packDir, "pack.yaml"),
      `name: my-domain
version: "1.0.0"
kind: domain
priority: 20
description: "Custom domain pack with meeting override"
applies_when: always
provides:
  meetings:
    - id: requirements-meeting
      description: "Custom requirements meeting"
      purpose: "Custom purpose"
      on_actions: [propose, specify]
      min_rounds: 5
      max_rounds: 20
      participants:
        - agent_id: my-agent
          role: core
          perspective: "custom perspective"
      output_artifacts: [requirement/custom]
      rounds:
        - number: 1
          phase: diverge
          objective: "Custom diverge"
          prompt: "..."
          speakers: []
  agents:
    - id: my-agent
      description: "Custom agent"
      prompt_ref: agents/my-agent.md
      model_tier: capable
      input_artifact_kinds: []
      output_artifact_kinds: [requirement/*]
      actions: [propose, specify]
  artifacts: []
  actions: []
`,
    );

    const result = await runCompose(projectRoot, makeProfile(), "feature");

    const reqMeeting = result.graph.meetings.find(
      (m) => m.id === "requirements-meeting",
    );
    expect(reqMeeting).toBeDefined();
    // Should be overridden by higher-priority pack
    expect(reqMeeting!.min_rounds).toBe(5);
    expect(reqMeeting!.max_rounds).toBe(20);
    expect(
      reqMeeting!.participants.some((p) => p.agent_id === "my-agent"),
    ).toBe(true);
    // Foundation's participants should NOT be present (full override)
    expect(reqMeeting!.participants.some((p) => p.agent_id === "pm")).toBe(
      false,
    );
  });

  it("should include DDD meeting when ddd.pack is active", async () => {
    const projectRoot = await makeTempProject();
    // Activate ddd.pack via profile: field=brownfield
    const result = await runCompose(
      projectRoot,
      makeProfile({ field: "brownfield" }),
      "feature",
    );

    const dddMeeting = result.graph.meetings.find(
      (m) => m.id === "domain-modeling-meeting",
    );
    expect(dddMeeting).toBeDefined();
    expect(
      dddMeeting!.participants.some((p) => p.agent_id === "domain-expert"),
    ).toBe(true);
    expect(dddMeeting!.min_rounds).toBeGreaterThanOrEqual(3);
    expect(dddMeeting!.max_rounds).toBeGreaterThan(dddMeeting!.min_rounds);
    // DDD meeting should have more rounds than foundation default
    expect(dddMeeting!.rounds.length).toBeGreaterThanOrEqual(5);
  });

  it("should have all DDD meeting participants with valid roles", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({ field: "brownfield" }),
      "feature",
    );

    const dddMeeting = result.graph.meetings.find(
      (m) => m.id === "domain-modeling-meeting",
    );
    expect(dddMeeting).toBeDefined();
    for (const p of dddMeeting!.participants) {
      expect(p.role).toBeDefined();
      expect(["core", "optional", "invite_only", "facilitator"]).toContain(
        p.role,
      );
      // Each participant should have either agent_id or expert_role
      expect(p.agent_id || p.expert_role).toBeDefined();
    }
  });

  it("should include pipeline skeleton", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");

    expect(result.graph.pipeline_skeleton.stages).toBeDefined();
    expect(result.graph.pipeline_skeleton.stages.length).toBeGreaterThan(0);
    expect(result.graph.pipeline_skeleton.max_retries).toBeGreaterThan(0);
  });

  it("should overlay project packs over built-in packs by name", async () => {
    const projectRoot = await makeTempProject();
    const packDir = path.join(projectRoot, "packs", "feature.pack");
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(
      path.join(packDir, "pack.yaml"),
      `name: feature
version: "9.9.9"
kind: change-intent
priority: 99
description: "Project-local feature override"
applies_when_change:
  type: feature
provides:
  actions: [custom-implement]
  pipeline_skeleton:
    stages: [custom-implement, custom-accept]
    max_retries: 1
    on_exhausted: block
`,
    );

    const result = await runCompose(projectRoot, makeProfile(), "feature");

    expect(result.graph.pipeline_skeleton.stages).toEqual([
      "custom-implement",
      "custom-accept",
    ]);
    expect(result.graph.pipeline_skeleton.max_retries).toBe(1);
    expect(result.graph.actions).toContain("custom-implement");
    expect(result.packsUsed.find((p) => p.name === "feature")?.priority).toBe(
      99,
    );
  });

  it("should match domain packs from profile facts", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "web" }),
      "feature",
    );

    expect(result.packsUsed.map((p) => p.name)).toContain("frontend");
    expect(result.graph.tracks.some((t) => t.id === "fe")).toBe(true);
  });
});

describe("Compose: override + freeze", () => {
  it("warns when composing from an unreviewed profile", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(projectRoot, makeProfile(), "feature");
    expect(result.warnings.some((w) => w.includes("unreviewed profile"))).toBe(
      true,
    );
  });

  it("does not warn about review when profile is frozen", async () => {
    const projectRoot = await makeTempProject();
    const profile = makeProfile();
    profile.meta!.source!.reviewed_at = new Date().toISOString();
    const result = await runCompose(projectRoot, profile, "feature");
    expect(result.warnings.some((w) => w.includes("unreviewed profile"))).toBe(
      false,
    );
  });

  it("applies overrides over sensed facts — override flips pack matching", async () => {
    // Sensed has_ui=none (no frontend pack). Override to has_ui=web should pull in frontend.
    const projectRoot = await makeTempProject();
    const profile = makeProfile({ has_ui: "none" });
    profile.overrides = { has_ui: "web" };

    const result = await runCompose(projectRoot, profile, "feature");

    expect(result.packsUsed.map((p) => p.name)).toContain("frontend");
    // Effective fact should be marked override-source
    expect(
      result.warnings.some((w) => w.includes("override: has_ui=web")),
    ).toBe(true);
  });

  it("explicit override wins over repo hard evidence", async () => {
    // Repo says boundary=internal (low conf). Override to published-api.
    const projectRoot = await makeTempProject();
    const profile = makeProfile({ boundary: "internal" });
    profile.overrides = { boundary: "published-api" };

    const result = await runCompose(projectRoot, profile, "feature");

    expect(result.packsUsed.map((p) => p.name)).toContain("api-design");
    expect(
      result.warnings.some((w) =>
        w.includes("override: boundary=published-api"),
      ),
    ).toBe(true);
  });

  it("does not mutate the input profile", async () => {
    const projectRoot = await makeTempProject();
    const profile = makeProfile({ has_ui: "none" });
    profile.overrides = { has_ui: "web" };
    const before = profile.facts.has_ui.value;

    await runCompose(projectRoot, profile, "feature");

    expect(profile.facts.has_ui.value).toBe(before);
  });

  it('$exists does not match when dimension value is "unknown" — regression', async () => {
    // Default profile has persistence='unknown'. data-design pack's applies_when
    // uses `persistence: $exists`, so it must NOT activate on unknown.
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({ persistence: "unknown" }),
      "feature",
    );
    expect(result.packsUsed.map((p) => p.name)).not.toContain("data-design");
  });

  it("$exists matches only when dimension has a real value", async () => {
    // persistence='database' is a real value → data-design should match.
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({ persistence: "database" }),
      "feature",
    );
    expect(result.packsUsed.map((p) => p.name)).toContain("data-design");
  });
});

describe("4-layer acceptance enforcement", () => {
  it("auto-injects required deployment layer checks into exit-merged gate", async () => {
    // When has_ui=web, frontend pack activates with deployment layer required=true
    // and e2e-browser check. The exit-merged gate should auto-include e2e-browser.
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "web" }),
      "feature",
    );

    const exitGate = result.graph.gates.find((g) => g.id === "exit-merged");
    expect(exitGate).toBeDefined();

    // frontend.pack declares deployment: { required: true, checks: [e2e-browser] }
    // → e2e-browser should be auto-injected into exit-merged.require_checks
    expect(exitGate!.require_checks).toContain("e2e-browser");
  });

  it("does not inject checks from optional layers", async () => {
    // When has_ui=none (no frontend), deployment layer is optional in foundation
    // → no deployment checks injected
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "none" }),
      "feature",
    );

    const exitGate = result.graph.gates.find((g) => g.id === "exit-merged");
    expect(exitGate!.require_checks).not.toContain("e2e-browser");
    expect(exitGate!.require_checks).not.toContain("hil-test");
  });

  it("auto-injects required system layer checks (lighthouse, a11y)", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "web" }),
      "feature",
    );

    const exitGate = result.graph.gates.find((g) => g.id === "exit-merged");
    // frontend.pack declares system: { required: true, checks: [lighthouse, a11y] }
    expect(exitGate!.require_checks).toContain("lighthouse");
    expect(exitGate!.require_checks).toContain("a11y");
  });

  it("auto-injects HIL test for embedded deployment", async () => {
    const projectRoot = await makeTempProject();
    const result = await runCompose(
      projectRoot,
      makeProfile({
        has_ui: "none",
        boundary: "hardware-iface",
        deployment: "firmware",
      }),
      "feature",
    );

    const exitGate = result.graph.gates.find((g) => g.id === "exit-merged");
    // embedded.pack declares deployment: { required: true, checks: [hil-test] }
    expect(exitGate!.require_checks).toContain("hil-test");
  });

  it("warns when a required layer has no checks declared", async () => {
    // Create a project-local pack that declares a required layer with no checks
    const projectRoot = await makeTempProject();
    const packDir = path.join(projectRoot, "packs", "test-empty-layer.pack");
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(
      path.join(packDir, "pack.yaml"),
      `name: test-empty-layer
version: "0.1.0"
kind: domain
priority: 50
description: "Declares a required layer with no checks"
applies_when:
  has_ui: none
provides:
  acceptance_layers:
    deployment: { required: true, checks: [] }
`,
    );

    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "none" }),
      "feature",
    );
    expect(
      result.warnings.some((w) => w.includes("required but has no checks")),
    ).toBe(true);
  });
});

describe("shared-contract opportunity detection (§6.3 layer 3)", () => {
  it("does not suggest a shared contract when only one track consumes it", async () => {
    const projectRoot = await makeTempProject();
    const packDir = path.join(projectRoot, "packs", "lonely-consumer.pack");
    await fs.mkdir(packDir, { recursive: true });
    await fs.writeFile(
      path.join(packDir, "pack.yaml"),
      `name: lonely-consumer
version: "0.1.0"
kind: domain
priority: 50
description: "Single track consuming a contract nobody produces"
applies_when:
  has_ui: none
contributes_track:
  id: lonely
  scope: lonely
  actions: [implement]
  produces: []
  consumes: ['contract/ghost']
`,
    );

    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "none" }),
      "feature",
    );
    // Single consumer — not a shared-contract opportunity
    expect(
      result.warnings.some((w) => w.includes("shared-contract opportunity")),
    ).toBe(false);
  });

  it("does not suggest a shared contract when a producer exists", async () => {
    const projectRoot = await makeTempProject();
    const producerDir = path.join(projectRoot, "packs", "producer.pack");
    const consumerDir = path.join(projectRoot, "packs", "consumer.pack");
    await fs.mkdir(producerDir, { recursive: true });
    await fs.mkdir(consumerDir, { recursive: true });
    await fs.writeFile(
      path.join(producerDir, "pack.yaml"),
      `name: producer
version: "0.1.0"
kind: domain
priority: 50
description: "Produces a contract"
applies_when:
  has_ui: none
contributes_track:
  id: prod
  scope: prod
  actions: [implement]
  produces: ['contract/api']
  consumes: []
`,
    );
    await fs.writeFile(
      path.join(consumerDir, "pack.yaml"),
      `name: consumer
version: "0.1.0"
kind: domain
priority: 50
description: "Consumes a contract that has a producer"
applies_when:
  has_ui: none
contributes_track:
  id: cons
  scope: cons
  actions: [implement]
  produces: []
  consumes: ['contract/api']
`,
    );

    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "none" }),
      "feature",
    );
    expect(
      result.warnings.some((w) => w.includes("shared-contract opportunity")),
    ).toBe(false);
  });

  it("suggests a shared contract when ≥2 tracks consume with no producer", async () => {
    const projectRoot = await makeTempProject();
    const c1Dir = path.join(projectRoot, "packs", "c1.pack");
    const c2Dir = path.join(projectRoot, "packs", "c2.pack");
    await fs.mkdir(c1Dir, { recursive: true });
    await fs.mkdir(c2Dir, { recursive: true });
    await fs.writeFile(
      path.join(c1Dir, "pack.yaml"),
      `name: c1
version: "0.1.0"
kind: domain
priority: 50
description: "Consumer 1 of orphan contract"
applies_when:
  has_ui: none
contributes_track:
  id: consumer-1
  scope: c1
  actions: [implement]
  produces: []
  consumes: ['contract/shared-types']
`,
    );
    await fs.writeFile(
      path.join(c2Dir, "pack.yaml"),
      `name: c2
version: "0.1.0"
kind: domain
priority: 50
description: "Consumer 2 of orphan contract"
applies_when:
  has_ui: none
contributes_track:
  id: consumer-2
  scope: c2
  actions: [implement]
  produces: []
  consumes: ['contract/shared-types']
`,
    );

    const result = await runCompose(
      projectRoot,
      makeProfile({ has_ui: "none" }),
      "feature",
    );
    expect(
      result.warnings.some(
        (w) =>
          w.includes("shared-contract opportunity") &&
          w.includes("contract/shared-types"),
      ),
    ).toBe(true);
    // Suggestion must explicitly warn against premature auto-wiring
    expect(
      result.warnings.some(
        (w) =>
          w.includes("premature abstraction") ||
          w.includes("review before wiring"),
      ),
    ).toBe(true);
  });
});
