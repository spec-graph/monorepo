import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import { generateDispatchManifest } from './index.js';

describe('dispatch manifest generator', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-graph-dispatch-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    } catch {}
  });

  it('returns empty manifest when no session exists', () => {
    // Use a non-existent session ID
    const manifest = generateDispatchManifest('nonexistent', projectRoot);
    expect(manifest.version).toBe('1');
    expect(manifest.session_id).toBe('nonexistent');
    expect(manifest.done).toBe(false);
    expect(manifest.actions.length).toBe(0);
  });

  it('produces a single action for specify stage', () => {
    // Create a session at specify stage
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    // Write minimal state.yaml
    const stateYaml = `sessionId: "test-session"
intent: "Test feature"
stage: "specify"
state: "running"
retryCount: 0

plan:
  sessionId: "test-session"
  intent: "Test feature"
  complexity: "medium"
  capabilities:
    - id: "cap-1"
      description: "Test capability"
  risks:
    - "test risk"
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const manifest = generateDispatchManifest('test-session', projectRoot);

    expect(manifest.version).toBe('1');
    expect(manifest.session_id).toBe('test-session');
    expect(manifest.current_stage).toBe('specify');
    expect(manifest.done).toBe(false);
    expect(manifest.actions.length).toBe(1);

    const action = manifest.actions[0];
    expect(action.type).toBe('perform_stage');
    expect(action.id).toBe('specify');
    expect(action.requires_sub_agent).toBe(true);
    expect(action.parallel_group).toBeUndefined(); // No parallel for single action
    expect(action.prompt).toContain('Spec-Graph Sub-Agent Dispatch');
    expect(action.prompt).toContain('specify');
  });

  it('produces parallel actions for implement stage with waves', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'impl-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    // Plan with dependent capabilities (creates waves)
    const stateYaml = `sessionId: "impl-session"
intent: "Add JWT auth"
stage: "implement"
state: "running"
retryCount: 0

plan:
  sessionId: "impl-session"
  intent: "Add JWT auth"
  complexity: "high"
  capabilities:
    - id: "user-model"
      description: "User data model"
      dependsOn: []
    - id: "auth-endpoints"
      description: "Auth endpoints"
      dependsOn:
        - "user-model"
    - id: "books-api"
      description: "Books CRUD"
      dependsOn: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const manifest = generateDispatchManifest('impl-session', projectRoot);

    expect(manifest.current_stage).toBe('implement');
    expect(manifest.actions.length).toBe(3);

    // Wave 0: user-model + books-api (no deps)
    const wave0Actions = manifest.actions.filter(a => a.parallel_group === 0);
    expect(wave0Actions.length).toBe(2);
    const wave0Ids = wave0Actions.map(a => a.id).sort();
    expect(wave0Ids).toEqual(['books-api', 'user-model']);

    // Wave 1: auth-endpoints (depends on user-model)
    const wave1Actions = manifest.actions.filter(a => a.parallel_group === 1);
    expect(wave1Actions.length).toBe(1);
    expect(wave1Actions[0].id).toBe('auth-endpoints');

    // Each action should have parallel_group set
    for (const action of manifest.actions) {
      expect(action.parallel_group).toBeDefined();
      expect(typeof action.parallel_group).toBe('number');
    }
  });

  it('assembles full prompt envelope with agent info', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'env-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const stateYaml = `sessionId: "env-session"
intent: "Test feature"
stage: "specify"
state: "running"
retryCount: 0

plan:
  sessionId: "env-session"
  intent: "Test feature"
  complexity: "low"
  capabilities: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    // Use the actual packs dir from the monorepo
    const packsDir = path.join(__dirname, '..', '..', 'packs');
    const manifest = generateDispatchManifest('env-session', projectRoot, packsDir);

    expect(manifest.actions.length).toBe(1);
    const action = manifest.actions[0];

    // Prompt should contain the envelope structure
    expect(action.prompt).toContain('## Identity');
    expect(action.prompt).toContain('## System Prompt');
    expect(action.prompt).toContain('## Task Context');
    expect(action.prompt).toContain('## Input Artifacts');
    expect(action.prompt).toContain('## Output Specification (MUST)');
    expect(action.prompt).toContain('## File Scope (MUST)');
    expect(action.prompt).toContain('## Verification (MUST');
    expect(action.prompt).toContain('## Status Report Protocol (MUST)');
    expect(action.prompt).toContain('## After Completion');

    // Protocol fields should be populated
    expect(action.output_spec).toBeDefined();
    expect(action.output_spec?.path).toContain('.spec-graph/sessions');
    expect(action.file_scope).toBeDefined();
    expect(action.file_scope?.forbid).toContain('.git/**');

    // Agent info should be populated
    expect(action.agent_id).toBeDefined();
    expect(action.agent_prompt_ref).toBeDefined();
    expect(action.model_tier).toBeDefined();
  });

  it('reports missing artifacts when gate not passed', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'gate-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const stateYaml = `sessionId: "gate-session"
intent: "Test feature"
stage: "specify"
state: "running"
retryCount: 0

plan:
  sessionId: "gate-session"
  intent: "Test feature"
  complexity: "low"
  capabilities: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    // Don't create the required artifact (specify/proposal.md)
    const manifest = generateDispatchManifest('gate-session', projectRoot);

    expect(manifest.gate_passed).toBe(false);
    expect(manifest.blocking_gate).toBe('specify');
    expect(manifest.missing_artifacts).toContain('specify/proposal.md');
  });

  it('returns done=true when session is completed', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'done-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const stateYaml = `sessionId: "done-session"
intent: "Test feature"
stage: "integrate"
state: "completed"
retryCount: 0

plan:
  sessionId: "done-session"
  intent: "Test feature"
  complexity: "low"
  capabilities: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const manifest = generateDispatchManifest('done-session', projectRoot);

    expect(manifest.done).toBe(true);
    expect(manifest.actions.length).toBe(0);
    expect(manifest.gate_passed).toBe(true);
  });

  // ── Section 4: Sub-Agent Protocol Verification ───────────────────

  // Task 4.1: STAGE_OUTPUT_MAP covers all 8 stages
  // Task 4.2: buildPromptEnvelope has all 9 sections
  // Task 4.3: output_spec, file_scope, verification populated

  it('4.4 envelope contains all 9 required section headers', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'envelope-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const stateYaml = `sessionId: "envelope-session"
intent: "Test envelope"
stage: "specify"
state: "running"
retryCount: 0

plan:
  sessionId: "envelope-session"
  intent: "Test envelope"
  complexity: "low"
  capabilities: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const manifest = generateDispatchManifest('envelope-session', projectRoot);
    const action = manifest.actions[0];
    expect(action).toBeDefined();
    const prompt = action.prompt;

    // All 9 required sections
    const requiredSections = [
      '## Identity',
      '## System Prompt',
      '## Task Context',
      '## Input Artifacts',
      '## Output Specification',
      '## File Scope',
      '## Verification',
      '## Status Report Protocol',
      '## After Completion',
    ];

    for (const section of requiredSections) {
      expect(prompt).toContain(section);
    }
  });

  it('4.5 implement stage envelope has lint/test/typecheck commands populated', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'impl-env-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const stateYaml = `sessionId: "impl-env-session"
intent: "Implement feature"
stage: "implement"
state: "running"
retryCount: 0

plan:
  sessionId: "impl-env-session"
  intent: "Implement feature"
  complexity: "low"
  capabilities: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const manifest = generateDispatchManifest('impl-env-session', projectRoot);
    const action = manifest.actions[0];
    expect(action).toBeDefined();

    // output_spec should be populated
    expect(action.output_spec).toBeDefined();
    expect(action.output_spec?.path).toBeTruthy();

    // file_scope should have all three arrays
    expect(action.file_scope).toBeDefined();
    expect(action.file_scope?.read).toBeDefined();
    expect(action.file_scope?.read?.length).toBeGreaterThan(0);
    expect(action.file_scope?.write).toBeDefined();
    expect(action.file_scope?.write?.length).toBeGreaterThan(0);
    expect(action.file_scope?.forbid).toBeDefined();
    expect(action.file_scope?.forbid?.length).toBeGreaterThan(0);

    // verification prompt for implement stage should instruct sub-agent to run validation
    expect(action.prompt).toContain('quality validation');
    expect(action.prompt).toContain('validation-report.json');
    expect(action.prompt).toContain('REQUIRED by the gate');
  });

  it('4.6 specify stage has no code checks but has Verification section with format note', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'spec-env-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const stateYaml = `sessionId: "spec-env-session"
intent: "Specify feature"
stage: "specify"
state: "running"
retryCount: 0

plan:
  sessionId: "spec-env-session"
  intent: "Specify feature"
  complexity: "low"
  capabilities: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const manifest = generateDispatchManifest('spec-env-session', projectRoot);
    const action = manifest.actions[0];
    expect(action).toBeDefined();

    const prompt = action.prompt;

    // Verification section should exist
    expect(prompt).toContain('## Verification');

    // No shell commands for lint/test/typecheck (only format verification text)
    // The Verification section should say "format specification" or similar
    expect(prompt).toContain('format specification');
  });

  it('three-level fallback: machine-state takes priority over file existence', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'fallback-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    const stateYaml = `sessionId: "fallback-session"
intent: "Test fallback"
stage: "design"
state: "running"
retryCount: 0

plan:
  sessionId: "fallback-session"
  intent: "Test fallback"
  complexity: "low"
  capabilities: []
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    // Create the artifact file (would pass file existence check)
    fs.mkdirSync(path.join(sessionDir, 'design'), { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'design', 'design.md'), '# Design');

    // Write machine-state showing design as pending
    const msDir = path.join(projectRoot, '.spec-graph');
    const msYaml = `artifacts:
  design/design.md:
    id: design/design.md
    status: pending
    updated_at: "2026-07-02T00:00:00.000Z"
checks: {}
last_updated: "2026-07-02T00:00:00.000Z"
`;
    fs.writeFileSync(path.join(msDir, 'machine-state.yaml'), msYaml);

    const manifest = generateDispatchManifest('fallback-session', projectRoot);

    // Machine-state says pending → gate should NOT pass (even though file exists)
    expect(manifest.gate_passed).toBe(false);
    expect(manifest.missing_artifacts).toContain('design/design.md');
  });

  // ─── Meeting metadata ──────────────────────────────────────────────────

  it('no meeting field when no graph.yaml exists', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'no-meeting-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    const stateYaml = `sessionId: "no-meeting-session"
intent: "Simple task"
stage: "tasks"
state: "running"
retryCount: 0

plan:
  sessionId: "no-meeting-session"
  intent: "Simple task"
  complexity: "low"
  capabilities:
    - id: "cap-1"
      description: "Single capability"
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);
    // No graph.yaml — expect no meeting metadata
    const manifest = generateDispatchManifest('no-meeting-session', projectRoot);
    expect(manifest.meeting).toBeUndefined();
  });

  it('meeting available + recommended for high complexity', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'high-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    const stateYaml = `sessionId: "high-session"
intent: "Complex refactor"
stage: "tasks"
state: "running"
retryCount: 0

plan:
  sessionId: "high-session"
  intent: "Complex refactor"
  complexity: "high"
  capabilities:
    - id: "cap-a"
      description: "Capability A"
    - id: "cap-b"
      description: "Capability B"
  risks:
    - "Brownfield integration risk"
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    // Write graph.yaml with matching meeting
    const specDir = path.join(projectRoot, '.spec-graph');
    const graphYaml = `
agents: []
agent_bindings: []
meetings:
  - id: task-decomposition-meeting
    purpose: "Decompose design into tasks"
    on_actions:
      - tasks
    min_rounds: 3
    max_rounds: 6
    participants:
      - agent_id: pm
        role: core
        perspective: "user needs"
      - agent_id: developer
        role: core
        perspective: "feasibility"
`;
    fs.writeFileSync(path.join(specDir, 'graph.yaml'), graphYaml);

    const manifest = generateDispatchManifest('high-session', projectRoot);
    expect(manifest.meeting).toBeDefined();
    expect(manifest.meeting!.available).toBe(true);
    expect(manifest.meeting!.recommended).toBe(true);
    expect(manifest.meeting!.reason).toBe('High complexity');
    expect(manifest.meeting!.template).toBeDefined();
    expect(manifest.meeting!.template!.id).toBe('task-decomposition-meeting');
    expect(manifest.meeting!.template!.participants.length).toBe(2);
  });

  it('meeting available but NOT recommended for low complexity', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'low-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    const stateYaml = `sessionId: "low-session"
intent: "Simple thing"
stage: "tasks"
state: "running"
retryCount: 0

plan:
  sessionId: "low-session"
  intent: "Simple thing"
  complexity: "low"
  capabilities:
    - id: "cap-x"
      description: "One small capability"
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const specDir = path.join(projectRoot, '.spec-graph');
    const graphYaml = `
agents: []
agent_bindings: []
meetings:
  - id: task-decomposition-meeting
    purpose: "Decompose design into tasks"
    on_actions:
      - tasks
    min_rounds: 3
    max_rounds: 6
    participants:
      - agent_id: developer
        role: core
        perspective: "feasibility"
`;
    fs.writeFileSync(path.join(specDir, 'graph.yaml'), graphYaml);

    const manifest = generateDispatchManifest('low-session', projectRoot);
    expect(manifest.meeting).toBeDefined();
    expect(manifest.meeting!.available).toBe(true);
    expect(manifest.meeting!.recommended).toBe(false);
    expect(manifest.meeting!.reason).toBe('');
  });

  it('meeting recommended for many capabilities', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'many-caps-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    const stateYaml = `sessionId: "many-caps-session"
intent: "Big feature"
stage: "tasks"
state: "running"
retryCount: 0

plan:
  sessionId: "many-caps-session"
  intent: "Big feature"
  complexity: "medium"
  capabilities:
    - id: "a"
      description: "Capability A description"
    - id: "b"
      description: "Capability B description"
    - id: "c"
      description: "Capability C description"
    - id: "d"
      description: "Capability D description"
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const specDir = path.join(projectRoot, '.spec-graph');
    const graphYaml = `
agents: []
agent_bindings: []
meetings:
  - id: task-decomposition-meeting
    purpose: "Decompose design into tasks"
    on_actions:
      - tasks
    min_rounds: 3
    max_rounds: 6
    participants: []
`;
    fs.writeFileSync(path.join(specDir, 'graph.yaml'), graphYaml);

    const manifest = generateDispatchManifest('many-caps-session', projectRoot);
    expect(manifest.meeting!.recommended).toBe(true);
    expect(manifest.meeting!.reason).toBe('Many capabilities');
  });

  it('meeting recommended for open questions', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'openq-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    const stateYaml = `sessionId: "openq-session"
intent: "Unclear feature"
stage: "tasks"
state: "running"
retryCount: 0

plan:
  sessionId: "openq-session"
  intent: "Unclear feature"
  complexity: "medium"
  capabilities:
    - id: "x"
      description: "Capability X description"
  risks:
    - "security risk"
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);
    // Manually add openQuestions after state.yaml write (old parser format)
    // Actually, let me add openQuestions to plan via YAML
    // The plan should have openQuestions — check if it's supported in session state
    // Since plan in YAML is hand-parsed, just add it to state.yaml metadata
    fs.appendFileSync(path.join(sessionDir, 'state.yaml'), '  openQuestions:\n    - "How to handle edge case X?"\n');

    const specDir = path.join(projectRoot, '.spec-graph');
    const graphYaml = `
agents: []
agent_bindings: []
meetings:
  - id: task-decomposition-meeting
    purpose: "Decompose"
    on_actions:
      - tasks
    min_rounds: 3
    max_rounds: 6
    participants: []
`;
    fs.writeFileSync(path.join(specDir, 'graph.yaml'), graphYaml);

    const manifest = generateDispatchManifest('openq-session', projectRoot);
    expect(manifest.meeting!.recommended).toBe(true);
    expect(manifest.meeting!.reason).toBe('Open questions remain');
  });

  it('meeting not present for stage without matching meeting declarations', () => {
    const sessionDir = path.join(projectRoot, '.spec-graph', 'sessions', 'design-no-meeting');
    fs.mkdirSync(sessionDir, { recursive: true });
    const stateYaml = `sessionId: "design-no-meeting"
intent: "Design stage"
stage: "design"
state: "running"
retryCount: 0

plan:
  sessionId: "design-no-meeting"
  intent: "Design stage"
  complexity: "high"
  capabilities:
    - id: "a"
      description: "Capability A description"
  risks: []
`;
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), stateYaml);

    const specDir = path.join(projectRoot, '.spec-graph');
    // Meeting only for tasks stage, not design
    const graphYaml = `
agents: []
agent_bindings: []
meetings:
  - id: task-decomposition-meeting
    purpose: "Decompose"
    on_actions:
      - tasks
    min_rounds: 3
    max_rounds: 6
    participants: []
`;
    fs.writeFileSync(path.join(specDir, 'graph.yaml'), graphYaml);

    const manifest = generateDispatchManifest('design-no-meeting', projectRoot);
    // No meeting should appear for design stage even though complexity is high
    expect(manifest.meeting).toBeUndefined();
  });
});

