/**
 * Automator — the core state-machine engine.
 *
 * The automator owns the session lifecycle and the 9-stage state machine:
 * specify → specs → design → tasks → implement → review → test
 * → accept → integrate.
 *
 * It exposes a TypeScript API consumed by the spec-graph CLI.
 *
 * ## Session lifecycle
 *
 *   1. startSession(intent)     → creates session + draft plan
 *   2. confirmPlan(id, plan)    → user confirms, automator ready
 *   3. (dispatch --json)        → external coordinator gets manifest
 *      (agent executes externally via hook or stateless API)
 *   4. submitResult(id, result) → evaluate gate, advance state
 *      loop 3-4 until done
 *   5. intervene(id, action)    → manual intervention if needed
 */

import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { trackArtifact as msTrackArtifact } from '../machine-state/index.js';
import {
  evaluateGate,
  diagnoseFailure,
  loadGateConfig,
  type EvaluationContext,
  type GateResult,
  type Diagnosis as GateDiagnosis,
  type GraphGate,
} from '../gate-enforcement/index.js';
import { generatePlan } from '../planning/index.js';
import { sense } from '../sense/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Stage =
  | 'specify'
  | 'specs'
  | 'design'
  | 'tasks'
  | 'implement'
  | 'review'
  | 'test'
  | 'accept'
  | 'integrate';

export type SessionState = 'running' | 'paused' | 'completed' | 'failed';

export interface Plan {
  sessionId: string;
  intent: string;
  capabilities: Array<{
    id: string;
    description: string;
    dependsOn: string[];
  }>;
  order: string[];
  complexity: 'low' | 'medium' | 'high';
  risks: string[];
  openQuestions: string[];
}

export interface AgentResult {
  artifacts: Array<{ path: string; content: string }>;
  selfCheck?: {
    acceptanceCriteriaMet: boolean;
    notes?: string;
  };
}

export interface SubmitResult {
  advanced: boolean;
  nextStage: Stage | null;
  diagnosis?: Diagnosis;
  done: boolean;
}

export interface DiagnosedCriterion {
  id: string;
  reason: string;
  evidence?: string;
  suggestedFix?: string;
}

export interface Diagnosis {
  gateId: string;
  failedCriteria: DiagnosedCriterion[];
  retryLevel: 1 | 2 | 3 | 4;
  similarToPrevious: boolean;
}

export interface Status {
  sessionId: string | null;
  intent: string | null;
  stage: Stage | null;
  state: SessionState | null;
  progress: {
    currentStageIndex: number;
    totalStages: number;
    completedArtifacts: number;
  };
  blockers: string[];
  recentDiagnosis: Diagnosis | null;
}

interface SessionData {
  sessionId: string;
  intent: string;
  stage: Stage;
  state: SessionState;
  plan: Plan;
  completedArtifacts: string[];
  trace: TraceEntry[];
  previousDiagnoses: Diagnosis[];
  retryCount: number;
  readyForArchive: boolean;
}

