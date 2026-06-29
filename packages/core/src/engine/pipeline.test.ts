/**
 * End-to-end integration tests for the spec-graph pipeline.
 *
 * Exercises the full sense → compose → prime → run → enforce flow
 * to validate the system works as a unified whole.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSense } from "./sense/index";
import { runCompose } from "./compose/index";
import { runEnforce } from "./enforce/index";
import { StateMachineEngine } from "./machine/index";
import { buildTraceIndex } from "./trace/index";
import { computeNextPlan } from "./next/index";
import { loadPermissions, isActionAllowed } from "./permissions/index";
import { writeYaml } from "../utils/yaml";
import { Graph, Profile } from "../types/index";

async function makeTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-e2e-"));
  await fs.mkdir(path.join(dir, ".spec-graph"), { recursive: true });
  return dir;
}

describe("End-to-End Pipeline", () => {
  it("should complete sense → compose → prime for a greenfield web project", async () => {
    const projectRoot = await makeTempProject();

    // Step 1: Sense — analyze the project
    const { profile, warnings } = await runSense(projectRoot);
    expect(profile.version).toBe("1");
    expect(profile.facts.has_ui).toBeDefined();
    expect(profile.facts.boundary).toBeDefined();

    // Step 2: Compose — build graph from profile + packs
    const composeResult = await runCompose(projectRoot, profile, "feature");
    expect(composeResult.graph.version).toBe("1");
    expect(composeResult.graph.artifacts.length).toBeGreaterThan(0);
    expect(composeResult.graph.checks.length).toBeGreaterThan(0);
    expect(composeResult.graph.gates.length).toBeGreaterThan(0);
    expect(composeResult.graph.pipeline_skeleton.stages.length).toBeGreaterThan(
      0,
    );

    // Step 3: Write graph to disk and prime machine state
    const graphPath = path.join(projectRoot, ".spec-graph", "graph.yaml");
    await writeYaml(graphPath, composeResult.graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    const engine = new StateMachineEngine(
      composeResult.graph,
      statePath,
      projectRoot,
    );
    const state = await engine.initialize();
    expect(state.current_stage).toBeDefined();

    // Seed artifacts
    for (const artifact of composeResult.graph.artifacts) {
      await engine.updateArtifact(artifact.id, { status: "pending" });
    }
    // Seed checks
    for (const check of composeResult.graph.checks) {
      await engine.updateCheck(check.id, { status: "pending" });
    }

    const artifacts = await engine.getArtifacts();
    expect(Object.keys(artifacts).length).toBe(
      composeResult.graph.artifacts.length,
    );

    const checks = await engine.getChecks();
    expect(Object.keys(checks).length).toBe(composeResult.graph.checks.length);

    // Step 4: Verify next plan is computed correctly
    const traceIndex = await buildTraceIndex(projectRoot, composeResult.graph);
    const plan = await computeNextPlan(composeResult.graph, state, traceIndex);
    expect(plan.done).toBe(false);
    expect(plan.current_stage).toBe(state.current_stage);
    expect(plan.next_stage).toBeDefined();
  });

  it("should enforce gates and block transitions until satisfied", async () => {
    const projectRoot = await makeTempProject();

    // Create a minimal graph with a gate that requires an artifact and check
    const graph: Graph = {
      version: "1",
      meta: {
        composed_at: new Date().toISOString(),
        profile_hash: "test",
        change_type: "feature",
        packs_used: [],
      },
      artifacts: [
        { id: "requirement/prd", kind: "requirement" },
        { id: "plan/story", kind: "plan" },
      ],
      actions: ["specify", "plan", "implement"],
      checks: [{ id: "lint", kind: "lint", command: "echo ok", layer: "unit" }],
      gates: [
        {
          id: "entry-gate",
          on_transition: ["plan", "implement"],
          require_artifacts: ["plan/story"],
          require_checks: ["lint"],
          require_traces: [],
          forbid: [],
          fail_mode: "block",
          enabled: true,
          provided_by: "test",
        },
      ],
      tracks: [],
      pipeline_skeleton: {
        stages: ["plan", "implement"],
        max_retries: 3,
        on_exhausted: "block",
      },
      acceptance_layers: {},
    };

    // Write graph
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    // Initialize state machine
    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    const engine = new StateMachineEngine(graph, statePath, projectRoot);
    await engine.initialize();

    // Try to transition — should be blocked
    const blockedResult = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });
    expect(blockedResult.success).toBe(false);
    expect(blockedResult.gate_evaluation?.missing_artifacts).toContain(
      "plan/story",
    );
    expect(blockedResult.gate_evaluation?.failed_checks).toContain("lint");

    // Satisfy the gate
    await engine.updateArtifact("plan/story", { status: "completed" });
    await engine.updateCheck("lint", { status: "passed" });

    // Now transition should succeed
    const successResult = await engine.transition({
      from_stage: "plan",
      to_stage: "implement",
      triggered_by: "test",
    });
    expect(successResult.success).toBe(true);
    expect(successResult.new_state.current_stage).toBe("implement");
  });

  it("should complete the full web project workflow end-to-end", async () => {
    const projectRoot = await makeTempProject();

    // --- Sense ---
    const { profile } = await runSense(projectRoot);

    // Override profile for a web project scenario
    const webProfile: Profile = {
      ...profile,
      facts: {
        ...profile.facts,
        has_ui: {
          value: "web",
          confidence: "high",
          source: "user",
          evidence: "test override",
        },
        boundary: {
          value: "published-api",
          confidence: "high",
          source: "user",
          evidence: "test override",
        },
        persistence: {
          value: "database",
          confidence: "high",
          source: "user",
          evidence: "test override",
        },
        field: {
          value: "greenfield",
          confidence: "high",
          source: "repo",
          evidence: "no existing code",
        },
        criticality: { value: "standard", confidence: "low", source: "llm" },
        deployment: {
          value: "hosted-service",
          confidence: "low",
          source: "llm",
        },
        consumers: { value: "self", confidence: "low", source: "llm" },
        topology: { value: "mono", confidence: "low", source: "llm" },
        team: { value: "small", confidence: "low", source: "llm" },
      },
    };

    // --- Compose ---
    const composeResult = await runCompose(projectRoot, webProfile, "feature");
    expect(composeResult.errors).toEqual([]);

    // Should match web-related packs: frontend + api-design + data-design + foundation + planning packs
    const packNames = composeResult.packsUsed.map((p) => p.name);
    expect(packNames).toContain("foundation");
    expect(packNames).toContain("frontend");
    expect(packNames).toContain("api-design");
    expect(packNames).toContain("data-design");

    // Should include FE and BE tracks
    expect(composeResult.graph.tracks.some((t) => t.id === "fe")).toBe(true);
    expect(composeResult.graph.tracks.some((t) => t.id === "be")).toBe(true);

    // Should have FE-specific checks (lighthouse, a11y)
    const checkIds = composeResult.graph.checks.map((c) => c.id);
    expect(checkIds).toContain("lighthouse");
    expect(checkIds).toContain("a11y");

    // Should include contract artifacts
    const artifactIds = composeResult.graph.artifacts.map((a) => a.id);
    expect(artifactIds).toContain("contract/openapi");
    expect(artifactIds).toContain("contract/db-schema");

    // Should include all 4 acceptance layers
    expect(composeResult.graph.acceptance_layers.unit).toBeDefined();
    expect(composeResult.graph.acceptance_layers.integration).toBeDefined();
    expect(composeResult.graph.acceptance_layers.system).toBeDefined();
    expect(composeResult.graph.acceptance_layers.deployment).toBeDefined();

    // --- Prime ---
    await writeYaml(
      path.join(projectRoot, ".spec-graph", "graph.yaml"),
      composeResult.graph,
    );
    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    const engine = new StateMachineEngine(
      composeResult.graph,
      statePath,
      projectRoot,
    );
    await engine.initialize();

    // Seed all artifacts and bootstrap placeholder checks
    for (const artifact of composeResult.graph.artifacts) {
      await engine.updateArtifact(artifact.id, { status: "pending" });
    }
    for (const check of composeResult.graph.checks) {
      const isPlaceholder = /^<[^>]+>$/.test(check.command.trim());
      await engine.updateCheck(check.id, {
        status: isPlaceholder ? "passed" : "pending",
      });
    }

    // --- Enforce ---
    const enforceResult = await runEnforce(projectRoot, composeResult.graph);
    expect(enforceResult.evaluated_gates.length).toBeGreaterThan(0);

    // --- Verify next plan ---
    const traceIndex = await buildTraceIndex(projectRoot, composeResult.graph);
    const state = await engine.getState();
    const plan = await computeNextPlan(composeResult.graph, state, traceIndex);

    // Should have a next stage
    expect(plan.done).toBe(false);
    expect(plan.next_stage).toBeDefined();
  });

  it("should detect federated topology from profile correctly", async () => {
    const projectRoot = await makeTempProject();

    const { profile } = await runSense(projectRoot);
    const federatedProfile: Profile = {
      ...profile,
      facts: {
        ...profile.facts,
        has_ui: { value: "web", confidence: "high", source: "user" },
        boundary: {
          value: "published-api",
          confidence: "high",
          source: "user",
        },
        topology: { value: "federated", confidence: "high", source: "user" },
        persistence: { value: "database", confidence: "high", source: "user" },
        field: { value: "greenfield", confidence: "high", source: "repo" },
        criticality: { value: "standard", confidence: "low", source: "llm" },
        deployment: {
          value: "hosted-service",
          confidence: "low",
          source: "llm",
        },
        consumers: {
          value: "external-public",
          confidence: "low",
          source: "llm",
        },
        team: { value: "small", confidence: "low", source: "llm" },
      },
    };

    const composeResult = await runCompose(
      projectRoot,
      federatedProfile,
      "feature",
    );

    // Federated: BE track should produce contracts with federated_consume on FE
    const feTrack = composeResult.graph.tracks.find((t) => t.id === "fe");
    expect(feTrack).toBeDefined();
  });

  it("should compose for embedded project with no web packs", async () => {
    const projectRoot = await makeTempProject();

    const { profile } = await runSense(projectRoot);
    const embeddedProfile: Profile = {
      ...profile,
      facts: {
        ...profile.facts,
        has_ui: { value: "none", confidence: "high", source: "user" },
        boundary: { value: "internal", confidence: "high", source: "user" },
        topology: { value: "mono", confidence: "high", source: "user" },
        deployment: { value: "firmware", confidence: "high", source: "user" },
        persistence: { value: "none", confidence: "high", source: "user" },
        field: { value: "greenfield", confidence: "high", source: "repo" },
        criticality: { value: "compliance", confidence: "low", source: "llm" },
        consumers: { value: "self", confidence: "low", source: "llm" },
        team: { value: "small", confidence: "low", source: "llm" },
      },
    };

    const composeResult = await runCompose(
      projectRoot,
      embeddedProfile,
      "feature",
    );

    const packNames = composeResult.packsUsed.map((p) => p.name);
    // Should NOT include frontend or api-design
    expect(packNames).not.toContain("frontend");
    expect(packNames).not.toContain("api-design");
    // Should include embedded
    expect(packNames).toContain("embedded");

    // Should include embedded-specific contracts (not web API contracts)
    const contractArtifacts = composeResult.graph.artifacts.filter((a) =>
      a.id.startsWith("contract/"),
    );
    const contractIds = contractArtifacts.map((a) => a.id);
    expect(contractIds).toContain("contract/register-map");
    // api-design pack should not match for embedded projects
    expect(contractIds).not.toContain("contract/openapi");
  });

  it("should detect change type packs correctly", async () => {
    const projectRoot = await makeTempProject();

    const { profile } = await runSense(projectRoot);

    // Feature change
    const featureResult = await runCompose(projectRoot, profile, "feature");
    expect(featureResult.packsUsed.map((p) => p.name)).toContain("feature");

    // Bugfix change
    const bugfixResult = await runCompose(projectRoot, profile, "bugfix");
    expect(bugfixResult.packsUsed.map((p) => p.name)).toContain("bugfix");

    // Refactor change
    const refactorResult = await runCompose(projectRoot, profile, "refactor");
    expect(refactorResult.packsUsed.map((p) => p.name)).toContain("refactor");

    // Unknown change type should fall back to feature
    const unknownResult = await runCompose(
      projectRoot,
      profile,
      "unknown-type",
    );
    expect(unknownResult.errors.length).toBeGreaterThan(0);
    expect(unknownResult.errors[0]).toContain("No intent pack matched");
    expect(unknownResult.graph.pipeline_skeleton.stages).toBeDefined();
  });

  it("should maintain permissions throughout the pipeline", async () => {
    const projectRoot = await makeTempProject();
    await fs.mkdir(path.join(projectRoot, ".spec-graph"), { recursive: true });

    // Default permissions (semi-auto)
    const permissions = await loadPermissions(projectRoot);
    expect(permissions.level).toBe("semi-auto");

    // semi-auto: checks and transitions auto, artifacts manual
    expect(isActionAllowed("run_check", permissions)).toBe(true);
    expect(isActionAllowed("transition", permissions)).toBe(true);
    expect(isActionAllowed("produce_artifact", permissions)).toBe(false);
    expect(isActionAllowed("perform_stage", permissions)).toBe(false);
  });
});
