import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  Graph,
  AgentDecl,
  MeetingDecl,
  ArtifactDecl,
  MeetingRuntime,
  TraceQuery,
} from "../types/index";
import { StateMachineEngine, MachineState } from "../engine/machine/index";
import {
  computeNextPlan,
  NextPlan,
  SuggestedAction,
} from "../engine/next/index";
import { buildTraceIndex } from "../engine/trace/index";
import {
  loadMeetingRuntime,
  collectPriorContributions,
} from "../engine/meeting/index";
import { readYaml, writeYaml } from "../utils/yaml";
import {
  loadPermissions,
  roleForAction,
  resolveFileScope,
  PermissionConfig,
  AgentRole,
} from "../engine/permissions/index";
import { appendToActiveChangeAudit, findActiveChange } from "./change";
import { executeHooks } from "../engine/hooks";
import { buildCodebaseSummary, RepoSignals } from "../engine/sense/index";
import { tryReadYaml } from "../utils/yaml";
import { Constitution } from "../types/index";
import { distillContext, DistilledContext } from "../engine/context-distiller";

export interface DispatchOptions {
  json?: boolean;
  all?: boolean;
  output?: string;
}

interface DispatchManifest {
  version: string;
  created_at: string;
  current_stage: string;
  next_stage: string | null;
  transition: string | null;
  blocking_gate: string | null;
  gate_passed: boolean;
  /**
   * Gate failure details — populated when gate_passed === false.
   * Coordinator reads these to know WHAT failed (not just that it failed).
   * Each action in `actions[]` corresponds to one of these failures.
   */
  missing_artifacts: string[];
  failed_checks: string[];
  missing_traces: string[];
  missing_contracts: string[];
  forbidden_violations: string[];
  /**
   * Artifact status snapshot — coordinator uses this to identify which artifacts
   * are 'ready' (can be picked up for review) or 'blocked' (should not be dispatched).
   */
  artifact_statuses: Record<string, string>;
  done: boolean;
  actions: DispatchAction[];
  /**
   * Project-level config snapshot (from .spec-graph/config.yaml).
   * Coordinator reads context/rules to inject into sub-agent prompts.
   * Undefined when no config.yaml exists (backward compat).
   */
  project_config?: {
    context?: Record<string, string>;
    rules?: Record<string, string>;
    references?: Record<string, string>;
  };
  /**
   * Codebase summary — generated from Sense repo signals.
   * Shows framework versions, test setup, project structure, etc.
   * Critical for AI agents taking over legacy projects.
   * Undefined when no repo signals available.
   */
  codebase_summary?: string;
  /**
   * Active change context — the change currently being worked on.
   * Helps AI agents understand the broader context: what change are we
   * implementing, what type (feature/bugfix/refactor), recent audit log.
   * Undefined when no active change exists.
   */
  active_change?: {
    id: string;
    title: string;
    description: string;
    type: string;
    status: string;
    recent_audit?: Array<{
      timestamp: string;
      action: string;
      message: string;
    }>;
  };
  /**
   * Constitution principles — quality thresholds and articles from constitution.yaml.
   * Injected into manifest so AI agents see quality requirements when producing artifacts.
   * Undefined when no constitution exists.
   */
  constitution_principles?: {
    thresholds?: Record<string, number>;
    articles?: Array<{ id: string; description: string }>;
    required_traces?: Array<{ name: string; from_kind: string; to_kind: string }>;
  };
}

interface DispatchAction {
  index: number;
  type: SuggestedAction["type"];
  id: string;
  description: string;
  command?: string;
  recommended_command?: string;
  /** Command the coordinator runs AFTER sub-agent completes — advances the workflow loop */
  next_step?: string;
  /**
   * Whether this action requires dispatching a sub-agent (LLM work).
   * - true: produce_artifact, perform_stage, resolve_violation (need LLM)
   * - false: run_check, verify_trace, transition (deterministic — coordinator runs recommended_command directly via Bash)
   *
   * When false, the coordinator should NOT spawn a sub-agent. Just run
   * `recommended_command` (or `next_step`) via the Bash tool. Spawning a
   * sub-agent to execute `npm test` is pure context waste.
   */
  requires_sub_agent: boolean;
  /** New: agent_id from Agent Registry (if binding exists) */
  agent_id?: string;
  /** New: path to agent prompt template */
  agent_prompt_ref?: string;
  /** New: model tier for the agent */
  model_tier?: string;
  /** New: meeting triggered by this action (if any) */
  meeting?: MeetingDispatch;
  /** New: input artifacts collected for this action (resolved paths, ready to feed sub-agent) */
  input_artifacts: InputArtifactRef[];
  /**
   * For run_check actions: the actual shell command declared in the CheckDecl
   * (e.g. 'npm test', 'npx vitest run', '<lint>'). Coordinator runs this
   * directly via Bash when requires_sub_agent === false — no need to consult
   * graph.yaml for the command body.
   *
   * For other action types: undefined.
   */
  check_command?: string;
  /**
   * For verify_trace actions: the trace query that's missing.
   * Tells the coordinator WHAT trace needs to be created — from_kind → to_kind
   * via which edge types, with what cardinality.
   *
   * Coordinator uses this to either:
   * - Create the trace manually: `spec-graph trace add --from <from_kind> --to <to_kind> --via <via>`
   * - Or identify which artifact completion would auto-wire this trace
   *
   * For other action types: undefined.
   */
  trace_query?: {
    name: string;
    from_kind: string;
    to_kind: string;
    via: string[];
    cardinality: "exists" | "every" | "single";
  };
  /**
   * For produce_artifact actions: template reference for AI agent to use.
   * Points to a template file in packs/<pack>/templates/<template>.md.
   * AI agent reads this template and generates document content accordingly.
   * spec-graph tracks that the document was created, but does NOT store content.
   */
  template_ref?: string;
  /**
   * For produce_artifact actions: suggested path where AI agent should write the document.
   * This is a suggestion, not enforced. AI agent can choose a different path.
   * spec-graph tracks the actual path via analysis command's --docs option.
   */
  suggested_doc_path?: string;
  /**
   * For produce_artifact actions: guidance on what the document should contain.
   * Brief description to help AI agent understand the artifact's purpose.
   */
  document_guidance?: string;
  /**
   * Distilled context: minimal set of upstream artifacts relevant to this action.
   * Generated by graph-walking from action.id along trace edges (reverse BFS).
   * Reduces token cost by sending only relevant context, not global.
   */
  distilled_context?: DistilledContext;
  /** Legacy: permission-based role (fallback when no agent binding) */
  agent_role: AgentRole;
  role_description: string;
  allowed_tools: string[];
  file_scope: { read: string[]; write: string[] };
  prompt: string;
}