interface TraceEntry {
  timestamp: string;
  fromStage?: string;
  toStage: string;
  trigger: 'gate-pass' | 'user-force' | 'hook';
  result?: 'pass' | 'fail';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * FSM stages — the linear pipeline order.
 *
 * ⚠️ These are NOT the same as graph actions (graph.yaml).
 *    Graph has 12 actions (propose, specify, design, plan, implement,
 *    review, test, accept, integrate, contract, archive, release).
 *    FSM has 9 stages. This is by design — see CLAUDE.md §"FSM Stages ≠ Graph Actions".
 *
 *    Do NOT add stages just because a graph action exists without one.
 */
export const STAGES: Stage[] = [
  'specify', 'specs', 'design', 'tasks', 'implement',
  'review', 'test', 'accept', 'integrate',
];

export const STAGE_OUTPUTS: Record<Stage, { artifact: string; dir: string }> = {
  specify: { artifact: 'proposal.md', dir: 'specify' },
  specs: { artifact: 'specs.md', dir: 'specs' },
  design: { artifact: 'design.md', dir: 'design' },
  tasks: { artifact: 'tasks.md', dir: 'tasks' },
  implement: { artifact: 'code', dir: 'implement' },
  review: { artifact: 'review.md', dir: 'review' },
  test: { artifact: 'test.md', dir: 'test' },
  accept: { artifact: 'verification.md', dir: 'accept' },
  integrate: { artifact: 'pr.md', dir: 'integrate' },
};

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

const sessions = new Map<string, SessionData>();

function sessionDir(sessionId: string, projectRoot?: string): string {
  const base = projectRoot || process.cwd();
  return path.join(base, '.spec-graph', 'sessions', sessionId);
}

function loadSession(sessionId: string, projectRoot?: string): SessionData | null {
  // Check memory cache first
  const cached = sessions.get(sessionId);
  if (cached) return cached;

  // Try disk
  const statePath = path.join(sessionDir(sessionId, projectRoot), 'state.yaml');
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      const parsed = yaml.load(raw) as Partial<SessionData>;
      // Default fields that may be absent from old session files
      const data: SessionData = {
        sessionId: parsed.sessionId || 'unknown',
        intent: parsed.intent || '',
        stage: parsed.stage || 'specify',
        state: parsed.state || 'paused',
        plan: {
          sessionId: parsed.plan?.sessionId || parsed.sessionId || 'unknown',
          intent: parsed.plan?.intent || parsed.intent || '',
          capabilities: parsed.plan?.capabilities || [],
          order: parsed.plan?.order || [],
          complexity: parsed.plan?.complexity || 'low',
          risks: parsed.plan?.risks || [],
          openQuestions: parsed.plan?.openQuestions || [],
        },
        completedArtifacts: parsed.completedArtifacts || [],
        trace: parsed.trace || [],
        previousDiagnoses: parsed.previousDiagnoses || [],
        retryCount: parsed.retryCount || 0,
        readyForArchive: parsed.readyForArchive || false,
      };
      // Normalize legacy stage names (v2 'plan' → v3 'tasks')
      if ((data.stage as string) === 'plan') data.stage = 'tasks';
      sessions.set(sessionId, data);
      return data;
    } catch {
      return null;
    }
  }
  return null;
}

function saveSession(data: SessionData, projectRoot?: string): void {
  sessions.set(data.sessionId, data);
  const dir = sessionDir(data.sessionId, projectRoot);
  fs.mkdirSync(dir, { recursive: true });
  const content = yaml.dump(data, { lineWidth: 120, noRefs: true });
  fs.writeFileSync(path.join(dir, 'state.yaml'), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Start a new session. Creates a session with a draft plan.
 *
 * Delegates to the planning module for intent decomposition, capability
 * ordering, complexity estimation, and risk identification.
 */
export function startSession(intent: string, projectRoot?: string): Plan {
  const sessionId = intent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

  // Already exists? Return existing plan
  const existing = loadSession(sessionId, projectRoot);
  if (existing) {
    return existing.plan;
  }

  // Delegate to planning module
  const planOutput = generatePlan({ intent, profile: {} });

  const plan: Plan = {
    sessionId,
    intent: planOutput.intent,
    capabilities: planOutput.capabilities,
    order: planOutput.order,
    complexity: planOutput.complexity,
    risks: planOutput.risks,
    openQuestions: planOutput.openQuestions,
  };

  // Save as draft (not confirmed yet)
  const data: SessionData = {
    sessionId,
    intent,
    stage: 'specify',
    state: 'paused', // paused until plan confirmed
    plan,
    completedArtifacts: [],
    trace: [],
    previousDiagnoses: [],
    retryCount: 0,
    readyForArchive: false,
  };
  saveSession(data, projectRoot);

  return plan;
}

/**
 * Confirm a plan. Transitions the session from paused to running.
 * After confirmation, the automator is ready to generate prompts.
 */
export function confirmPlan(sessionId: string, plan?: Plan, projectRoot?: string): void {
  const data = loadSession(sessionId, projectRoot);
  if (!data) throw new Error(`Session not found: ${sessionId}`);

  if (plan) data.plan = plan;
  data.state = 'running';

  const entry: TraceEntry = {
    timestamp: new Date().toISOString(),
    toStage: data.stage,
    trigger: 'user-force',
  };
  data.trace.push(entry);

  saveSession(data, projectRoot);
}

/**
 * Submit a result from the external agent, evaluate the gate, and advance
 * state if all exit criteria pass.
 */
export function submitResult(
  sessionId: string,
  result: AgentResult,
  projectRoot?: string,
  knowledgeBasePath?: string
): SubmitResult {
  const data = loadSession(sessionId, projectRoot);
  if (!data) throw new Error(`Session not found: ${sessionId}`);

  const stage = data.stage;

  // Persist artifact contents for gate evaluation.
  // Gate evaluators expect artifactContents keyed by artifact id (proposal,
  // design, tasks, etc.), not by stage name.
  const artifactContents: Record<string, string> = {};
  const artifactFiles: Record<string, string> = {};
  for (const art of result.artifacts) {
    // Map by artifact id (the file's base name without extension)
    const baseName = path.basename(art.path).replace(/\.\w+$/, '');
    artifactContents[baseName] = (artifactContents[baseName] || '') + art.content;
    // Also map by stage name as a fallback
    artifactContents[stage] = (artifactContents[stage] || '') + art.content;
    artifactFiles[stage] = art.path;
    // Write artifact to disk
    const absPath = path.resolve(projectRoot || process.cwd(), art.path);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, art.content, 'utf-8');
  }

  const kbp = knowledgeBasePath || path.join(__dirname, '../../knowledge');

  const evalCtx: EvaluationContext = {
    projectRoot: projectRoot || process.cwd(),
    stage,
    artifactFiles,
    artifactContents,
    traceEdges: buildTraceEdges(data),
  };

  // Load graph gates (supplementary) if graph.yaml exists
  const graphGates = loadGraphGates(evalCtx.projectRoot);
  const currentTransition = buildCurrentTransition(data);

  const gateResult: GateResult = evaluateGate(stage, 'exit', evalCtx, kbp, graphGates, currentTransition);

  if (gateResult.passed) {
    // Advance to next stage
    const currentIdx = STAGES.indexOf(stage);
    const nextIdx = currentIdx + 1;
    const done = nextIdx >= STAGES.length;

    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      fromStage: stage,
      toStage: done ? 'integrate' : STAGES[nextIdx],
      trigger: 'gate-pass',
      result: 'pass',
    };
    data.trace.push(entry);
    data.completedArtifacts.push(`${stage}/${STAGE_OUTPUTS[stage].artifact}`);
    data.retryCount = 0;
    data.previousDiagnoses = [];

    // Track in machine-state (best-effort mirror)
    const artifactPath = `${stage}/${STAGE_OUTPUTS[stage].artifact}`;
    try {
      msTrackArtifact(artifactPath, 'completed', {
        path: artifactPath,
        producer: 'automator',
      }, { projectRoot });
    } catch { /* non-fatal: machine-state is best-effort */ }

    if (done) {
      data.stage = 'integrate';
      data.state = 'completed';
      data.readyForArchive = true;
    } else {
      data.stage = STAGES[nextIdx];
    }
    saveSession(data, projectRoot);

    return {
      advanced: true,
      nextStage: done ? null : (data.stage as Stage),
      done,
    };
  }

  // Gate failed: diagnose
  const diagnosis: GateDiagnosis = diagnoseFailure(gateResult, data.previousDiagnoses);
  data.previousDiagnoses.push(diagnosis);
  data.retryCount++;
  saveSession(data, projectRoot);

  return {
    advanced: false,
    nextStage: stage,
    diagnosis,
    done: false,
  };
}

