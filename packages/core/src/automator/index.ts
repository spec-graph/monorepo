/**
 * Automator — the core state-machine engine.
 *
 * The automator owns the session lifecycle and the 8-stage state machine:
 * specify → design → tasks → implement → review → test → accept → integrate.
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
import { trackArtifact as msTrackArtifact } from '../machine-state/index.js';
import {
  evaluateGate,
  diagnoseFailure,
  loadGateConfig,
  type EvaluationContext,
  type GateResult,
  type Diagnosis as GateDiagnosis,
} from '../gate-enforcement/index.js';
import { generatePlan } from '../planning/index.js';
import { sense } from '../sense/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Stage =
  | 'specify'
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

export interface AdvanceResult {
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

export const STAGES: Stage[] = [
  'specify', 'design', 'tasks', 'implement',
  'review', 'test', 'accept', 'integrate',
];

export const STAGE_OUTPUTS: Record<Stage, { artifact: string; dir: string }> = {
  specify: { artifact: 'proposal.md', dir: 'specify' },
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
      const yaml = fs.readFileSync(statePath, 'utf-8');
      const data = parseStateYaml(yaml) as SessionData;
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
  const yaml = formatStateYaml(data);
  fs.writeFileSync(path.join(dir, 'state.yaml'), yaml, 'utf-8');
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
): AdvanceResult {
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

  const gateResult: GateResult = evaluateGate(stage, 'exit', evalCtx, kbp);

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

// ---------------------------------------------------------------------------
// YAML helpers (minimal writer for our specific session format)
// ---------------------------------------------------------------------------

// Exported for testing — not part of the public API.
export const _test = { formatStateYaml, parseStateYaml };

function formatStateYaml(data: SessionData): string {
  const lines: string[] = [
    `# spec-graph session state — ${data.sessionId}`,
    `sessionId: "${data.sessionId}"`,
    `intent: "${data.intent}"`,
    `stage: "${data.stage}"`,
    `state: "${data.state}"`,
    `retryCount: ${data.retryCount}`,
    `readyForArchive: ${data.readyForArchive ?? false}`,
    ``,
    `# Plan`,
    `plan:`,
    `  sessionId: "${data.plan.sessionId}"`,
    `  intent: "${data.plan.intent}"`,
    `  complexity: "${data.plan.complexity}"`,
    `  order: [${(data.plan.order || []).map((o) => `"${o}"`).join(', ')}]`,
    `  capabilities:`,
    ...(data.plan?.capabilities || []).flatMap((c) => {
      const capLines = [
        `    - id: "${c.id}"`,
        `      description: "${c.description || ''}"`,
      ];
      if (c.dependsOn && c.dependsOn.length > 0) {
        capLines.push(`      dependsOn: [${c.dependsOn.map((d) => `"${d}"`).join(', ')}]`);
      } else {
        capLines.push(`      dependsOn: []`);
      }
      return capLines;
    }),
    `  risks:`,
    ...(data.plan?.risks || []).map((r) => `    - "${r}"`),
    `  openQuestions:`,
    ...(data.plan?.openQuestions || []).map((q) => `    - "${q}"`),
    ``,
    `# Completed artifacts`,
    `completedArtifacts:`,
    ...(data.completedArtifacts.length > 0
      ? data.completedArtifacts.map((a) => `  - "${a}"`)
      : [`  []`]),
    ``,
    `# Previous diagnoses`,
    `previousDiagnoses:`,
    ...(data.previousDiagnoses && data.previousDiagnoses.length > 0
      ? data.previousDiagnoses.flatMap((d) => [
          `  - retryLevel: ${d.retryLevel}`,
          `    similarToPrevious: ${d.similarToPrevious}`,
          `    gateId: "${d.gateId}"`,
          `    failedCriteria:`,
          ...(d.failedCriteria.length > 0
            ? d.failedCriteria.flatMap((fc) => [
                `      - id: "${fc.id}"`,
                `        reason: "${fc.reason}"`,
              ])
            : [`      []`]),
        ])
      : [`  []`]),
    ``,
    `# Trace`,
    `trace:`,
    ...data.trace.map(
      (t) =>
        `  - timestamp: "${t.timestamp}"\n    toStage: "${t.toStage}"\n    trigger: "${t.trigger}"`
    ),
    ``,
  ];
  return lines.join('\n');
}

function parseStateYaml(yaml: string): Partial<SessionData> {
  const result: Partial<SessionData> = {} as Partial<SessionData>;
  const trace: TraceEntry[] = [];
  const completedArtifacts: string[] = [];
  const previousDiagnoses: Diagnosis[] = [];
  const capabilities: Plan['capabilities'] = [];
  const risks: string[] = [];
  const openQuestions: string[] = [];
  const planOrder: string[] = [];

  let section: 'header' | 'plan' | 'completedArtifacts' | 'previousDiagnoses' | 'trace' = 'header';
  let planSubSection: 'capabilities' | 'risks' | 'openQuestions' | null = null;
  let planData: Partial<Plan> = {};
  let currentDiag: Partial<Diagnosis> | null = null;
  let currentDiagCriteria: DiagnosedCriterion[] = [];
  let inFailedCriteria = false;

  for (const line of yaml.split('\n')) {
    // Section detection
    if (line.startsWith('# Plan') || line.match(/^plan:$/)) {
      section = 'plan';
      continue;
    }
    if (line.startsWith('# Completed artifacts') || line.match(/^completedArtifacts:$/)) {
      section = 'completedArtifacts';
      continue;
    }
    if (line.startsWith('# Previous diagnoses') || line.match(/^previousDiagnoses:$/)) {
      section = 'previousDiagnoses';
      continue;
    }
    if (line.startsWith('# Trace') || line.match(/^trace:$/)) {
      section = 'trace';
      continue;
    }

    switch (section) {
      case 'header': {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (m) {
          const key = m[1];
          const val = m[2].replace(/^"|"$/g, '').trim();
          switch (key) {
            case 'sessionId': result.sessionId = val; break;
            case 'intent': result.intent = val; break;
            case 'stage': result.stage = val as Stage; break;
            case 'state': result.state = val as SessionState; break;
            case 'retryCount': result.retryCount = parseInt(val, 10) || 0; break;
            case 'readyForArchive': result.readyForArchive = val === 'true'; break;
          }
        }
        break;
      }

      case 'plan': {
        // Track sub-section within plan
        if (line.match(/^\s{2}capabilities:$/)) { planSubSection = 'capabilities'; break; }
        if (line.match(/^\s{2}risks:$/)) { planSubSection = 'risks'; break; }
        if (line.match(/^\s{2}openQuestions:$/)) { planSubSection = 'openQuestions'; break; }

        // plan.order: ["a", "b"]
        const orderMatch = line.match(/^\s{2}order:\s*\[(.+)\]$/);
        if (orderMatch) {
          const inner = orderMatch[1];
          if (inner.trim()) {
            const items = inner.match(/"([^"]+)"/g);
            if (items) {
              for (const item of items) {
                planOrder.push(item.replace(/"/g, ''));
              }
            }
          }
          break;
        }

        // plan.sessionId / intent / complexity
        const planField = line.match(/^\s{2}(\w+):\s*"(.+)"$/);
        if (planField) {
          const k = planField[1];
          const v = planField[2];
          if (k === 'sessionId') planData.sessionId = v;
          else if (k === 'intent') planData.intent = v;
          else if (k === 'complexity') planData.complexity = v as Plan['complexity'];
          break;
        }

        // capabilities array item header: "    - id: \"...\""
        const capHeader = line.match(/^\s{4}-\s+id:\s*"(.+)"$/);
        if (capHeader && planSubSection === 'capabilities') {
          capabilities.push({ id: capHeader[1], description: '', dependsOn: [] });
          break;
        }

        // capability description
        const capDesc = line.match(/^\s{6}description:\s*"(.+)"$/);
        if (capDesc && capabilities.length > 0) {
          capabilities[capabilities.length - 1].description = capDesc[1];
          break;
        }

        // capability dependsOn
        const capDeps = line.match(/^\s{6}dependsOn:\s*\[(.+)\]$/);
        if (capDeps && capabilities.length > 0) {
          const inner = capDeps[1];
          if (inner.trim()) {
            const items = inner.match(/"([^"]+)"/g);
            if (items) {
              capabilities[capabilities.length - 1].dependsOn = items.map((i) => i.replace(/"/g, ''));
            }
          }
          break;
        }

        // risks / openQuestions array item: "    - \"...\""
        const arrayItem = line.match(/^\s{4}-\s*"(.+)"$/);
        if (arrayItem) {
          if (planSubSection === 'risks') risks.push(arrayItem[1]);
          else if (planSubSection === 'openQuestions') openQuestions.push(arrayItem[1]);
          break;
        }
        break;
      }

      case 'completedArtifacts': {
        const artMatch = line.match(/^\s{2}-\s*"(.+)"$/);
        if (artMatch) {
          completedArtifacts.push(artMatch[1]);
        }
        break;
      }

      case 'previousDiagnoses': {
        // Diagnosis header: "  - retryLevel: N"
        const diagHeader = line.match(/^\s{2}-\s+retryLevel:\s*(\d+)$/);
        if (diagHeader) {
          if (currentDiag) {
            previousDiagnoses.push({
              gateId: currentDiag.gateId || '',
              retryLevel: (currentDiag.retryLevel || 1) as Diagnosis['retryLevel'],
              similarToPrevious: currentDiag.similarToPrevious || false,
              failedCriteria: currentDiagCriteria,
            });
          }
          currentDiag = { retryLevel: parseInt(diagHeader[1], 10) as Diagnosis['retryLevel'] };
          currentDiagCriteria = [];
          inFailedCriteria = false;
          break;
        }

        const diagField = line.match(/^\s{4}(\w+):\s*(.+)$/);
        if (diagField && currentDiag) {
          const k = diagField[1];
          const v = diagField[2].replace(/^"|"$/g, '').trim();
          if (k === 'similarToPrevious') currentDiag.similarToPrevious = v === 'true';
          else if (k === 'gateId') currentDiag.gateId = v;
          else if (k === 'failedCriteria') inFailedCriteria = true;
          break;
        }

        // Failed criterion header: "      - id: \"...\""
        const fcHeader = line.match(/^\s{6}-\s+id:\s*"(.+)"$/);
        if (fcHeader && currentDiag) {
          currentDiagCriteria.push({ id: fcHeader[1], reason: '' });
          break;
        }

        // Failed criterion reason
        const fcReason = line.match(/^\s{8}reason:\s*"(.+)"$/);
        if (fcReason && currentDiagCriteria.length > 0) {
          currentDiagCriteria[currentDiagCriteria.length - 1].reason = fcReason[1];
          break;
        }
        break;
      }

      case 'trace': {
        const tsMatch = line.match(/^\s{2}-\s+timestamp:\s*"(.+)"$/);
        if (tsMatch) {
          trace.push({ timestamp: tsMatch[1], toStage: '', trigger: 'user-force' });
          break;
        }
        const toMatch = line.match(/^\s{4}toStage:\s*"(.+)"$/);
        if (toMatch && trace.length > 0) {
          trace[trace.length - 1].toStage = toMatch[1];
          break;
        }
        const trigMatch = line.match(/^\s{4}trigger:\s*"(.+)"$/);
        if (trigMatch && trace.length > 0) {
          trace[trace.length - 1].trigger = trigMatch[1] as TraceEntry['trigger'];
          break;
        }
        break;
      }
    }
  }

  // Flush last diagnosis
  if (currentDiag) {
    previousDiagnoses.push({
      gateId: currentDiag.gateId || '',
      retryLevel: (currentDiag.retryLevel || 1) as Diagnosis['retryLevel'],
      similarToPrevious: currentDiag.similarToPrevious || false,
      failedCriteria: currentDiagCriteria,
    });
  }

  // Assemble plan
  const plan: Plan = {
    sessionId: planData.sessionId || result.sessionId || 'unknown',
    intent: planData.intent || result.intent || '',
    capabilities,
    order: planOrder.length > 0 ? planOrder : capabilities.map((c) => c.id),
    complexity: planData.complexity || 'medium',
    risks,
    openQuestions,
  };
  result.plan = plan;
  result.trace = trace;
  result.completedArtifacts = completedArtifacts;
  result.previousDiagnoses = previousDiagnoses;
  if (result.retryCount === undefined) result.retryCount = 0;

  return result;
}