interface InputArtifactRef {
  id: string;
  kind: string;
  path: string;
  status: string;
}

interface MeetingDispatch {
  meeting_id: string;
  description: string;
  purpose: string;
  participants: Array<{
    agent_id?: string;
    expert_role?: string;
    role: string;
    perspective: string;
  }>;
  min_rounds: number;
  max_rounds: number;
  output_artifacts: string[];
  expert_invite_protocol?: string;
  rounds: Array<{
    number: number;
    phase: string;
    objective: string;
    prompt: string;
  }>;
  /** Runtime state if meeting is in progress or completed. Null if not started. */
  runtime?: MeetingRuntimeDispatch | null;
}

interface MeetingRuntimeDispatch {
  status: "in_progress" | "completed" | "abandoned";
  current_round: number;
  current_phase: string;
  started_at: string;
  completed_at: string | null;
  participants_so_far: string[];
  completed_rounds: Array<{
    round: number;
    phase: string;
    contributions: Array<{
      participant: string;
      type: string;
      content: string;
      targets?: string[];
      round: number;
    }>;
  }>;
  current_round_contributions: Array<{
    participant: string;
    type: string;
    content: string;
    targets?: string[];
    round: number;
  }>;
  convergence_summary: string | null;
  open_questions: string[];
  triggered_by_action: string;
  triggered_by_stage: string;
  /** Whether dispatch should signal "continue" vs "fresh start" */
  is_continuation: boolean;
}