/**
 * Query the current status of a session.
 */
export function status(sessionId?: string, projectRoot?: string): Status {
  if (!sessionId) {
    return {
      sessionId: null,
      intent: null,
      stage: null,
      state: null,
      progress: { currentStageIndex: 0, totalStages: 8, completedArtifacts: 0 },
      blockers: [],
      recentDiagnosis: null,
    };
  }

  const data = loadSession(sessionId, projectRoot);
  if (!data) {
    return {
      sessionId,
      intent: null,
      stage: null,
      state: null,
      progress: { currentStageIndex: 0, totalStages: 8, completedArtifacts: 0 },
      blockers: [],
      recentDiagnosis: null,
    };
  }

  return {
    sessionId: data.sessionId,
    intent: data.intent,
    stage: data.stage,
    state: data.state,
    progress: {
      currentStageIndex: STAGES.indexOf(data.stage),
      totalStages: STAGES.length,
      completedArtifacts: data.completedArtifacts.length,
    },
    blockers:
      data.state === 'paused'
        ? ['Plan not yet confirmed. Run confirmPlan()']
        : data.previousDiagnoses.length > 0
          ? [`Gate failed ${data.retryCount} times`]
          : [],
    recentDiagnosis:
      data.previousDiagnoses.length > 0
        ? data.previousDiagnoses[data.previousDiagnoses.length - 1]
        : null,
  };
}

/**
 * Intervene in the current workflow.
 */
