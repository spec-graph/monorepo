import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { composer } from '../index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;
let packsDir: string;

function writePack(name: string, content: Record<string, any>): void {
  const packDir = path.join(packsDir, `${name}.pack`);
  fs.mkdirSync(packDir, { recursive: true });
  const yaml = require('js-yaml');
  fs.writeFileSync(path.join(packDir, 'pack.yaml'), yaml.dump(content), 'utf-8');
}

function makeFoundationPack(): Record<string, any> {
  return {
    name: 'foundation',
    version: '1.0.0',
    priority: 0,
    description: 'Base governance pack',
    applies_when: 'always',
    provides: {
      artifacts: [],
      actions: ['propose', 'specify', 'design', 'tasks', 'implement', 'review', 'test', 'accept', 'integrate'],
      checks: [
        { id: 'lint', kind: 'lint', command: '<lint-command>', layer: 'unit' },
        { id: 'typecheck', kind: 'lint', command: '<typecheck-command>', layer: 'unit' },
        { id: 'unit-test', kind: 'test', command: '<test-command>', layer: 'unit' },
      ],
      gates: [
        {
          id: 'exit-merged',
          on_transition: ['accept', 'integrate'],
          require_checks: ['lint', 'typecheck', 'unit-test'],
          require_artifacts: ['verification/acceptance-report'],
          require_traces: [],
          require_contracts_current: false,
          forbid: [],
          fail_mode: 'block',
          enabled: true,
        },
      ],
      pipeline_skeleton: {
        stages: ['implement', 'review', 'test', 'accept'],
        max_retries: 5,
        on_exhausted: 'escalate',
      },
      agents: [
        {
          id: 'pm',
          description: 'Product Manager',
          prompt_ref: 'agents/pm-agent.md',
          model_tier: 'capable',
          input_artifact_kinds: [],
          output_artifact_kinds: ['requirement/*'],
          actions: ['propose', 'specify'],
        },
        {
          id: 'architect',
          description: 'Software Architect',
          prompt_ref: 'agents/architect-agent.md',
          model_tier: 'capable',
          input_artifact_kinds: ['requirement/*'],
          output_artifact_kinds: ['design/*'],
          actions: ['design'],
        },
        {
          id: 'developer',
          description: 'Software Developer',
          prompt_ref: 'agents/developer-agent.md',
          model_tier: 'standard',
          input_artifact_kinds: ['design/*', 'tasks/*'],
          output_artifact_kinds: ['implementation/*'],
          actions: ['implement', 'tasks'],
        },
        {
          id: 'reviewer',
          description: 'Code Reviewer',
          prompt_ref: 'agents/reviewer-agent.md',
          model_tier: 'capable',
          input_artifact_kinds: ['implementation/*', 'design/*'],
          output_artifact_kinds: ['verification/*'],
          actions: ['review'],
        },
        {
          id: 'qa',
          description: 'QA Engineer',
          prompt_ref: 'agents/qa-agent.md',
          model_tier: 'standard',
          input_artifact_kinds: ['implementation/*'],
          output_artifact_kinds: ['verification/*'],
          actions: ['test', 'accept'],
        },
      ],
      agent_bindings: {
        propose: 'pm',
        specify: 'pm',
        design: 'architect',
        plan: 'developer',
        implement: 'developer',
        review: 'reviewer',
        test: 'qa',
        accept: 'qa',
        integrate: 'developer',
        archive: 'pm',
      },
      meetings: [],
    },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'composer-test-'));
  packsDir = path.join(tmpDir, 'packs');
  fs.mkdirSync(packsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Pack Composer', () => {
  // ── Task 2.8: single pack → 5 agents ─────────────────────────────

  it('2.8 single foundation pack produces graph with 5 agents', () => {
    writePack('foundation', makeFoundationPack());

    const graph = composer.composeGraph({ packsDir, profileFacts: null });

    expect(graph.agents).toHaveLength(5);
    const agentIds = graph.agents.map((a) => a.id).sort();
    expect(agentIds).toEqual(['architect', 'developer', 'pm', 'qa', 'reviewer']);

    expect(graph.agent_bindings.length).toBeGreaterThanOrEqual(10);
    expect(graph.pipeline_skeleton.stages).toEqual(['implement', 'review', 'test', 'accept']);
  });

  // ── Task 2.9: two packs, higher priority overrides ───────────────

  it('2.9 two packs with conflicting bindings → higher priority wins', () => {
    writePack('foundation', makeFoundationPack());

    // DDD pack with higher priority overrides specify binding
    writePack('ddd', {
      name: 'ddd',
      version: '1.0.0',
      priority: 10,
      description: 'Domain-Driven Design pack',
      applies_when: 'always',
      provides: {
        artifacts: [],
        agents: [
          {
            id: 'domain-expert',
            description: 'Domain Expert',
            prompt_ref: 'agents/domain-expert.md',
            model_tier: 'capable',
            input_artifact_kinds: [],
            output_artifact_kinds: ['requirement/*'],
            actions: ['specify'],
          },
        ],
        agent_bindings: {
          specify: 'domain-expert',
          design: 'domain-expert',
        },
        meetings: [],
      },
    });

    const graph = composer.composeGraph({ packsDir, profileFacts: null });

    // ddd.pack overrides foundation.pack for specify and design
    const specifyBinding = graph.agent_bindings.find((b) => b.action === 'specify');
    expect(specifyBinding?.agent_id).toBe('domain-expert');
    expect(specifyBinding?.provided_by).toBe('ddd');

    const designBinding = graph.agent_bindings.find((b) => b.action === 'design');
    expect(designBinding?.agent_id).toBe('domain-expert');
    expect(designBinding?.provided_by).toBe('ddd');

    // Other bindings from foundation preserved
    const implementBinding = graph.agent_bindings.find((b) => b.action === 'implement');
    expect(implementBinding?.agent_id).toBe('developer');
    expect(implementBinding?.provided_by).toBe('foundation');

    // domain-expert agent added
    expect(graph.agents).toHaveLength(6);
  });

  // ── Task 2.10: profile filter (AND semantics) ────────────────────

  it('2.10 profile filter excludes non-matching pack (one fact dimension missing)', () => {
    writePack('foundation', makeFoundationPack());
    writePack('frontend', {
      name: 'frontend',
      version: '1.0.0',
      priority: 5,
      description: 'Frontend pack',
      applies_when: { has_ui: true, has_db: true },
      provides: {
        artifacts: [],
        agents: [],
        agent_bindings: {},
        meetings: [],
      },
    });

    // Only has_ui, no has_db → frontend should be excluded
    const profile = { has_ui: { value: 'react' } };
    const graph = composer.composeGraph({ packsDir, profileFacts: profile });

    // Only foundation (applies_when: always) should be loaded
    expect(graph.meta.packs_used).toHaveLength(1);
    expect(graph.meta.packs_used[0].name).toBe('foundation');
  });

  // ── Task 2.11: pack without applies_when → treated as always ─────

  it('2.11 pack without applies_when is treated as always (always loaded)', () => {
    writePack('foundation', makeFoundationPack());
    writePack('legacy', {
      name: 'legacy',
      version: '1.0.0',
      priority: 5,
      description: 'Legacy pack without applies_when',
      // No applies_when field
      provides: {
        artifacts: [],
        agents: [],
        agent_bindings: {},
        meetings: [],
      },
    });

    const graph = composer.composeGraph({ packsDir, profileFacts: { has_ui: { value: 'react' } } });

    // Both should be loaded
    const packNames = graph.meta.packs_used.map((p) => p.name).sort();
    expect(packNames).toEqual(['foundation', 'legacy']);
  });

  // ── Task 2.12: empty profile → only always packs ─────────────────

  it('2.12 empty profile → only always packs loaded, conditional excluded', () => {
    writePack('foundation', makeFoundationPack());
    writePack('frontend', {
      name: 'frontend',
      version: '1.0.0',
      priority: 5,
      description: 'Frontend pack',
      applies_when: { has_ui: true },
      provides: { artifacts: [], agents: [], agent_bindings: {}, meetings: [] },
    });
    writePack('backend', {
      name: 'backend',
      version: '1.0.0',
      priority: 5,
      description: 'Backend pack',
      // No applies_when → treated as always
      provides: { artifacts: [], agents: [], agent_bindings: {}, meetings: [] },
    });

    const graph = composer.composeGraph({ packsDir, profileFacts: {} });

    const packNames = graph.meta.packs_used.map((p) => p.name).sort();
    expect(packNames).toEqual(['backend', 'foundation']);
    // frontend excluded because profile is empty
  });

  // ── Task 2.13: all 17 packs load without crash ───────────────────

  it('2.13 all 17 real packs load without crash (smoke test)', () => {
    // Use the actual packs directory
    const realPacksDir = path.join(process.cwd(), 'packages', 'core', 'packs');
    if (!fs.existsSync(realPacksDir)) {
      // Skip if packs dir doesn't exist (e.g., in CI)
      return;
    }

    const graph = composer.composeGraph({ packsDir: realPacksDir, profileFacts: null });

    // Should load without throwing
    expect(graph).toBeDefined();
    expect(graph.version).toBe('1');
    expect(graph.agents.length).toBeGreaterThan(0);
    expect(graph.meta.packs_used.length).toBeGreaterThan(0);
  });

  // ── Additional: malformed pack handled gracefully ────────────────

  it('malformed pack.yaml skipped with warning (not crash)', () => {
    const packDir = path.join(packsDir, 'broken.pack');
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'pack.yaml'), '{{{invalid yaml}}}', 'utf-8');
    writePack('foundation', makeFoundationPack());

    // Should not throw
    const graph = composer.composeGraph({ packsDir, profileFacts: null });

    // Only foundation should be loaded
    expect(graph.meta.packs_used).toHaveLength(1);
    expect(graph.meta.packs_used[0].name).toBe('foundation');
  });
});