export async function dispatchCommand(
  projectRoot: string,
  options: DispatchOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const statePath = path.join(specGraphDir, "machine-state.yaml");

  // Execute pre-dispatch hooks
  const preHookResults = await executeHooks(projectRoot, "dispatch", "pre");
  for (const result of preHookResults) {
    if (!result.success && result.hook.abort_on_failure) {
      console.log(
        chalk.red(`✗ Pre-dispatch hook failed: ${result.hook.command}`),
      );
      console.log(chalk.gray(result.stderr));
      process.exit(1);
      return;
    }
  }

  try {
    let graph: Graph;
    try {
      graph = await readYaml<Graph>(graphPath);
    } catch {
      console.log(
        chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
      );
      process.exit(1);
      return;
    }

    const engine = new StateMachineEngine(graph, statePath, projectRoot);
    const state = await engine.getState();
    const traceIndex = await buildTraceIndex(projectRoot, graph);
    const plan = await computeNextPlan(graph, state, traceIndex, projectRoot);
    const permissions = await loadPermissions(projectRoot);
    const manifest = await buildDispatchManifest(
      plan,
      Boolean(options.all),
      permissions,
      graph,
      state,
      projectRoot,
      traceIndex,
    );

    // Record dispatch in active change's audit_log for traceability.
    // spec-graph itself doesn't track running/completed/failed (that's the
    // coordinator's job per the neutral engine principle) — but recording
    // WHICH action was dispatched at WHAT time gives the audit trail.
    if (!manifest.done && manifest.actions.length > 0) {
      const action = manifest.actions[0];
      const summary = `${action.type}:${action.id} (agent=${action.agent_id || action.agent_role}, requires_sub_agent=${action.requires_sub_agent})`;
      await appendToActiveChangeAudit(
        projectRoot,
        "dispatch",
        `stage=${manifest.current_stage} → ${manifest.next_stage || "-"} | ${summary}`,
      );
    }

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.join(projectRoot, options.output);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await writeYaml(outputPath, manifest);
    }

    if (options.json) {
      console.log(JSON.stringify(manifest, null, 2));
      // Execute post-dispatch hooks
      await executeHooks(projectRoot, "dispatch", "post");
      return;
    }

    renderDispatchManifest(manifest, options.output);

    // Execute post-dispatch hooks
    await executeHooks(projectRoot, "dispatch", "post");
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

async function buildDispatchManifest(
  plan: NextPlan,
  includeAll: boolean,
  permissions: PermissionConfig,
  graph: Graph,
  state: MachineState,
  projectRoot: string,
  traceIndex: any,
): Promise<DispatchManifest> {
  const selectedActions = includeAll
    ? plan.suggested_actions
    : plan.suggested_actions.slice(0, 1);

  const actions = await Promise.all(
    selectedActions.map((action, index) =>
      buildDispatchAction(
        action,
        index + 1,
        plan,
        permissions,
        graph,
        state,
        projectRoot,
        traceIndex,
      ),
    ),
  );

  // Extract artifact statuses for coordinator visibility
  const artifact_statuses: Record<string, string> = {};
  for (const [id, artifact] of Object.entries(state.artifacts)) {
    artifact_statuses[id] = artifact.status;
  }

  // Generate codebase summary from profile.yaml repo_signals
  let codebaseSummary: string | undefined;
  try {
    const profile = await readYaml<any>(
      path.join(projectRoot, ".spec-graph", "profile.yaml"),
    );
    if (profile?.repo_signals) {
      codebaseSummary = buildCodebaseSummary(
        profile.repo_signals as RepoSignals,
      );
    }
  } catch {
    // Skip if profile not found
  }

  // Load active change context
  let activeChange: DispatchManifest["active_change"];
  try {
    const change = await findActiveChange(projectRoot);
    if (change) {
      activeChange = {
        id: change.id,
        title: change.title,
        description: change.description,
        type: change.type,
        status: change.status,
        recent_audit: (change.audit_log || [])
          .slice(-5)
          .map((e: any) => ({
            timestamp: e.timestamp,
            action: e.action,
            message: e.message || "",
          })),
      };
    }
  } catch {
    // Skip if no active change
  }

  // Load constitution principles for quality guidance
  let constitutionPrinciples: DispatchManifest["constitution_principles"];
  try {
    const constitution = await tryReadYaml<Constitution>(
      path.join(projectRoot, ".spec-graph", "constitution.yaml"),
    );
    if (constitution) {
      constitutionPrinciples = {
        thresholds: constitution.quality?.thresholds as Record<string, number>,
        articles: constitution.quality?.articles?.map((a) => ({
          id: a.id,
          description: a.description,
        })),
        required_traces: constitution.traceability?.required_traces?.map((t) => ({
          name: t.name,
          from_kind: t.from_kind,
          to_kind: t.to_kind,
        })),
      };
    }
  } catch {
    // Skip if constitution not found
  }

  return {
    version: "1",
    created_at: new Date().toISOString(),
    current_stage: plan.current_stage,
    next_stage: plan.next_stage,
    transition: plan.transition,
    blocking_gate: plan.blocking_gate,
    gate_passed: plan.gate_passed,
    missing_artifacts: plan.missing_artifacts,
    failed_checks: plan.failed_checks,
    missing_traces: plan.missing_traces,
    missing_contracts: plan.missing_contracts,
    forbidden_violations: plan.forbidden_violations,
    artifact_statuses,
    done: plan.done,
    actions,
    project_config: graph.project_config,
    codebase_summary: codebaseSummary,
    active_change: activeChange,
    constitution_principles: constitutionPrinciples,
  };
}

async function buildDispatchAction(
  action: SuggestedAction,
  index: number,
  plan: NextPlan,
  permissions: PermissionConfig,
  graph: Graph,
  state: MachineState,
  projectRoot: string,
  traceIndex: any,
): Promise<DispatchAction> {
  const recommendedCommand = recommendedCommandFor(action);
  const role = roleForAction(action.type);
  const fileScope = resolveFileScope(role, permissions);

  // New: look up agent binding for this action's stage
  const stageName = inferStageFromAction(action, plan);
  const agentBinding = graph.agent_bindings?.find(
    (b) => b.action === stageName,
  );
  const agentDecl = agentBinding
    ? graph.agents?.find((a) => a.id === agentBinding.agent_id)
    : undefined;

  // New: check if this action triggers a meeting
  const meeting = await findMeetingForAction(
    graph,
    stageName,
    projectRoot,
    action.id,
  );

  // New: collect input artifacts based on agent's input_artifact_kinds
  const inputArtifacts = collectInputArtifacts(
    agentDecl,
    graph,
    state,
    projectRoot,
    action,
  );
  const requiresSubAgent = requiresSubAgentFor(action);

  // For run_check actions: look up the actual CheckDecl.command so the
  // coordinator can run it directly via Bash without consulting graph.yaml.
  const checkCommand =
    action.type === "run_check"
      ? graph.checks.find((c) => c.id === action.id)?.command
      : undefined;

  // For verify_trace actions: look up the trace query so the coordinator knows
  // WHAT trace needs to be created (not just that one is missing).
  const traceQuery =
    action.type === "verify_trace"
      ? findTraceQueryByName(graph, action.id)
      : undefined;

  // For produce_artifact actions: provide template reference and document guidance
  // so AI agents know what document to create and how.
  const templateRef =
    action.type === "produce_artifact"
      ? inferTemplateForArtifact(action.id, graph)
      : undefined;
  const suggestedDocPath =
    action.type === "produce_artifact"
      ? inferDocPathForArtifact(action.id, graph)
      : undefined;
  const documentGuidance =
    action.type === "produce_artifact"
      ? inferDocumentGuidance(action.id, graph)
      : undefined;

  return {
    index,
    type: action.type,
    id: action.id,
    description: action.description,
    command: action.command,
    recommended_command: recommendedCommand,
    next_step: nextStepFor(action, recommendedCommand),
    requires_sub_agent: requiresSubAgent,
    agent_id: agentDecl?.id,
    agent_prompt_ref: agentDecl?.prompt_ref,
    model_tier: agentDecl?.model_tier,
    meeting,
    input_artifacts: inputArtifacts,
    check_command: checkCommand,
    trace_query: traceQuery,
    template_ref: templateRef,
    suggested_doc_path: suggestedDocPath,
    document_guidance: documentGuidance,
    distilled_context: distillContext(action.id, graph, traceIndex, state),
    agent_role: role,
    role_description: permissions.roles[role]?.description || "",
    allowed_tools: permissions.roles[role]?.tools || [],
    file_scope: fileScope,
    prompt: promptFor(
      action,
      plan,
      role,
      fileScope,
      recommendedCommand,
      agentDecl,
      meeting,
      inputArtifacts,
      requiresSubAgent,
      graph.project_config,
    ),
  };
}

/**
 * Determine if an action requires dispatching a sub-agent (LLM work) or is deterministic.
 *
 * Deterministic actions (run_check, verify_trace, transition) should be executed
 * directly by the coordinator via the Bash tool — spawning a sub-agent just to
 * run `npm test` or `engine.transition()` is pure context waste.
 *
 * LLM actions (produce_artifact, perform_stage, resolve_violation) need a sub-agent
 * because they require reasoning/judgment to produce the output.
 */
function requiresSubAgentFor(action: SuggestedAction): boolean {
  switch (action.type) {
    case "produce_artifact":
    case "perform_stage":
    case "resolve_violation":
      return true;
    case "run_check":
    case "verify_trace":
    case "transition":
      return false;
    default:
      return true; // default to sub-agent for unknown action types
  }
}

/**
 * Collect input artifacts for an agent based on its declared input_artifact_kinds.
 *
 * The agent declares which kinds it consumes (e.g. ['requirement/*', 'design/architecture']).
 * We look up all artifacts in machine-state with status='completed', match their kind
 * against the agent's input_artifact_kinds (supporting glob '*'), and resolve their
 * on-disk path so the coordinator can feed them directly to the sub-agent.
 *
 * Fallback: when no agent binding exists (agentDecl undefined), we still want to give
 * the sub-agent relevant context — not nothing. We infer input kinds from the action:
 * - produce_artifact X: find agents whose output_artifact_kinds match X's kind, collect their input_artifact_kinds
 * - perform_stage: collect ALL completed artifacts (broad — stage work may need anything)
 * - resolve_violation: collect ALL completed artifacts
 * - run_check/verify_trace/transition: none (deterministic, no sub-agent)
 *
 * Path convention: <projectRoot>/.spec-graph/artifacts/<kind>/<id>.md
 * (where <id> is the artifact id without the kind prefix; e.g. 'requirement/proposal' → 'proposal')
 */
function collectInputArtifacts(
  agentDecl: AgentDecl | undefined,
  graph: Graph,
  state: MachineState,
  projectRoot: string,
  action: SuggestedAction,
): InputArtifactRef[] {
  // If agent has declared input_artifact_kinds, use them (precise scoping)
  if (agentDecl && agentDecl.input_artifact_kinds?.length) {
    return collectByKinds(
      agentDecl.input_artifact_kinds,
      graph,
      state,
      projectRoot,
    );
  }

  // Fallback: infer input kinds from action type
  return inferInputArtifacts(action, graph, state, projectRoot);
}

function collectByKinds(
  inputKinds: string[],
  graph: Graph,
  state: MachineState,
  projectRoot: string,
): InputArtifactRef[] {
  const result: InputArtifactRef[] = [];
  for (const artifactDecl of graph.artifacts || []) {
    const status = state.artifacts?.[artifactDecl.id]?.status;
    if (status !== "completed") continue;

    if (!matchesAnyKind(artifactDecl.kind, inputKinds)) continue;

    result.push({
      id: artifactDecl.id,
      kind: artifactDecl.kind,
      path: resolveArtifactPath(artifactDecl, projectRoot),
      status,
    });
  }
  return result;
}

/**
 * Fallback: infer input artifacts when no agent binding declares input_artifact_kinds.
 *
 * Strategy: for LLM actions, give the sub-agent SOME context rather than nothing.
 * - produce_artifact X: look at the artifact declaration for X, find its kind, then
 *   find agents that PRODUCE that kind — collect what THEY consume (transitive).
 * - perform_stage / resolve_violation: collect ALL completed artifacts (broad but bounded).
 * - Deterministic actions (run_check/verify_trace/transition): none (no sub-agent).
 */
function inferInputArtifacts(
  action: SuggestedAction,
  graph: Graph,
  state: MachineState,
  projectRoot: string,
): InputArtifactRef[] {
  if (
    action.type === "run_check" ||
    action.type === "verify_trace" ||
    action.type === "transition"
  ) {
    return []; // deterministic — no sub-agent, no input artifacts needed
  }

  if (action.type === "produce_artifact") {
    // Find the artifact declaration for action.id
    const targetDecl = graph.artifacts?.find((a) => a.id === action.id);
    if (!targetDecl) return [];

    // Find agents whose output_artifact_kinds match the target kind
    const producerKinds =
      graph.agents
        ?.filter((agent) =>
          agent.output_artifact_kinds.some((k) =>
            matchKindPattern(targetDecl.kind, k),
          ),
        )
        .flatMap((agent) => agent.input_artifact_kinds) || [];

    if (producerKinds.length === 0) {
      // No producer agents declared — fall back to all completed artifacts
      return collectAllCompleted(graph, state, projectRoot);
    }

    return collectByKinds(producerKinds, graph, state, projectRoot);
  }

  // perform_stage, resolve_violation: broad — collect all completed artifacts
  return collectAllCompleted(graph, state, projectRoot);
}

function collectAllCompleted(
  graph: Graph,
  state: MachineState,
  projectRoot: string,
): InputArtifactRef[] {
  const result: InputArtifactRef[] = [];
  for (const artifactDecl of graph.artifacts || []) {
    const status = state.artifacts?.[artifactDecl.id]?.status;
    if (status !== "completed") continue;
    result.push({
      id: artifactDecl.id,
      kind: artifactDecl.kind,
      path: resolveArtifactPath(artifactDecl, projectRoot),
      status,
    });
  }
  return result;
}

function matchesAnyKind(kind: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchKindPattern(kind, pattern));
}

