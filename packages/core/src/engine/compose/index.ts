import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import {
  Profile,
  Pack,
  Graph,
  Gate,
  TrackContribution,
  TraceQuery,
  GatePatch,
  FactDimension,
  AgentDecl,
  AgentBinding,
  MeetingDecl,
  ProjectConfig,
  PackOverrides,
  CheckDecl,
} from "../../types/index";
import { tryReadYaml } from "../../utils/yaml";

export interface ComposeResult {
  graph: Graph;
  packsUsed: Array<{ name: string; matched: any; priority: number }>;
  warnings: string[];
  errors: string[];
}

export async function runCompose(
  projectRoot: string,
  rawProfile: Profile,
  changeType: string = "feature",
): Promise<ComposeResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Step 0: Resolve effective facts — user overrides win over repo/LLM facts.
  const profile = applyOverrides(rawProfile, warnings);
  if (!profile.meta?.source?.reviewed_at) {
    warnings.push(
      "composing from an unreviewed profile — run `spec-graph profile review` to freeze it after human check",
    );
  }

  // Step 1: Load built-in packs, then overlay project-specific packs
  const packs = await loadPacks(projectRoot);

  // Step 1.5: Apply pack overrides from .spec-graph/pack-overrides.yaml
  const overriddenPacks = await applyPackOverrides(projectRoot, packs, warnings);

  // Step 2: Match domain packs by applies_when
  const domainPacks = matchDomainPacks(overriddenPacks, profile);

  // Step 3: Match intent pack by changeType
  const intentPack = matchIntentPack(overriddenPacks, changeType);
  if (!intentPack) {
    errors.push(
      `No intent pack matched for change type: ${changeType}, falling back to feature`,
    );
    const fallback = overriddenPacks.find((p) => p.name === "feature");
    if (fallback) {
      domainPacks.push(fallback);
    }
  } else {
    domainPacks.push(intentPack);
  }

  const activePacks = domainPacks.sort(
    (a, b) => (b.priority || 0) - (a.priority || 0),
  );

  // Step 4: Merge artifacts
  const { artifacts: mergedArtifacts, warnings: artifactWarnings } =
    mergeArtifacts(activePacks);
  warnings.push(...artifactWarnings);

  // Step 5: Merge actions
  const mergedActions = mergeActions(activePacks);

  // Step 6: Merge checks
  const { checks: mergedChecks, warnings: checkWarnings } =
    mergeChecks(activePacks);
  warnings.push(...checkWarnings);

  // Step 7: Assemble gates + apply patches
  const { gates, warnings: gateWarnings } = assembleGates(activePacks);
  warnings.push(...gateWarnings);

  // Step 8: Assemble tracks
  const { tracks, warnings: trackWarnings } = assembleTracks(
    activePacks,
    mergedArtifacts,
  );
  warnings.push(...trackWarnings);

  // Step 9: Select pipeline skeleton (intent pack provides this)
  const pipelineSkeleton = selectPipelineSkeleton(intentPack, activePacks);

  // Step 10: Merge acceptance layers
  const acceptanceLayers = mergeAcceptanceLayers(activePacks);

  // Step 10b: Auto-inject required acceptance layer checks into exit-merged gate
  // This makes the 4-layer acceptance model actually enforced — any layer
  // marked required=true contributes its checks to the merge gate.
  const layerInjectionWarnings = injectRequiredLayerChecks(
    gates,
    acceptanceLayers,
  );
  warnings.push(...layerInjectionWarnings);

  // Step 11: Derive traces
  const traces = deriveTraces(mergedArtifacts, gates, tracks);

  // Step 12: Conflict detection
  const conflictErrors = detectConflicts(
    mergedArtifacts,
    mergedChecks,
    gates,
    tracks,
  );
  errors.push(...conflictErrors);

  // Step 13: Merge agents + agent bindings
  const { agents, warnings: agentWarnings } = mergeAgents(activePacks);
  warnings.push(...agentWarnings);
  const { agentBindings, warnings: bindingWarnings } =
    mergeAgentBindings(activePacks);
  warnings.push(...bindingWarnings);

  // Step 14: Merge meetings
  const { meetings, warnings: meetingWarnings } = mergeMeetings(activePacks);
  warnings.push(...meetingWarnings);

  // Load project-level config (config.yaml) — injects context/rules into the
  // graph so coordinators see project-specific constraints when dispatching.
  const projectConfig = await loadProjectConfig(projectRoot, warnings);

  // Build final graph
  const graph: Graph = {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: crypto
        .createHash("sha256")
        .update(JSON.stringify(profile))
        .digest("hex"),
      change_type: changeType,
      packs_used: activePacks.map((p) => ({
        name: p.name,
        matched: p.applies_when || p.applies_when_change || "always",
        priority: p.priority || 0,
      })),
    },
    artifacts: mergedArtifacts,
    actions: mergedActions,
    checks: mergedChecks,
    gates,
    tracks,
    pipeline_skeleton: pipelineSkeleton,
    acceptance_layers: acceptanceLayers,
    scope_policy: intentPack?.provides.scope_policy,
    agents,
    agent_bindings: agentBindings,
    meetings,
    project_config: projectConfig,
  };

  return {
    graph,
    packsUsed: activePacks.map((p) => ({
      name: p.name,
      matched: p.applies_when || p.applies_when_change,
      priority: p.priority || 0,
    })),
    warnings,
    errors,
  };
}