// --- Meeting metadata integration ---

describe('dispatch manifest generator — meeting metadata', () => {
  it('includes meeting metadata when graph has matching meeting for current stage', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-meeting-'));
    const sessionDir = path.join(tmpDir, '.spec-graph', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });

    // Write session state
    const state = {
      sessionId: 'test-session',
      intent: 'Test',
      stage: 'propose',
      state: 'running',
      plan: {
        sessionId: 'test-session',
        intent: 'Test',
        capabilities: [{ id: 'cap-1', description: 'Capability 1', dependsOn: [] }],
        order: ['cap-1'],
        complexity: 'low',
        risks: [],
        openQuestions: [],
      },
      completedArtifacts: [],
      trace: [],
      previousDiagnoses: [],
      retryCount: 0,
      readyForArchive: false,
    };
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), yaml.dump(state));

    // Write graph with a meeting that triggers on 'propose' stage
    const graph = {
      agents: [
        {
          id: 'pm',
          description: 'PM agent',
          prompt_ref: 'agents/pm-agent.md',
          model_tier: 'capable',
          input_artifact_kinds: [],
          output_artifact_kinds: ['requirement/*'],
          actions: ['propose', 'specify'],
        },
      ],
      agent_bindings: [
        { action: 'propose', agent_id: 'pm', provided_by: 'foundation' },
      ],
      meetings: [
        {
          id: 'requirements-meeting',
          purpose: 'Discuss requirements',
          participants: [
            { agent_id: 'pm', role: 'core', perspective: 'user needs' },
            { agent_id: 'architect', role: 'core', perspective: 'feasibility' },
          ],
          min_rounds: 2,
          max_rounds: 10,
          on_actions: ['propose', 'specify'],
        },
      ],
    };
    const graphPath = path.join(tmpDir, '.spec-graph', 'graph.yaml');
    fs.writeFileSync(graphPath, yaml.dump(graph));

    const manifest = generateDispatchManifest('test-session', tmpDir, undefined, graphPath);

    expect(manifest.meeting).toBeDefined();
    expect(manifest.meeting?.available).toBe(true);
    expect(manifest.meeting?.template?.id).toBe('requirements-meeting');
    expect(manifest.meeting?.template?.participants?.length).toBe(2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not include meeting metadata when no meetings match current stage', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-no-meeting-'));
    const sessionDir = path.join(tmpDir, '.spec-graph', 'sessions', 'test-session-nomeeting');
    fs.mkdirSync(sessionDir, { recursive: true });

    const state = {
      sessionId: 'test-session-nomeeting',
      intent: 'Test',
      stage: 'implement',
      state: 'running',
      plan: {
        sessionId: 'test-session',
        intent: 'Test',
        capabilities: [],
        order: [],
        complexity: 'low',
        risks: [],
        openQuestions: [],
      },
      completedArtifacts: [],
      trace: [],
      previousDiagnoses: [],
      retryCount: 0,
      readyForArchive: false,
    };
    fs.writeFileSync(path.join(sessionDir, 'state.yaml'), yaml.dump(state));

    const graph = {
      agents: [],
      agent_bindings: [],
      meetings: [
        {
          id: 'requirements-meeting',
          purpose: 'Discuss requirements',
          participants: [],
          min_rounds: 2,
          max_rounds: 10,
          on_actions: ['propose', 'specify'],
        },
      ],
    };
    const graphPath = path.join(tmpDir, '.spec-graph', 'graph.yaml');
    fs.writeFileSync(graphPath, yaml.dump(graph));

    const manifest = generateDispatchManifest('test-session-nomeeting', tmpDir, undefined, graphPath);

    expect(manifest.meeting).toBeUndefined();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