function matchKindPattern(kind: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === kind) return true;
  // Support prefix glob: 'requirement/*' matches 'requirement/proposal'
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return kind === prefix || kind.startsWith(prefix + "/");
  }
  return false;
}

function resolveArtifactPath(
  artifactDecl: ArtifactDecl,
  projectRoot: string,
): string {
  // Artifact id may be 'requirement/proposal' or just 'proposal'.
  // Split into kind-prefix and id-suffix; if id already has a slash, use the suffix as filename.
  const idParts = artifactDecl.id.split("/");
  const filename =
    idParts.length > 1 ? idParts[idParts.length - 1] : artifactDecl.id;
  return path.join(
    projectRoot,
    ".spec-graph",
    "artifacts",
    artifactDecl.kind,
    `${filename}.md`,
  );
}

/**
 * Infer which pipeline stage an action belongs to.
 * The dispatch action's id or type maps to a stage name that we can look up
 * in agent_bindings and meetings.on_actions.
 */
function inferStageFromAction(action: SuggestedAction, plan: NextPlan): string {
  // perform_stage actions directly name the stage
  if (action.type === "perform_stage") {
    return action.id;
  }
  // produce_artifact / run_check / verify_trace actions happen WITHIN a stage.
  // The current stage is where this work belongs.
  return plan.current_stage;
}

/**
 * Find a meeting triggered by this action/stage.
 * A meeting's on_actions lists which stages trigger it.
 *
 * Also loads the meeting runtime state from .spec-graph/meetings/<id>.yaml
 * so the coordinator knows whether this is a fresh start or a continuation.
 */