async function loadPacks(projectRoot: string): Promise<Pack[]> {
  const packMap = new Map<string, Pack>();
  const packDirs = [
    path.resolve(__dirname, "../../../packs"),
    path.join(projectRoot, "packs"),
  ];

  for (const packsDir of packDirs) {
    const loaded = await loadPacksFromDir(packsDir);
    for (const pack of loaded) {
      packMap.set(pack.name, pack);
    }
  }

  const packs = Array.from(packMap.values());

  if (packs.length === 0) {
    packs.push(createFoundationFallbackPack(), createFeatureFallbackPack());
  }

  return packs;
}

/**
 * Load .spec-graph/config.yaml — project-level config injected into the graph.
 * Returns undefined if file doesn't exist (backward compat).
 *
 * Resilient parsing (mirrors OpenSpec): invalid fields are dropped with
 * warnings, not failures. Missing version defaults to '1'.
 */
async function loadProjectConfig(
  projectRoot: string,
  warnings: string[],
): Promise<ProjectConfig | undefined> {
  const configPath = path.join(projectRoot, ".spec-graph", "config.yaml");
  let raw: any;
  try {
    raw = await tryReadYaml<any>(configPath);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  const config: ProjectConfig = {
    version: typeof raw.version === "string" ? raw.version : "1",
  };

  if (
    raw.context &&
    typeof raw.context === "object" &&
    !Array.isArray(raw.context)
  ) {
    const context: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.context)) {
      if (typeof v === "string") {
        context[k] = v;
      } else {
        warnings.push(`config.yaml: context.${k} dropped (not a string)`);
      }
    }
    config.context = context;
  } else if (raw.context !== undefined) {
    warnings.push("config.yaml: context dropped (not an object)");
  }

  if (raw.rules && typeof raw.rules === "object" && !Array.isArray(raw.rules)) {
    const rules: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.rules)) {
      if (typeof v === "string") {
        rules[k] = v;
      } else {
        warnings.push(`config.yaml: rules.${k} dropped (not a string)`);
      }
    }
    config.rules = rules;
  } else if (raw.rules !== undefined) {
    warnings.push("config.yaml: rules dropped (not an object)");
  }

  if (
    raw.references &&
    typeof raw.references === "object" &&
    !Array.isArray(raw.references)
  ) {
    const references: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.references)) {
      if (typeof v === "string") {
        references[k] = v;
      } else {
        warnings.push(`config.yaml: references.${k} dropped (not a string)`);
      }
    }
    config.references = references;
  } else if (raw.references !== undefined) {
    warnings.push("config.yaml: references dropped (not an object)");
  }

  return config;
}