export function intervene(
  sessionId: string,
  action: 'modify-plan' | 'force-advance' | 'rollback' | 'resume',
  payload?: unknown,
  projectRoot?: string
): { success: boolean; newStatus: Status } {
  const data = loadSession(sessionId, projectRoot);
  if (!data) throw new Error(`Session not found: ${sessionId}`);

  switch (action) {
    case 'force-advance': {
      const currentIdx = STAGES.indexOf(data.stage);
      // Track the current stage's artifact as forced-completed
      const currentStage = data.stage;
      const artifactPath = `${currentStage}/${STAGE_OUTPUTS[currentStage].artifact}`;
      try {
        msTrackArtifact(artifactPath, 'completed', {
          path: artifactPath,
          producer: 'force-advance',
        }, { projectRoot });
      } catch { /* non-fatal */ }

      data.completedArtifacts.push(artifactPath);
      data.stage = STAGES[Math.min(currentIdx + 1, STAGES.length - 1)];
      data.retryCount = 0;
      data.previousDiagnoses = [];
      const entry: TraceEntry = {
        timestamp: new Date().toISOString(),
        fromStage: STAGES[currentIdx],
        toStage: data.stage,
        trigger: 'user-force',
      };
      data.trace.push(entry);
      saveSession(data, projectRoot);
      break;
    }
    case 'resume':
      data.state = 'running';
      saveSession(data, projectRoot);
      break;
    case 'rollback': {
      const payloadObj = payload as { toStage?: Stage } | undefined;
      const prevStage = data.stage;
      const prevArtifactPath = `${prevStage}/${STAGE_OUTPUTS[prevStage].artifact}`;

      if (payloadObj?.toStage && STAGES.includes(payloadObj.toStage)) {
        data.stage = payloadObj.toStage;
      } else {
        const idx = Math.max(STAGES.indexOf(data.stage) - 1, 0);
        data.stage = STAGES[idx];
      }
      data.retryCount = 0;
      data.previousDiagnoses = [];

      // Remove the rolled-back stage's artifact from completed list
      data.completedArtifacts = data.completedArtifacts.filter((a) => a !== prevArtifactPath);

      // Track the rolled-back stage's artifact as pending
      try {
        msTrackArtifact(prevArtifactPath, 'pending', {
          path: prevArtifactPath,
          producer: 'rollback',
        }, { projectRoot });
      } catch { /* non-fatal */ }

      const entry: TraceEntry = {
        timestamp: new Date().toISOString(),
        fromStage: data.stage,
        toStage: data.stage,
        trigger: 'user-force',
      };
      data.trace.push(entry);
      saveSession(data, projectRoot);
      break;
    }
    case 'modify-plan':
      if (payload) {
        Object.assign(data.plan, payload);
      }
      saveSession(data, projectRoot);
      break;
  }

  return {
    success: true,
    newStatus: status(sessionId, projectRoot),
  };
}

/**
 * List all active sessions.
 */
export function listSessions(projectRoot?: string): string[] {
  const base = projectRoot || process.cwd();
  const sessionsPath = path.join(base, '.spec-graph', 'sessions');
  if (!fs.existsSync(sessionsPath)) return [];
  try {
    return fs
      .readdirSync(sessionsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTraceEdges(data: SessionData): Record<string, string[]> {
  const edges: Record<string, string[]> = {};
  // Use the actual STAGES array for consistent edge naming
  for (let i = 0; i < STAGES.length - 1; i++) {
    edges[STAGES[i]] = [STAGES[i + 1]];
  }
  return edges;
}

/**
 * Load graph gates from .spec-graph/graph.yaml.
 * Returns empty array if file doesn't exist or is unreadable.
 */
function loadGraphGates(projectRoot: string): GraphGate[] {
  const graphPath = path.join(projectRoot, '.spec-graph', 'graph.yaml');
  if (!fs.existsSync(graphPath)) return [];

  try {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    const graph = yaml.load(raw) as { gates?: GraphGate[] };
    return graph?.gates || [];
  } catch {
    return [];
  }
}

/**
 * Build current transition pair from session data.
 * Returns [fromStage, toStage] for graph gate matching.
 */
function buildCurrentTransition(data: SessionData): [string, string] | undefined {
  const currentIdx = STAGES.indexOf(data.stage);
  if (currentIdx < 0) return undefined;
  const nextIdx = currentIdx + 1;
  if (nextIdx >= STAGES.length) return undefined;
  return [data.stage, STAGES[nextIdx]];
}

// ---------------------------------------------------------------------------
// YAML helpers — thin wrappers around js-yaml for the session format.
// ---------------------------------------------------------------------------

// Exported for testing — not part of the public API.
export const _test = { formatStateYaml, parseStateYaml };

function formatStateYaml(data: SessionData): string {
  return yaml.dump(data, { lineWidth: 120, noRefs: true });
}

function parseStateYaml(raw: string): Partial<SessionData> {
  return (yaml.load(raw) || {}) as Partial<SessionData>;
}