async function findMeetingForAction(
  graph: Graph,
  stageName: string,
  projectRoot: string,
  actionId: string,
): Promise<MeetingDispatch | undefined> {
  const meeting = graph.meetings?.find((m) =>
    m.on_actions?.includes(stageName),
  );
  if (!meeting) return undefined;

  // Load runtime state to determine fresh vs continuation
  const runtime = await loadMeetingRuntime(projectRoot, meeting.id);
  const runtimeDispatch = runtime ? toRuntimeDispatch(runtime, actionId) : null;

  return {
    meeting_id: meeting.id,
    description: meeting.description,
    purpose: meeting.purpose,
    participants: meeting.participants.map((p) => ({
      agent_id: p.agent_id,
      expert_role: p.expert_role,
      role: p.role,
      perspective: p.perspective,
    })),
    min_rounds: meeting.min_rounds,
    max_rounds: meeting.max_rounds,
    output_artifacts: meeting.output_artifacts,
    expert_invite_protocol: meeting.expert_invite_protocol,
    rounds: meeting.rounds.map((r) => ({
      number: r.number,
      phase: r.phase,
      objective: r.objective,
      prompt: r.prompt,
    })),
    runtime: runtimeDispatch,
  };
}

function toRuntimeDispatch(
  runtime: MeetingRuntime,
  actionId: string,
): MeetingRuntimeDispatch {
  // A continuation = in_progress meeting for this stage. Since findMeetingForAction
  // only returns a meeting when the stage is in on_actions, any in_progress runtime
  // we see here IS a continuation (the coordinator should resume, not restart).
  const isContinuation = runtime.status === "in_progress";

  return {
    status: runtime.status,
    current_round: runtime.current_round,
    current_phase: runtime.current_phase,
    started_at: runtime.started_at,
    completed_at: runtime.completed_at,
    participants_so_far: runtime.participants,
    completed_rounds: runtime.rounds.map((r) => ({
      round: r.round,
      phase: r.phase,
      contributions: r.contributions.map((c) => ({
        participant: c.participant,
        type: c.type,
        content: c.content,
        targets: c.targets,
        round: c.round,
      })),
    })),
    current_round_contributions: runtime.current_round_contributions.map(
      (c) => ({
        participant: c.participant,
        type: c.type,
        content: c.content,
        targets: c.targets,
        round: c.round,
      }),
    ),
    convergence_summary: runtime.convergence_summary,
    open_questions: runtime.open_questions,
    triggered_by_action: runtime.triggered_by_action,
    triggered_by_stage: runtime.triggered_by_stage,
    is_continuation: isContinuation,
  };
}

function recommendedCommandFor(action: SuggestedAction): string | undefined {
  if (action.type === "produce_artifact") {
    return `spec-graph artifact complete ${action.id} --producer agent`;
  }

  if (action.type === "run_check") {
    return `spec-graph check --id ${action.id}`;
  }

  if (action.type === "transition") {
    return action.command;
  }

  if (action.type === "verify_trace") {
    // verify_trace has no executable command — the trace must be CREATED
    // (via spec-graph trace add or artifact completion auto-wiring), not run.
    // The next_step below handles the workflow loop.
    return undefined;
  }

  if (action.type === "perform_stage") {
    return `spec-graph dispatch — complete '${action.id}' stage work then run this to check next steps`;
  }

  return action.command;
}

/**
 * Find a trace query by name, searching across all gates' require_traces.
 * Used to populate actions[].trace_query for verify_trace actions so the
 * coordinator knows what trace needs to be created (not just that one is missing).
 */
function findTraceQueryByName(
  graph: Graph,
  name: string,
): TraceQuery | undefined {
  for (const gate of graph.gates || []) {
    for (const trace of gate.require_traces || []) {
      if (trace.name === name) return trace;
    }
  }
  return undefined;
}

/**
 * The next_step tells the coordinator what to run AFTER the sub-agent completes.
 * This is the workflow-advancing command that closes the coordinator loop.
 *
 * For produce_artifact / run_check / transition: the recommended_command itself
 * advances the workflow (artifact completion, check run, state transition).
 * For perform_stage: there's no single command — the sub-agent produces
 * artifacts which the coordinator then completes via spec-graph commands.
 * In all cases, after the action completes the coordinator should re-run
 * `spec-graph dispatch` to see what's next.
 */
function nextStepFor(
  action: SuggestedAction,
  recommendedCommand: string | undefined,
): string {
  if (action.type === "transition") {
    // Transition is already the advancing command — after it, loop back to dispatch
    return `${recommendedCommand} && spec-graph dispatch --json`;
  }

  if (action.type === "produce_artifact" || action.type === "run_check") {
    // Run the completing command, then loop back to dispatch for next step
    return `${recommendedCommand} && spec-graph dispatch --json`;
  }

  if (action.type === "verify_trace") {
    // verify_trace has no executable shell command — the trace must be CREATED,
    // not run. Return a re-dispatch command (the trace itself must be created
    // separately via spec-graph trace add or artifact completion auto-wiring).
    // The next dispatch will re-evaluate the trace query and either pass (if
    // created) or block again (if still missing).
    return `spec-graph dispatch --json`;
  }

  if (action.type === "resolve_violation") {
    // resolve_violation requires sub-agent work (LLM judgment) — coordinator
    // dispatches a sub-agent to resolve the violation, then re-runs dispatch.
    return `spec-graph dispatch --json`;
  }

  if (action.type === "perform_stage") {
    // perform_stage requires sub-agent work first; coordinator dispatches a
    // sub-agent per the protocol, the sub-agent produces artifacts which the
    // coordinator marks completed, then re-runs dispatch.
    // Return a re-dispatch command — the sub-agent dispatch itself happens
    // via the Agent tool (see coordinator-protocol.md), not via Bash.
    return `spec-graph dispatch --json`;
  }

  return `spec-graph dispatch --json`;
}

