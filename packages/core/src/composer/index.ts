/**
 * Pack Composer — assemble packs into a unified workflow Graph.
 *
 * Scans pack directories, filters by profile facts (AND semantics),
 * merges by priority, and writes the composed Graph to graph.yaml.
 *
 * This is the SINGLE SOURCE OF TRUTH for agent config, bindings, gates,
 * checks, and pipeline structure. Dispatch consumes graph.yaml instead
 * of scanning packs directly.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type {
  Graph,
  Pack,
  AgentDecl,
  AgentBinding,
  CheckDecl,
  GateDecl,
  Gate,
  ArtifactDecl,
  TrackContribution,
  PipelineSkeleton,
  MeetingDecl,
  Profile,
  ProjectConfig,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComposeOptions {
  /** Directory containing *.pack subdirectories */
  packsDir: string;
  /** Project profile facts (from sense module) */
  profileFacts: Record<string, { value: string }> | null;
  /** Optional change type for change-intent pack filtering */
  changeType?: string;
  /** Optional project config to embed in graph */
  projectConfig?: ProjectConfig;
}

/**
 * Compose a unified Graph from all matching packs.
 *
 * Pipeline:
 *   1. Scan packsDir for *.pack/pack.yaml
 *   2. Filter by applies_when (AND semantics against profileFacts)
 *   3. Sort by priority (ascending)
 *   4. Merge: higher priority overrides conflicts
 *   5. Return composed Graph
 */
export function composeGraph(options: ComposeOptions): Graph {
  const { packsDir, profileFacts, changeType, projectConfig } = options;

  // 1. Scan packs
  const packs = scanPacks(packsDir);

  // 2. Filter
  const active = packs.filter((p) => packMatches(p, profileFacts, changeType));

  // 3. Sort by priority ascending (lower priority merged first, higher overrides)
  active.sort((a, b) => a.priority - b.priority);

  // 4. Merge
  const graph = mergePacks(active, profileFacts, projectConfig);

  return graph;
}

/**
 * Compose and write graph.yaml to disk.
 */
export function composeToFile(options: ComposeOptions, outputPath: string): Graph {
  const graph = composeGraph(options);
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, yaml.dump(graph, { lineWidth: 120, noRefs: true }), 'utf-8');
  return graph;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function scanPacks(packsDir: string): Pack[] {
  const packs: Pack[] = [];

  if (!fs.existsSync(packsDir)) return packs;

  const entries = fs.readdirSync(packsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith('.pack')) continue;

    const packYamlPath = path.join(packsDir, entry.name, 'pack.yaml');
    if (!fs.existsSync(packYamlPath)) continue;

    try {
      const raw = fs.readFileSync(packYamlPath, 'utf-8');
      const pack = yaml.load(raw) as Pack;
      if (!pack.name || !pack.provides) {
        console.warn(`[composer] Warning: ${entry.name}/pack.yaml missing required fields (name, provides) — skipping`);
        continue;
      }
      packs.push(pack);
    } catch (err) {
      console.warn(`[composer] Warning: failed to parse ${entry.name}/pack.yaml — ${(err as Error).message}`);
    }
  }

  return packs;
}

// ---------------------------------------------------------------------------
// Profile filtering (AND semantics)
// ---------------------------------------------------------------------------