/**
 * Load and apply pack overrides from .spec-graph/pack-overrides.yaml.
 * Allows users to customize pack fields (checks, gates, artifacts) without forking.
 */
async function applyPackOverrides(
  projectRoot: string,
  packs: Pack[],
  warnings: string[],
): Promise<Pack[]> {
  const overridesPath = path.join(
    projectRoot,
    ".spec-graph",
    "pack-overrides.yaml",
  );

  let overrides: PackOverrides | null | undefined;
  try {
    overrides = await tryReadYaml<PackOverrides>(overridesPath);
  } catch {
    return packs; // No overrides file
  }

  if (!overrides || !overrides.overrides) return packs;

  const result = packs.map((pack) => ({ ...pack })); // deep copy

  for (const [packName, override] of Object.entries(overrides.overrides)) {
    const pack = result.find((p) => p.name === packName);
    if (!pack) {
      warnings.push(
        `pack-overrides.yaml: pack '${packName}' not found, skipping`,
      );
      continue;
    }

    // Apply check overrides
    if (override.checks && pack.provides?.checks) {
      for (const [checkId, checkOverride] of Object.entries(
        override.checks,
      )) {
        const check = pack.provides.checks.find((c) => c.id === checkId);
        if (check) {
          if (checkOverride.command)
            check.command = checkOverride.command;
          if (checkOverride.touchfiles)
            check.touchfiles = checkOverride.touchfiles;
          if (checkOverride.threshold)
            check.threshold = checkOverride.threshold;
          if (checkOverride.tier) check.tier = checkOverride.tier;
        } else {
          // Add new check
          pack.provides.checks.push({
            id: checkId,
            kind: checkOverride.kind || "custom",
            command: checkOverride.command || "echo 'override check'",
            layer: checkOverride.layer || "unit",
            touchfiles: checkOverride.touchfiles,
            threshold: checkOverride.threshold,
            tier: checkOverride.tier,
          });
        }
      }
    }

    // Apply gate overrides
    if (override.gates && pack.provides?.gates) {
      for (const [gateId, gateOverride] of Object.entries(
        override.gates,
      )) {
        const gate = pack.provides.gates.find(
          (g: any) => g.id === gateId,
        );
        if (gate) {
          if (gateOverride.add_checks) {
            gate.require_checks = [
              ...(gate.require_checks || []),
              ...gateOverride.add_checks,
            ];
          }
          if (gateOverride.remove_checks) {
            gate.require_checks = (gate.require_checks || []).filter(
              (c: string) => !gateOverride.remove_checks!.includes(c),
            );
          }
          if (gateOverride.add_artifacts) {
            gate.require_artifacts = [
              ...(gate.require_artifacts || []),
              ...gateOverride.add_artifacts,
            ];
          }
        }
      }
    }

    // Apply artifact overrides
    if (override.artifacts && pack.provides?.artifacts) {
      for (const [artifactId, artifactOverride] of Object.entries(
        override.artifacts,
      )) {
        const artifact = pack.provides.artifacts.find(
          (a) => a.id === artifactId,
        );
        if (artifact) {
          if (artifactOverride.optional !== undefined)
            artifact.optional = artifactOverride.optional;
          if (artifactOverride.schema_ref)
            artifact.schema_ref = artifactOverride.schema_ref;
        }
      }
    }
  }

  return result;
}

async function loadPacksFromDir(packsDir: string): Promise<Pack[]> {
  const packs: Pack[] = [];

  try {
    const entries = await fs.readdir(packsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const packYaml = path.join(packsDir, entry.name, "pack.yaml");
      try {
        const content = await fs.readFile(packYaml, "utf-8");
        const parsed = yaml.load(content) as any;

        if (parsed && typeof parsed === "object") {
          packs.push(normalizePack(parsed, entry.name));
        }
      } catch {
        // Skip directories without a readable pack.yaml.
      }
    }
  } catch {
    // Directory does not exist.
  }

  return packs;
}