function promptFor(
  action: SuggestedAction,
  plan: NextPlan,
  role: AgentRole,
  fileScope: { read: string[]; write: string[] },
  recommendedCommand: string | undefined,
  agentDecl: AgentDecl | undefined,
  meeting: MeetingDispatch | undefined,
  inputArtifacts: InputArtifactRef[],
  requiresSubAgent: boolean,
  projectConfig?: {
    context?: Record<string, string>;
    rules?: Record<string, string>;
    references?: Record<string, string>;
  },
): string {
  const lines: string[] = [];

  // For deterministic actions (no sub-agent needed), produce a minimal prompt —
  // the coordinator just runs the command directly via Bash.
  if (!requiresSubAgent) {
    lines.push("# Spec-Graph Deterministic Action (No Sub-Agent Needed)");
    lines.push("");
    lines.push("## Action");
    lines.push(`- Type: ${action.type}`);
    lines.push(`- ID: ${action.id}`);
    lines.push(`- Description: ${action.description}`);
    lines.push("");
    lines.push("## Execution");
    lines.push(
      "This action is DETERMINISTIC — the coordinator runs it directly via the Bash tool.",
    );
    lines.push(
      "Do NOT dispatch a sub-agent for this. Spawning a sub-agent to run a shell command",
    );
    lines.push("or state-machine operation is pure context waste.");
    lines.push("");
    if (recommendedCommand) {
      lines.push(`Run: \`${recommendedCommand}\``);
    }
    lines.push("");
    lines.push(
      "After completion, loop back to `spec-graph dispatch --json` for the next step.",
    );
    return lines.join("\n");
  }

  // Standardized prompt envelope for sub-agent dispatch — see agents/prompt-envelope.md
  // Coordinator fills [PLACEHOLDER] sections before dispatching sub-agent.
  lines.push("# Spec-Graph Sub-Agent Dispatch");
  lines.push("");
  lines.push("## Identity");
  if (agentDecl) {
    lines.push(
      `You are the **${agentDecl.id}** agent for a spec-graph workflow.`,
    );
    lines.push(`- Role: ${agentDecl.description}`);
    lines.push(`- Model tier: ${agentDecl.model_tier}`);
    lines.push(`- Can execute actions: ${agentDecl.actions.join(", ")}`);
  } else {
    lines.push(
      `You are acting as **${role}** for a spec-graph workflow (no agent binding — using permission role fallback).`,
    );
    lines.push(`- Role description: ${role}`);
  }

  lines.push("");
  lines.push("## System Prompt");
  if (agentDecl?.prompt_ref) {
    lines.push(
      `[COORDINATOR: load content from \`${agentDecl.prompt_ref}\` and paste below this line]`,
    );
    lines.push("");
    lines.push("--- BEGIN SYSTEM PROMPT ---");
    lines.push("[paste system prompt content here]");
    lines.push("--- END SYSTEM PROMPT ---");
  } else {
    lines.push(
      "(no system prompt template declared — use only the task context below)",
    );
  }

  lines.push("");
  lines.push("## Task Context");
  lines.push(`- Current stage: ${plan.current_stage}`);
  if (plan.next_stage) {
    lines.push(`- Target next stage: ${plan.next_stage}`);
  }
  if (plan.blocking_gate) {
    lines.push(`- Blocking gate: ${plan.blocking_gate}`);
  }
  lines.push(`- Required action: ${action.description}`);
  lines.push(`- Action type: ${action.type}`);
  lines.push(`- Action id: ${action.id}`);

  // Inject project-level config (from .spec-graph/config.yaml) so sub-agents
  // see project-specific tech stack constraints and per-artifact rules.
  if (
    projectConfig &&
    (projectConfig.context || projectConfig.rules || projectConfig.references)
  ) {
    lines.push("");
    lines.push("## Project Config");
    if (
      projectConfig.context &&
      Object.keys(projectConfig.context).length > 0
    ) {
      lines.push("### Context (project-specific constraints)");
      for (const [k, v] of Object.entries(projectConfig.context)) {
        lines.push(`- ${k}: ${v}`);
      }
    }
    if (projectConfig.rules) {
      const matchingRule = projectConfig.rules[action.id];
      if (matchingRule) {
        lines.push("");
        lines.push(`### Rule for ${action.id}`);
        lines.push(matchingRule);
      }
    }
    if (
      projectConfig.references &&
      Object.keys(projectConfig.references).length > 0
    ) {
      lines.push("");
      lines.push("### External References");
      for (const [k, v] of Object.entries(projectConfig.references)) {
        lines.push(`- ${k}: ${v}`);
      }
    }
  }

  lines.push("");
  lines.push("## Input Artifacts");
  if (inputArtifacts.length > 0) {
    lines.push(
      "[COORDINATOR: read each artifact file and paste its content below the corresponding header]",
    );
    lines.push("");
    for (const a of inputArtifacts) {
      lines.push(`### ${a.id}`);
      lines.push(`- Kind: ${a.kind}`);
      lines.push(`- Status: ${a.status}`);
      lines.push(`- Path: ${a.path}`);
      lines.push("");
      lines.push("```markdown");
      lines.push(`[paste content of ${a.path} here]`);
      lines.push("```");
      lines.push("");
    }
  } else {
    lines.push(
      "(none — this action may be the first in the workflow, or input artifacts are not yet completed)",
    );
  }

  if (meeting) {
    lines.push("");
    lines.push("## Meeting Orchestration");
    lines.push(`This stage triggers a meeting: **${meeting.meeting_id}**`);
    lines.push(`- Purpose: ${meeting.purpose}`);

    // Runtime state: continuation vs fresh start
    if (meeting.runtime) {
      const rt = meeting.runtime;
      if (rt.is_continuation) {
        lines.push("");
        lines.push("### ⚠️ CONTINUATION — Meeting is in progress");
        lines.push(`- Status: ${rt.status}`);
        lines.push(
          `- Current round: ${rt.current_round} (${rt.current_phase})`,
        );
        lines.push(
          `- Participants so far: ${rt.participants_so_far.join(", ")}`,
        );
        lines.push(
          `- Triggered by: ${rt.triggered_by_action} (stage: ${rt.triggered_by_stage})`,
        );
        lines.push(`- Started at: ${rt.started_at}`);
        lines.push("");
        lines.push("### Completed Rounds (broadcast to all participants)");
        for (const r of rt.completed_rounds) {
          lines.push(`#### Round ${r.round} (${r.phase})`);
          for (const c of r.contributions) {
            const targets = c.targets ? ` → ${c.targets.join(", ")}` : "";
            lines.push(
              `- [${c.type}] ${c.participant}${targets}: ${c.content}`,
            );
          }
          lines.push("");
        }
        if (rt.current_round_contributions.length > 0) {
          lines.push(
            `### Current Round ${rt.current_round} — Contributions So Far`,
          );
          for (const c of rt.current_round_contributions) {
            const targets = c.targets ? ` → ${c.targets.join(", ")}` : "";
            lines.push(
              `- [${c.type}] ${c.participant}${targets}: ${c.content}`,
            );
          }
          lines.push("");
        }
        if (rt.open_questions.length > 0) {
          lines.push("### Open Questions");
          for (const q of rt.open_questions) {
            lines.push(`- ? ${q}`);
          }
          lines.push("");
        }
        lines.push(
          "**Coordinator action**: dispatch next participant with the broadcast above + current round objective. Use `spec-graph meeting record` to capture contributions, `spec-graph meeting advance` to move to next round, `spec-graph meeting complete` to synthesize.",
        );
      } else if (rt.status === "completed") {
        lines.push("");
        lines.push("### ℹ️ Meeting already completed");
        lines.push(`- Completed at: ${rt.completed_at}`);
        if (rt.convergence_summary) {
          lines.push(`- Summary: ${rt.convergence_summary}`);
        }
        lines.push(`- Rounds completed: ${rt.completed_rounds.length}`);
        lines.push("");
        lines.push(
          "**Coordinator action**: meeting is done — proceed to next_step (artifacts should already be produced).",
        );
      } else if (rt.status === "abandoned") {
        lines.push("");
        lines.push("### ⚠️ Meeting was abandoned");
        lines.push(`- Reason: ${rt.convergence_summary || "(none)"}`);
        lines.push("");
        lines.push(
          "**Coordinator action**: meeting was abandoned. Decide: re-start fresh (delete runtime file) or escalate to user.",
        );
      }
    } else {
      lines.push("");
      lines.push("### Fresh Start");
      lines.push("- No runtime state found — this is a new meeting.");
      lines.push(
        `- Coordinator: run \`spec-graph meeting record ${meeting.meeting_id} --participant <agent> --type <type> --content <text>\` for the first contribution.`,
      );
    }

    lines.push("");
    lines.push("### Participants");
    for (const p of meeting.participants) {
      const who = p.agent_id || p.expert_role || "unknown";
      lines.push(`- ${who} (${p.role}): ${p.perspective}`);
    }
    lines.push("");
    lines.push("### Round Structure");
    lines.push(
      `- Rounds: ${meeting.min_rounds} minimum, ${meeting.max_rounds} maximum (facilitator decides dynamically)`,
    );
    for (const r of meeting.rounds) {
      lines.push(`  - Round ${r.number} (${r.phase}): ${r.objective}`);
    }
    lines.push("");
    lines.push("### Process");
    lines.push(
      "1. For each round, broadcast all prior contributions to all core participants",
    );
    lines.push(
      "2. Each participant contributes via the agent tool (isolated sub-agent)",
    );
    lines.push(
      "3. After each round, check convergence (open questions, unresolved challenges)",
    );
    lines.push("4. If not converged and rounds < max, add another round");
    lines.push(
      "5. If converged or max rounds reached, synthesize output artifacts",
    );
    if (meeting.expert_invite_protocol) {
      lines.push(
        `6. If a knowledge gap emerges, invite a domain expert (protocol: ${meeting.expert_invite_protocol})`,
      );
    }
    lines.push("");
    lines.push("### Output Artifacts");
    for (const artifactId of meeting.output_artifacts) {
      lines.push(`- ${artifactId}`);
    }
  }

  lines.push("");
  lines.push("## Constraints");
  lines.push(`- Read paths: ${fileScope.read.join(", ")}`);
  lines.push(`- Write paths: ${fileScope.write.join(", ")}`);
  lines.push(
    `- Allowed tools: ${role === "spec-author" ? "Read, Write, Edit, Bash (limited)" : "Read, Write, Edit"}`,
  );

  if (recommendedCommand) {
    lines.push("");
    lines.push("## Completion");
    lines.push(`After completing the work, run: \`${recommendedCommand}\``);
    lines.push(
      `Then end your response with a \`status-report\` block (see \`agents/status-report-protocol.md\`).`,
    );
    lines.push("");
    lines.push(
      "Coordinator loop: see `next_step` field in manifest, or consult `agents/coordinator-protocol.md`.",
    );
  }

  return lines.join("\n");
}