function packMatches(
  pack: Pack,
  profileFacts: Record<string, { value: string }> | null,
  _changeType?: string
): boolean {
  // No applies_when → treated as always
  if (!pack.applies_when) return true;

  // Explicit always
  if (pack.applies_when === 'always') return true;

  // Conditional: match all facts with AND semantics
  const conditions = pack.applies_when as Record<string, any>;

  // Empty profile → only always packs (handled above), conditional packs excluded
  if (!profileFacts || Object.keys(profileFacts).length === 0) return false;

  for (const [dim, expected] of Object.entries(conditions)) {
    const fact = profileFacts[dim];

    if (expected === true) {
      // Dimension MUST exist with non-empty value
      if (!fact || !fact.value || fact.value.trim() === '') return false;
    } else if (expected === false) {
      // Dimension MUST NOT exist (or must be empty)
      if (fact && fact.value && fact.value.trim() !== '') return false;
    } else {
      // Unknown expected value — skip this dimension (conservative)
      continue;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Priority-based merge
// ---------------------------------------------------------------------------

function mergePacks(
  packs: Pack[],
  profileFacts: Record<string, { value: string }> | null,
  projectConfig?: ProjectConfig
): Graph {
  const agents: AgentDecl[] = [];
  const agentBindings: AgentBinding[] = [];
  const bindingMap = new Map<string, AgentBinding>(); // action → binding
  const checks: CheckDecl[] = [];
  const checkMap = new Map<string, CheckDecl>(); // check.id → check
  const gates: Gate[] = [];
  const gateMap = new Map<string, Gate>(); // gate.id → gate
  const artifacts: ArtifactDecl[] = [];
  const artifactMap = new Map<string, ArtifactDecl>();
  const tracks: TrackContribution[] = [];
  const trackMap = new Map<string, TrackContribution>();
  const meetings: MeetingDecl[] = [];
  const meetingMap = new Map<string, MeetingDecl>();
  const actions = new Set<string>();

  let pipelineSkeleton: PipelineSkeleton = {
    stages: ['implement', 'review', 'test', 'accept'],
    max_retries: 3,
    on_exhausted: 'escalate',
  };
  let acceptanceLayers: Record<string, { required: boolean; checks: string[] }> = {};
  let scopePolicy = undefined;
  const packsUsed: Graph['meta']['packs_used'] = [];

  for (const pack of packs) {
    packsUsed.push({
      name: pack.name,
      matched: pack.applies_when || 'always',
      priority: pack.priority,
    });

    const p = pack.provides;

    // Agents — merge by id (higher priority overrides)
    if (p.agents) {
      for (const agent of p.agents) {
        const existing = agents.find((a) => a.id === agent.id);
        if (existing) {
          Object.assign(existing, agent);
        } else {
          agents.push({ ...agent });
        }
      }
    }

    // Agent bindings — merge by action (higher priority overrides)
    if (p.agent_bindings) {
      for (const [action, agentId] of Object.entries(p.agent_bindings)) {
        const binding: AgentBinding = {
          action,
          agent_id: agentId,
          provided_by: pack.name,
        };
        bindingMap.set(action, binding);
      }
    }

    // Checks — merge by id
    if (p.checks) {
      for (const check of p.checks) {
        checkMap.set(check.id, check);
      }
    }

    // Gates — merge by id (with gate_patches applied)
    if (p.gates) {
      for (const gate of p.gates) {
        const g: Gate = {
          ...gate,
          require_artifacts: gate.require_artifacts || [],
          require_checks: gate.require_checks || [],
          require_traces: gate.require_traces || [],
          require_contracts_current: gate.require_contracts_current ?? false,
          forbid: gate.forbid || [],
          provided_by: pack.name,
        };
        gateMap.set(gate.id, g);
      }
    }

    // Artifacts — merge by id
    if (p.artifacts) {
      for (const art of p.artifacts) {
        artifactMap.set(art.id, art);
      }
    }

    // Actions — union
    if (p.actions) {
      for (const action of p.actions) {
        actions.add(action);
      }
    }

    // Tracks — merge by id
    if (pack.contributes_track) {
      const track = pack.contributes_track;
      trackMap.set(track.id, { ...track, provided_by: pack.name });
    }

    // Pipeline skeleton — highest priority wins
    if (p.pipeline_skeleton) {
      pipelineSkeleton = p.pipeline_skeleton;
    }

    // Acceptance layers — merge (higher priority overrides same layer)
    if (p.acceptance_layers) {
      for (const [layerId, layer] of Object.entries(p.acceptance_layers)) {
        acceptanceLayers[layerId] = {
          required: layer.required ?? false,
          checks: layer.checks ?? [],
        };
      }
    }

    // Scope policy — highest priority wins
    if (p.scope_policy) {
      scopePolicy = p.scope_policy;
    }

    // Meetings — merge by id
    if (p.meetings) {
      for (const meeting of p.meetings) {
        meetingMap.set(meeting.id, meeting);
      }
    }
  }

  // Apply gate_patches: for each pack's gate_patches, modify referenced gates
  for (const pack of packs) {
    if (pack.provides.gate_patches) {
      for (const [gateId, patch] of Object.entries(pack.provides.gate_patches)) {
        const gate = gateMap.get(gateId);
        if (!gate) continue;
        if (patch.add_artifacts) {
          gate.require_artifacts = [...new Set([...gate.require_artifacts, ...patch.add_artifacts])];
        }
        if (patch.add_checks) {
          gate.require_checks = [...new Set([...gate.require_checks, ...patch.add_checks])];
        }
        if (patch.add_traces) {
          gate.require_traces = [...gate.require_traces, ...patch.add_traces];
        }
      }
    }
  }

  return {
    version: '1',
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: profileFacts ? hashProfile(profileFacts) : 'empty',
      packs_used: packsUsed,
    },
    artifacts: Array.from(artifactMap.values()),
    actions: Array.from(actions),
    checks: Array.from(checkMap.values()),
    gates: Array.from(gateMap.values()),
    tracks: Array.from(trackMap.values()),
    pipeline_skeleton: pipelineSkeleton,
    acceptance_layers: acceptanceLayers,
    scope_policy: scopePolicy,
    agents,
    agent_bindings: Array.from(bindingMap.values()),
    meetings: Array.from(meetingMap.values()),
    project_config: projectConfig,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashProfile(facts: Record<string, { value: string }>): string {
  const keys = Object.keys(facts).sort();
  const parts = keys.map((k) => `${k}=${facts[k].value}`);
  // Simple hash — enough for detecting profile changes
  return Buffer.from(parts.join(';')).toString('base64').slice(0, 12);
}