function normalizePack(parsed: any, dirname: string): Pack {
  const provides = parsed.provides || {};

  return {
    name: parsed.name || dirname.replace(".pack", ""),
    version: parsed.version || "1.0.0",
    kind: parsed.kind || inferPackKind(parsed, dirname),
    priority: parsed.priority || 0,
    description: parsed.description || dirname,
    applies_when: parsed.applies_when,
    applies_when_change: parsed.applies_when_change,
    provides: {
      artifacts: provides.artifacts || [],
      actions: provides.actions || [],
      checks: provides.checks || [],
      gates: provides.gates || [],
      gate_patches: provides.gate_patches || {},
      acceptance_layers: provides.acceptance_layers || {},
      pipeline_skeleton: provides.pipeline_skeleton,
      scope_policy: provides.scope_policy,
      terminal_states: provides.terminal_states || [],
      agents: provides.agents || [],
      agent_bindings: provides.agent_bindings || {},
      meetings: provides.meetings || [],
    },
    contributes_track: parsed.contributes_track,
    context_ref: parsed.context_ref,
    constitution_ref: parsed.constitution_ref,
  };
}

function inferPackKind(parsed: any, dirname: string): Pack["kind"] {
  if (parsed.applies_when_change) return "change-intent";
  if (dirname.includes("feature") || dirname.includes("bugfix"))
    return "change-intent";
  return "domain";
}

function createFoundationFallbackPack(): Pack {
  return {
    name: "foundation",
    version: "1.0.0",
    kind: "domain",
    priority: 0,
    description: "Foundation governance chassis",
    applies_when: "always",
    provides: { artifacts: [], actions: [] },
  };
}

function createFeatureFallbackPack(): Pack {
  return {
    name: "feature",
    version: "1.0.0",
    kind: "change-intent",
    priority: 10,
    description: "Feature development flow",
    applies_when_change: { type: "feature" },
    provides: {
      artifacts: [],
      actions: [],
      pipeline_skeleton: {
        stages: ["implement", "review", "test", "accept"],
        max_retries: 5,
        on_exhausted: "escalate",
      },
    },
  };
}

function matchDomainPacks(packs: Pack[], profile: Profile): Pack[] {
  return packs.filter(
    (p) => p.kind === "domain" && evaluateAppliesWhen(p.applies_when, profile),
  );
}

// Resolve effective facts: user overrides take precedence over repo/LLM facts.
// Returns a cloned profile so the input is never mutated; the override is
// recorded as a fact with source:'override' so it stays visible downstream.
function applyOverrides(profile: Profile, warnings: string[]): Profile {
  const overrides = profile.overrides || {};
  if (Object.keys(overrides).length === 0) return profile;

  const facts = { ...profile.facts } as Profile["facts"];
  for (const [dim, value] of Object.entries(overrides) as Array<
    [FactDimension, string]
  >) {
    if (value === undefined) continue;
    const prior = facts[dim];
    if (prior && prior.value !== value) {
      warnings.push(
        `override: ${dim}=${value} (was ${prior.value} from ${prior.source})`,
      );
    }
    facts[dim] = {
      value,
      confidence: "high",
      source: "override",
      evidence: "user override",
    };
  }

  return { ...profile, facts };
}

function matchIntentPack(packs: Pack[], changeType: string): Pack | null {
  return (
    packs.find((p) => {
      if (p.kind !== "change-intent") return false;
      const applies = p.applies_when_change?.type;
      if (!applies) return false;
      return Array.isArray(applies)
        ? applies.includes(changeType)
        : applies === changeType;
    }) || null
  );
}