function renderDispatchManifest(
  manifest: DispatchManifest,
  output?: string,
): void {
  console.log(chalk.bold("\nDispatch Manifest\n"));
  console.log(`  Current Stage: ${chalk.cyan(manifest.current_stage)}`);
  console.log(`  Next Stage:    ${chalk.cyan(manifest.next_stage || "-")}`);
  console.log(`  Gate:          ${manifest.blocking_gate || "no gate"}`);
  console.log(
    `  Gate Passed:   ${manifest.gate_passed ? chalk.green("yes") : chalk.red("no")}`,
  );

  if (manifest.done) {
    console.log(chalk.green("\n  Workflow is complete. No dispatch needed.\n"));
    return;
  }

  if (!manifest.gate_passed) {
    console.log(chalk.red("\n  Gate Failures:"));
    if (manifest.missing_artifacts.length > 0) {
      console.log(
        `    Missing artifacts: ${manifest.missing_artifacts.join(", ")}`,
      );
    }
    if (manifest.failed_checks.length > 0) {
      console.log(
        `    Failed checks:     ${manifest.failed_checks.join(", ")}`,
      );
    }
    if (manifest.missing_traces.length > 0) {
      console.log(
        `    Missing traces:    ${manifest.missing_traces.join(", ")}`,
      );
    }
    if (manifest.missing_contracts.length > 0) {
      console.log(
        `    Contract drift:    ${manifest.missing_contracts.length} consumer(s)`,
      );
    }
    if (manifest.forbidden_violations.length > 0) {
      console.log(
        `    Forbidden:         ${manifest.forbidden_violations.join(", ")}`,
      );
    }
    console.log("");
  }

  if (output) {
    console.log(`  Written To:     ${output}`);
  }

  console.log("");

  const table = new Table({
    head: ["#", "Agent", "Type", "ID", "Meeting", "Command"],
    style: { head: ["cyan"] },
    wordWrap: true,
  });

  for (const action of manifest.actions) {
    table.push([
      action.index,
      action.agent_id || action.agent_role,
      action.type,
      action.id,
      action.meeting ? chalk.magenta(action.meeting.meeting_id) : "-",
      action.recommended_command || action.command || "-",
    ]);
  }

  console.log(table.toString());

  if (manifest.actions[0]) {
    const action = manifest.actions[0];
    console.log(chalk.bold("\nPrompt\n"));
    console.log(action.prompt);
    console.log("");
    console.log(chalk.gray("File scope:"));
    console.log(chalk.gray(`  Read:  ${action.file_scope.read.join(", ")}`));
    console.log(chalk.gray(`  Write: ${action.file_scope.write.join(", ")}`));

    if (action.input_artifacts.length > 0) {
      console.log(
        chalk.gray(`\nInput artifacts (${action.input_artifacts.length}):`),
      );
      for (const a of action.input_artifacts) {
        console.log(chalk.gray(`  - ${a.id} [${a.kind}] ${a.path}`));
      }
    }

    if (action.agent_id) {
      console.log(
        chalk.gray(
          `\nAgent: ${action.agent_id} (${action.model_tier || "standard"})`,
        ),
      );
      if (action.agent_prompt_ref) {
        console.log(chalk.gray(`Prompt template: ${action.agent_prompt_ref}`));
      }
    }

    if (action.meeting) {
      console.log(chalk.magenta(`\nMeeting: ${action.meeting.meeting_id}`));
      console.log(
        chalk.gray(
          `  Rounds: ${action.meeting.min_rounds}-${action.meeting.max_rounds} (dynamic)`,
        ),
      );
      console.log(
        chalk.gray(
          `  Participants: ${action.meeting.participants.map((p) => p.agent_id || p.expert_role).join(", ")}`,
        ),
      );
    }

    if (action.next_step) {
      console.log(
        chalk.gray(
          `\nNext step (coordinator): ${action.next_step.split("\n")[0]}...`,
        ),
      );
      console.log(chalk.gray(`  Protocol: agents/coordinator-protocol.md`));
    }
  }

  console.log("");
}

