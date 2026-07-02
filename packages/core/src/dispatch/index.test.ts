import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
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

    // verification should have lint, test, typecheck for implement
    expect(action.verification).toBeDefined();
    expect(action.verification?.lint).toBeTruthy();
    expect(action.verification?.test).toBeTruthy();
    expect(action.verification?.typecheck).toBeTruthy();
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
});