function evaluateAppliesWhen(condition: any, profile: Profile): boolean {
  if (condition === "always") return true;
  if (!condition) return false;

  for (const [key, expected] of Object.entries(condition)) {
    if (key === "$or") {
      return (expected as any[]).some((subCond) =>
        evaluateAppliesWhen(subCond, profile),
      );
    }
    if (key === "$and") {
      return (expected as any[]).every((subCond) =>
        evaluateAppliesWhen(subCond, profile),
      );
    }

    const actual = profile.facts[key as keyof typeof profile.facts]?.value;
    if (typeof expected === "string" && expected.startsWith("!")) {
      if (actual === expected.slice(1)) return false;
    } else if (expected === "$exists") {
      // A dimension "exists" only when Sense produced a non-empty, non-'unknown'
      // value. Sense always emits all 9 dimensions (defaulting to 'unknown' when
      // nothing was detected); treating 'unknown' as "exists" would activate
      // e.g. data-design.pack on projects with no persistence at all.
      if (!actual || actual === "unknown") return false;
    } else if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else {
      if (actual !== expected) return false;
    }
  }

  return true;
}

function mergeArtifacts(packs: Pack[]): {
  artifacts: any[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const artifactMap = new Map();

  for (const pack of packs) {
    for (const artifact of pack.provides?.artifacts || []) {
      const existing = artifactMap.get(artifact.id);
      if (!existing) {
        artifactMap.set(artifact.id, { ...artifact, provided_by: pack.name });
      } else if (existing.provided_by !== pack.name) {
        // Check for conflicts
        if (
          existing.schema_ref !== artifact.schema_ref &&
          existing.priority <= pack.priority
        ) {
          warnings.push(
            `Artifact schema conflict for ${artifact.id}: ${existing.provided_by} vs ${pack.name}`,
          );
        }
      }
    }
  }

  return { artifacts: Array.from(artifactMap.values()), warnings };
}

function mergeActions(packs: Pack[]): string[] {
  const actions = new Set<string>();
  for (const pack of packs) {
    for (const action of pack.provides?.actions || []) {
      actions.add(action);
    }
  }
  return Array.from(actions);
}

function mergeChecks(packs: Pack[]): { checks: any[]; warnings: string[] } {
  const warnings: string[] = [];
  const checkMap = new Map();

  for (const pack of packs) {
    for (const check of pack.provides?.checks || []) {
      const existing = checkMap.get(check.id);
      if (!existing) {
        checkMap.set(check.id, { ...check, provided_by: pack.name });
      }
      // Duplicates are fine - just deduplicate
    }
  }

  return { checks: Array.from(checkMap.values()), warnings };
}

function assembleGates(packs: Pack[]): { gates: Gate[]; warnings: string[] } {
  const warnings: string[] = [];
  const gateMap = new Map<string, Gate>();

  // First pass: collect base gate definitions from provides.gates
  for (const pack of packs) {
    for (const gate of pack.provides?.gates || []) {
      const existing = gateMap.get(gate.id);
      if (!existing) {
        gateMap.set(gate.id, {
          ...gate,
          require_artifacts: gate.require_artifacts || [],
          require_checks: gate.require_checks || [],
          require_traces: gate.require_traces || [],
          require_contracts_current: gate.require_contracts_current || false,
          forbid: gate.forbid || [],
          provided_by: pack.name,
        });
      }
    }
  }

  // Second pass: apply gate_patches
  for (const pack of packs) {
    const patches =
      pack.provides?.gate_patches || ({} as Record<string, GatePatch>);
    for (const [gateId, patch] of Object.entries(patches)) {
      const gate = gateMap.get(gateId);
      if (!gate) {
        warnings.push(
          `Gate patch target '${gateId}' not found, provided by pack '${pack.name}'`,
        );
        continue;
      }

      if (patch.add_artifacts) {
        gate.require_artifacts = [
          ...new Set([...gate.require_artifacts, ...patch.add_artifacts]),
        ];
      }
      if (patch.add_checks) {
        gate.require_checks = [
          ...new Set([...gate.require_checks, ...patch.add_checks]),
        ];
      }
      if (patch.add_traces) {
        gate.require_traces = [...gate.require_traces, ...patch.add_traces];
      }
    }
  }

  return { gates: Array.from(gateMap.values()), warnings };
}

function assembleTracks(
  packs: Pack[],
  artifacts: any[],
): { tracks: TrackContribution[]; warnings: string[] } {
  const warnings: string[] = [];
  const tracks: TrackContribution[] = [];

  for (const pack of packs) {
    if (pack.contributes_track) {
      tracks.push({
        ...pack.contributes_track,
        provided_by: pack.name,
      });
    }
  }

  // Connect contract producers/consumers
  const contracts = artifacts.filter((a) => a.id.startsWith("contract/"));
  for (const contract of contracts) {
    if (contract.default_producer) {
      const track = tracks.find((t) => t.id === contract.default_producer);
      if (track) {
        track.produces = [...new Set([...(track.produces || []), contract.id])];
      }
    }
    for (const consumerId of contract.default_consumers || []) {
      const track = tracks.find((t) => t.id === consumerId);
      if (track && track.id !== contract.default_producer) {
        track.consumes = [...new Set([...(track.consumes || []), contract.id])];
      }
    }
  }

  // Scope uniqueness check
  const scopeCounts = new Map<string, number>();
  for (const track of tracks) {
    scopeCounts.set(track.scope, (scopeCounts.get(track.scope) || 0) + 1);
  }
  for (const [scope, count] of scopeCounts.entries()) {
    if (count > 1) {
      warnings.push(
        `Multiple tracks share scope '${scope}' - this may cause conflicts`,
      );
    }
  }

  // Cross-track shared contract opportunity detection (§6.3 layer 3)
  // When ≥2 tracks consume a contract that no track produces, emit a
  // human-reviewable suggestion to introduce contract/shared-lib (single
  // producer, multi-consumer). Does NOT auto-wire — premature abstraction
  // is worse than duplication (three similar lines shouldn't harden into a contract).
  const sharedSuggestions = detectSharedContractOpportunities(tracks);
  warnings.push(...sharedSuggestions);

  return { tracks, warnings };
}

/**
 * Scan tracks for contracts consumed by ≥2 tracks but produced by none.
 * Returns warnings suggesting human review to introduce a shared contract.
 *
 * Per schemas.md §6.3:
 *   reuse 扫描发现同一能力被 ≥2 个 track 需要 → Compose 期人工建议引入
 *   contract/shared-lib(单 producer、多 consumer)
 *   不自动连边(避免过早抽象:三行相似不该硬拗成契约)
 */
function detectSharedContractOpportunities(
  tracks: TrackContribution[],
): string[] {
  const warnings: string[] = [];

  // Collect all produced and consumed contract IDs
  const produced = new Set<string>();
  for (const track of tracks) {
    for (const p of track.produces || []) {
      if (p.startsWith("contract/")) produced.add(p);
    }
  }

  // Count consumers per consumed contract (excluding produced ones)
  const consumers = new Map<string, string[]>();
  for (const track of tracks) {
    for (const c of track.consumes || []) {
      if (!c.startsWith("contract/")) continue;
      if (produced.has(c)) continue; // already has a producer — not an opportunity
      if (!consumers.has(c)) consumers.set(c, []);
      consumers.get(c)!.push(track.id);
    }
  }

  // Emit suggestions for contracts consumed by ≥2 tracks
  for (const [contractId, consumerList] of consumers.entries()) {
    if (consumerList.length >= 2) {
      warnings.push(
        `shared-contract opportunity: '${contractId}' consumed by ${consumerList.length} tracks (${consumerList.join(", ")}) but produced by none — consider introducing a contract/shared-lib (single producer, multi-consumer); review before wiring to avoid premature abstraction`,
      );
    }
  }

  return warnings;
}

function selectPipelineSkeleton(
  intentPack: Pack | null,
  allPacks: Pack[],
): any {
  if (intentPack?.provides?.pipeline_skeleton) {
    return intentPack.provides.pipeline_skeleton;
  }

  // Fallback to foundation pack
  const foundation = allPacks.find((p) => p.name === "foundation");
  if (foundation?.provides?.pipeline_skeleton) {
    return foundation.provides.pipeline_skeleton;
  }

  // Ultimate fallback
  return {
    stages: ["implement", "review", "test", "accept"],
    max_retries: 5,
    on_exhausted: "escalate",
  };
}

function mergeAcceptanceLayers(packs: Pack[]): Record<string, any> {
  const layers: Record<string, { required: boolean; checks: string[] }> = {
    unit: { required: false, checks: [] },
    integration: { required: false, checks: [] },
    system: { required: false, checks: [] },
    deployment: { required: false, checks: [] },
  };

  for (const pack of packs) {
    const packLayers = pack.provides?.acceptance_layers || {};
    for (const [layerName, layerDef] of Object.entries(packLayers)) {
      if (!layers[layerName]) {
        layers[layerName] = { required: false, checks: [] };
      }
      layers[layerName].required ||= (layerDef as any).required || false;
      layers[layerName].checks = [
        ...new Set([
          ...layers[layerName].checks,
          ...((layerDef as any).checks || []),
        ]),
      ];
    }
  }

  return layers;
}

/**
 * Auto-inject checks from required acceptance layers into the exit-merged gate.
 *
 * The 4-layer acceptance model (unit/integration/system/deployment) is a
 * kernel-level principle per CLAUDE.md. Packs declare which layers are
 * required and what checks belong to each. This function makes the gate
 * actually enforce that declaration: any layer with required=true contributes
 * its checks to exit-merged.require_checks.
 *
 * Returns warnings for layers that are required but empty (no checks) —
 * the user declared a requirement they have no way to verify.
 */
function injectRequiredLayerChecks(
  gates: Gate[],
  acceptanceLayers: Record<string, { required: boolean; checks: string[] }>,
): string[] {
  const warnings: string[] = [];
  const exitGate = gates.find((g) => g.id === "exit-merged");
  if (!exitGate) return warnings;

  const toInject: string[] = [];
  for (const [layerName, def] of Object.entries(acceptanceLayers)) {
    if (def.required && def.checks.length === 0) {
      warnings.push(
        `acceptance layer '${layerName}' is required but has no checks — cannot enforce`,
      );
      continue;
    }
    if (def.required) {
      for (const checkId of def.checks) {
        if (!exitGate.require_checks.includes(checkId)) {
          toInject.push(checkId);
        }
      }
    }
  }

  if (toInject.length > 0) {
    exitGate.require_checks = [
      ...new Set([...exitGate.require_checks, ...toInject]),
    ];
  }

  return warnings;
}

function deriveTraces(
  artifacts: any[],
  gates: Gate[],
  tracks: TrackContribution[],
): TraceQuery[] {
  const traces: TraceQuery[] = [];

  // From gates.require_traces
  for (const gate of gates) {
    for (const trace of gate.require_traces || []) {
      traces.push(trace);
    }
  }

  // Contract edges
  const contracts = artifacts.filter((a) => a.id.startsWith("contract/"));
  for (const contract of contracts) {
    for (const track of tracks) {
      if (track.produces?.includes(contract.id)) {
        traces.push({
          name: `${track.id}_produces_${contract.id}`,
          from_kind: track.id,
          to_kind: contract.id,
          via: ["produces"],
          cardinality: "single",
        });
      }
      if (track.consumes?.includes(contract.id)) {
        traces.push({
          name: `${track.id}_consumes_${contract.id}`,
          from_kind: contract.id,
          to_kind: track.id,
          via: ["consumes"],
          cardinality: "single",
        });
      }
    }
  }

  return traces;
}

function detectConflicts(
  artifacts: any[],
  checks: any[],
  gates: Gate[],
  tracks: TrackContribution[],
): string[] {
  const errors: string[] = [];

  // Gate references non-existent artifact
  for (const gate of gates) {
    for (const artifactId of gate.require_artifacts || []) {
      if (!artifacts.some((a) => a.id === artifactId)) {
        errors.push(
          `Gate '${gate.id}' requires artifact '${artifactId}' but no pack provides it`,
        );
      }
    }
    for (const checkId of gate.require_checks || []) {
      if (!checks.some((c) => c.id === checkId)) {
        errors.push(
          `Gate '${gate.id}' requires check '${checkId}' but no pack provides it`,
        );
      }
    }
  }

  return errors;
}

/**
 * Merge agent declarations from all active packs.
 * Higher-priority packs override same-id agents from lower-priority packs.
 * Agents with different ids are merged (union).
 */
function mergeAgents(packs: Pack[]): {
  agents: AgentDecl[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const agentMap = new Map<
    string,
    { agent: AgentDecl; pack: string; priority: number }
  >();

  for (const pack of packs) {
    for (const agent of pack.provides?.agents || []) {
      const existing = agentMap.get(agent.id);
      if (!existing) {
        agentMap.set(agent.id, {
          agent,
          pack: pack.name,
          priority: pack.priority || 0,
        });
      } else if ((pack.priority || 0) > existing.priority) {
        warnings.push(
          `agent '${agent.id}' overridden by higher-priority pack '${pack.name}' (was '${existing.pack}')`,
        );
        agentMap.set(agent.id, {
          agent,
          pack: pack.name,
          priority: pack.priority || 0,
        });
      }
    }
  }

  const agents = Array.from(agentMap.values()).map((e) => e.agent);
  return { agents, warnings };
}

/**
 * Merge agent bindings from all active packs.
 * Higher-priority packs override same-action bindings from lower-priority packs.
 * Each binding maps action → agent_id, with provided_by tracking.
 */
function mergeAgentBindings(packs: Pack[]): {
  agentBindings: AgentBinding[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const bindingMap = new Map<
    string,
    { binding: AgentBinding; priority: number }
  >();

  for (const pack of packs) {
    const bindings = pack.provides?.agent_bindings || {};
    for (const [action, agentId] of Object.entries(bindings)) {
      const existing = bindingMap.get(action);
      if (!existing) {
        bindingMap.set(action, {
          binding: { action, agent_id: agentId, provided_by: pack.name },
          priority: pack.priority || 0,
        });
      } else if ((pack.priority || 0) > existing.priority) {
        warnings.push(
          `agent binding for '${action}' overridden by '${pack.name}' (was '${existing.binding.provided_by}')`,
        );
        bindingMap.set(action, {
          binding: { action, agent_id: agentId, provided_by: pack.name },
          priority: pack.priority || 0,
        });
      }
    }
  }

  const agentBindings = Array.from(bindingMap.values()).map((e) => e.binding);
  return { agentBindings, warnings };
}

/**
 * Merge meeting declarations from all active packs.
 * Higher-priority packs override same-id meetings.
 * Meetings with different ids are merged (union).
 */
function mergeMeetings(packs: Pack[]): {
  meetings: MeetingDecl[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const meetingMap = new Map<
    string,
    { meeting: MeetingDecl; pack: string; priority: number }
  >();

  for (const pack of packs) {
    for (const meeting of pack.provides?.meetings || []) {
      const existing = meetingMap.get(meeting.id);
      if (!existing) {
        meetingMap.set(meeting.id, {
          meeting,
          pack: pack.name,
          priority: pack.priority || 0,
        });
      } else if ((pack.priority || 0) > existing.priority) {
        warnings.push(
          `meeting '${meeting.id}' overridden by higher-priority pack '${pack.name}' (was '${existing.pack}')`,
        );
        meetingMap.set(meeting.id, {
          meeting,
          pack: pack.name,
          priority: pack.priority || 0,
        });
      }
    }
  }

  const meetings = Array.from(meetingMap.values()).map((e) => e.meeting);
  return { meetings, warnings };
}