// ============ Document guidance helpers ============

/**
 * Infer template name for an artifact ID.
 * Maps artifact kinds to template names in packs/foundation.pack/templates/.
 */
function inferTemplateForArtifact(
  artifactId: string,
  graph: Graph,
): string | undefined {
  const artifactDecl = graph.artifacts?.find((a) => a.id === artifactId);
  if (!artifactDecl) return undefined;

  // Map artifact kind to template name
  const kindToTemplate: Record<string, string> = {
    "requirement/prd": "prd",
    "design/architecture": "architecture",
    "plan/story": "story",
    "plan/epic": "epic",
    "plan/task": "task",
    "design/adr": "adr",
  };

  return kindToTemplate[artifactDecl.kind] || artifactDecl.kind.split("/")[1];
}

/**
 * Suggest document path for an artifact.
 * Provides a reasonable default location in the project filesystem.
 */
function inferDocPathForArtifact(artifactId: string, graph: Graph): string {
  // Get artifact kind from graph
  const artifact = graph.artifacts?.find((a) => a.id === artifactId);
  const artifactKind =
    artifact?.kind || artifactId.split("/").slice(0, 2).join("/");

  // Convert artifact ID and kind to a file path within .spec-graph/artifacts/
  // Organized by document type: prd/, architecture/, epics/, story/, task/, adr/
  // e.g., artifactId: "requirement/prd/PRD-001", artifactKind: "requirement/prd"
  //   -> ".spec-graph/artifacts/prd/PRD-001.md"
  // e.g., artifactId: "design/architecture/ARCH-001", artifactKind: "design/architecture"
  //   -> ".spec-graph/artifacts/architecture/ARCH-001.md"

  const parts = artifactId.split("/");
  const name = parts[parts.length - 1];

  // Map artifact kind to specific directory
  const kindToDir: Record<string, string> = {
    "requirement/prd": "prd",
    "design/architecture": "architecture",
    "plan/epic": "epics",
    "plan/story": "story",
    "plan/task": "task",
    "design/adr": "adr",
    "contract/api": "contract",
    "verification/test": "test",
  };

  const dir =
    kindToDir[artifactKind] || artifactKind.split("/").pop() || "misc";
  return `.spec-graph/artifacts/${dir}/${name}.md`;
}

/**
 * Infer document guidance for an artifact.
 * Provides a brief description of what the document should contain.
 */
function inferDocumentGuidance(artifactId: string, graph: Graph): string {
  const artifactDecl = graph.artifacts?.find((a) => a.id === artifactId);
  if (!artifactDecl) {
    return `Create a document for artifact '${artifactId}'`;
  }

  const guidanceMap: Record<string, string> = {
    "requirement/prd":
      "Product Requirements Document: problem statement, user stories, acceptance criteria, functional and non-functional requirements",
    "design/architecture":
      "Architecture Document: system context, container diagram, component design, data model, technology decisions",
    "plan/story":
      "User Story: story statement, acceptance criteria, technical notes, dependencies, testing approach",
    "plan/epic":
      "Epic: epic statement, list of user stories, success criteria, timeline, risks and mitigations",
    "plan/task":
      "Task: task description, story reference, acceptance criteria, implementation steps, dependencies",
    "design/adr":
      "Architecture Decision Record: context, decision, consequences, alternatives considered, implementation notes",
  };

  return (
    guidanceMap[artifactDecl.kind] ||
    `Create a document for ${artifactDecl.kind} artifact`
  );
}
