"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = runCommand;
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const cli_table3_1 = __importDefault(require("cli-table3"));
const index_1 = require("../engine/machine/index");
const index_2 = require("../engine/check/index");
const builtin_1 = require("../engine/checks/builtin");
const diff_select_1 = require("../engine/check/diff-select");
const index_3 = require("../engine/next/index");
const index_4 = require("../engine/trace/index");
const yaml_1 = require("../utils/yaml");
const index_5 = require("../engine/permissions/index");
async function runCommand(projectRoot, options) {
    const specGraphDir = node_path_1.default.join(projectRoot, ".spec-graph");
    const graphPath = node_path_1.default.join(specGraphDir, "graph.yaml");
    const statePath = node_path_1.default.join(specGraphDir, "machine-state.yaml");
    try {
        let graph;
        try {
            graph = await (0, yaml_1.readYaml)(graphPath);
        }
        catch {
            console.log(chalk_1.default.red("✗ Graph not found. Run `spec-graph compose` first."));
            process.exit(1);
            return;
        }
        const engine = new index_1.StateMachineEngine(graph, statePath, projectRoot);
        await engine.getState();
        const permissions = await (0, index_5.loadPermissions)(projectRoot);
        const result = await runLoop(projectRoot, graph, engine, permissions, options);
        if (options.json) {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            renderRunResult(result);
        }
        if (result.failed)
            process.exitCode = 1;
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exitCode = 1;
    }
}
async function runLoop(projectRoot, graph, engine, permissions, options) {
    const maxSteps = parsePositiveInt(options.maxSteps, 10);
    const timeoutMs = parsePositiveInt(options.timeout, 120_000);
    const steps = [];
    for (let i = 1; i <= maxSteps; i++) {
        const state = await engine.getState();
        const traceIndex = await (0, index_4.buildTraceIndex)(projectRoot, graph);
        const plan = await (0, index_3.computeNextPlan)(graph, state, traceIndex, projectRoot);
        if (plan.done) {
            steps.push({
                step: i,
                action: "done",
                id: state.current_stage,
                status: "done",
                message: "Workflow is complete.",
            });
            return {
                completed: true,
                blocked: false,
                failed: false,
                steps,
                next_plan: plan,
            };
        }
        const action = plan.suggested_actions[0];
        if (!action || !isRunnableAction(action, permissions)) {
            steps.push({
                step: i,
                action: action?.type || "none",
                id: action?.id || "-",
                status: "blocked",
                message: action
                    ? `Manual or agent work required: ${action.description}`
                    : "No suggested action available.",
            });
            return {
                completed: false,
                blocked: true,
                failed: false,
                steps,
                next_plan: plan,
            };
        }
        const step = await executeAction(projectRoot, graph, engine, action, i, timeoutMs, Boolean(options.dryRun), options);
        steps.push(step);
        if (step.status === "failed") {
            const traceIndex = await (0, index_4.buildTraceIndex)(projectRoot, graph);
            const nextPlan = await (0, index_3.computeNextPlan)(graph, await engine.getState(), traceIndex, projectRoot);
            return {
                completed: false,
                blocked: false,
                failed: true,
                steps,
                next_plan: nextPlan,
            };
        }
        if (step.status === "blocked") {
            // Action cannot be auto-completed (requires sub-agent dispatch or trace creation).
            // Stop the loop — continuing would just re-suggest the same action.
            const traceIndex = await (0, index_4.buildTraceIndex)(projectRoot, graph);
            const nextPlan = await (0, index_3.computeNextPlan)(graph, await engine.getState(), traceIndex, projectRoot);
            return {
                completed: false,
                blocked: true,
                failed: false,
                steps,
                next_plan: nextPlan,
            };
        }
    }
    const traceIndex = await (0, index_4.buildTraceIndex)(projectRoot, graph);
    const nextPlan = await (0, index_3.computeNextPlan)(graph, await engine.getState(), traceIndex, projectRoot);
    return {
        completed: nextPlan.done,
        blocked: !nextPlan.done,
        failed: false,
        steps,
        next_plan: nextPlan,
    };
}
function isRunnableAction(action, permissions) {
    return (0, index_5.isActionAllowed)(action.type, permissions);
}
async function executeAction(projectRoot, graph, engine, action, stepNumber, timeoutMs, dryRun, options) {
    if (action.type === "run_check") {
        return await executeRunCheck(projectRoot, graph, engine, action, stepNumber, timeoutMs, dryRun, options);
    }
    if (action.type === "transition") {
        return await executeTransition(engine, action, stepNumber);
    }
    if (action.type === "verify_trace") {
        return await executeVerifyTrace(projectRoot, graph, action, stepNumber);
    }
    // produce_artifact, perform_stage, resolve_violation — these require LLM work.
    // `run` is a deterministic executor; it cannot produce artifacts or resolve
    // governance issues. Yield a blocked step with full dispatch instructions
    // so the coordinator (main agent) can dispatch a sub-agent to handle it.
    return yieldSubAgentDispatch(projectRoot, graph, engine, action, stepNumber);
}
/**
 * Build a RunStep that yields control to the coordinator for sub-agent dispatch.
 *
 * The step's `dispatch_instructions` field contains everything the coordinator
 * needs to dispatch a sub-agent via the Agent tool:
 *   - agent_id, agent_prompt_ref, model_tier (which sub-agent to use)
 *   - template_ref, suggested_doc_path, document_guidance (what document to produce)
 *   - input_artifacts (paths to read)
 *   - next_step (command to run after sub-agent completes)
 *
 * After the coordinator dispatches the sub-agent and marks the artifact complete,
 * it should re-run `spec-graph run --auto-loop` (or `spec-graph dispatch --json`)
 * to continue the loop.
 */
async function yieldSubAgentDispatch(projectRoot, graph, engine, action, stepNumber) {
    const state = await engine.getState();
    // Look up agent binding for this action's stage
    const stageName = action.id;
    const agentBinding = graph.agent_bindings?.find((b) => b.action === stageName);
    const agentDecl = agentBinding
        ? graph.agents?.find((a) => a.id === agentBinding.agent_id)
        : undefined;
    // Collect input artifacts based on agent's input_artifact_kinds
    const inputArtifacts = collectInputArtifactsForRun(agentDecl, graph, state);
    // Look up template and document guidance for produce_artifact actions
    const artifactDecl = graph.artifacts?.find((a) => a.id === action.id);
    const templateRef = artifactDecl ? inferTemplateForRun(artifactDecl.kind) : undefined;
    const suggestedDocPath = artifactDecl
        ? inferDocPathForRun(action.id, artifactDecl.kind)
        : undefined;
    const documentGuidance = artifactDecl
        ? inferDocumentGuidanceForRun(artifactDecl.kind)
        : undefined;
    const dispatchInstructions = {
        agent_id: agentDecl?.id,
        agent_prompt_ref: agentDecl?.prompt_ref,
        model_tier: agentDecl?.model_tier,
        template_ref: templateRef,
        suggested_doc_path: suggestedDocPath,
        document_guidance: documentGuidance,
        input_artifacts: inputArtifacts,
        next_step: "spec-graph artifact complete " + action.id + " && spec-graph run --auto-loop",
        message: `Action '${action.type}' for '${action.id}' requires sub-agent dispatch. Load system prompt from ${agentDecl?.prompt_ref || "(none)"}, generate document content per template '${templateRef || "none"}', write to ${suggestedDocPath || "(decide path)"}, then mark artifact complete and re-run dispatch.`,
    };
    return {
        step: stepNumber,
        action: action.type,
        id: action.id,
        status: "blocked",
        message: dispatchInstructions.message,
        dispatch_instructions: dispatchInstructions,
    };
}
/**
 * Collect input artifacts for a sub-agent based on its declared input_artifact_kinds.
 * Returns completed artifacts matching the agent's input kinds.
 */
function collectInputArtifactsForRun(agentDecl, graph, state) {
    if (!agentDecl || !agentDecl.input_artifact_kinds?.length) {
        return [];
    }
    const result = [];
    for (const [id, artifact] of Object.entries(state.artifacts || {})) {
        if (artifact.status !== "completed")
            continue;
        const artifactDecl = (graph.artifacts || []).find((a) => a.id === id);
        if (!artifactDecl)
            continue;
        const matchesKind = agentDecl.input_artifact_kinds.some((kind) => {
            if (kind.endsWith("/*")) {
                return artifactDecl.kind.startsWith(kind.slice(0, -1));
            }
            return artifactDecl.kind === kind;
        });
        if (matchesKind) {
            result.push({
                id,
                kind: artifactDecl.kind,
                path: `.spec-graph/artifacts/${artifactDecl.kind.split("/").pop()}/${id.split("/").pop()}.md`,
                status: artifact.status,
            });
        }
    }
    return result;
}
/**
 * Infer template name from artifact kind.
 */
function inferTemplateForRun(artifactKind) {
    const kindToTemplate = {
        "requirement/prd": "prd",
        "design/architecture": "architecture",
        "plan/story": "story",
        "plan/epic": "epic",
        "plan/task": "task",
        "design/adr": "adr",
    };
    return kindToTemplate[artifactKind] || artifactKind.split("/").pop();
}
/**
 * Infer document path for an artifact.
 */
function inferDocPathForRun(artifactId, artifactKind) {
    const parts = artifactId.split("/");
    const name = parts[parts.length - 1];
    const kindToDir = {
        "requirement/prd": "prd",
        "design/architecture": "architecture",
        "plan/epic": "epics",
        "plan/story": "story",
        "plan/task": "task",
        "design/adr": "adr",
    };
    const dir = kindToDir[artifactKind] || artifactKind.split("/").pop() || "misc";
    return `.spec-graph/artifacts/${dir}/${name}.md`;
}
/**
 * Infer document guidance for an artifact.
 */
function inferDocumentGuidanceForRun(artifactKind) {
    const guidanceMap = {
        "requirement/prd": "Product Requirements Document: problem statement, user stories, acceptance criteria, functional and non-functional requirements",
        "design/architecture": "Architecture Document: system context, container diagram, component design, data model, technology decisions",
        "plan/story": "User Story: story statement, acceptance criteria, technical notes, dependencies, testing approach",
        "plan/epic": "Epic: epic statement, list of user stories, success criteria, timeline, risks and mitigations",
        "plan/task": "Task: task description, story reference, acceptance criteria, implementation steps, dependencies",
        "design/adr": "Architecture Decision Record: context, decision, consequences, alternatives considered, implementation notes",
    };
    return guidanceMap[artifactKind] || `Create a document for ${artifactKind} artifact`;
}
async function executeRunCheck(projectRoot, graph, engine, action, stepNumber, timeoutMs, dryRun, options) {
    const check = graph.checks.find((candidate) => candidate.id === action.id);
    if (!check) {
        await engine.updateCheck(action.id, {
            status: "failed",
            executed_at: new Date().toISOString(),
        });
        return {
            step: stepNumber,
            action: action.type,
            id: action.id,
            status: "failed",
            message: `Check is required by gate but not declared in graph: ${action.id}`,
        };
    }
    // Skip periodic checks unless --include-periodic is set
    if (check.tier === "periodic" && !options.includePeriodic) {
        return {
            step: stepNumber,
            action: action.type,
            id: action.id,
            status: "completed",
            message: `Check '${action.id}' skipped (tier=periodic, use --include-periodic to run)`,
        };
    }
    // Apply touchfile-based diff selection
    if (!options.noDiffSelect && check.touchfiles && check.touchfiles.length > 0) {
        const changedFiles = (0, diff_select_1.getChangedFiles)(projectRoot, options.baseRef || "HEAD");
        if (!(0, diff_select_1.shouldRunCheck)(check.touchfiles, changedFiles)) {
            return {
                step: stepNumber,
                action: action.type,
                id: action.id,
                status: "completed",
                message: `Check '${action.id}' skipped (no touchfile match in ${changedFiles.length} changed file(s))`,
            };
        }
    }
    const state = await engine.getState();
    // Retry loop for failed checks
    const maxRetries = parsePositiveInt(options.retries, 0);
    const backoffStrategy = options.backoff || "fixed";
    let attempt = 0;
    let result;
    while (true) {
        result = await (0, index_2.runCheck)(check, {
            cwd: projectRoot,
            timeoutMs,
            dryRun: dryRun ||
                (isPlaceholderCommand(check.command) && !(0, builtin_1.isBuiltinCheck)(check.command)),
            graph,
            state,
        });
        if (result.status === "passed" || attempt >= maxRetries) {
            break;
        }
        // Calculate backoff delay
        const delay = calculateBackoff(backoffStrategy, attempt + 1);
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        attempt++;
    }
    await engine.updateCheck(check.id, {
        status: result.status,
        result: {
            command: result.command,
            exit_code: result.exit_code,
            duration_ms: result.duration_ms,
            stdout: result.stdout.slice(-4000),
            stderr: result.stderr.slice(-4000),
        },
        executed_at: result.finished_at,
    });
    const retryInfo = attempt > 0 ? ` (after ${attempt} retry(ies))` : "";
    return {
        step: stepNumber,
        action: action.type,
        id: action.id,
        status: result.status === "passed" ? "completed" : "failed",
        message: `Check ${action.id} ${result.status}${retryInfo}.`,
    };
}
function calculateBackoff(strategy, attempt) {
    const baseDelay = 1000; // 1 second base
    switch (strategy) {
        case "linear":
            return baseDelay * attempt;
        case "exponential":
            return baseDelay * Math.pow(2, attempt - 1);
        case "fixed":
        default:
            return baseDelay;
    }
}
async function executeTransition(engine, action, stepNumber) {
    const fromStage = action.id.split("→")[0];
    const toStage = action.id.split("→")[1];
    if (!fromStage || !toStage) {
        return {
            step: stepNumber,
            action: action.type,
            id: action.id,
            status: "failed",
            message: `Cannot parse transition action id: ${action.id}`,
        };
    }
    const result = await engine.transition({
        from_stage: fromStage,
        to_stage: toStage,
        triggered_by: "spec-graph run",
    });
    return {
        step: stepNumber,
        action: action.type,
        id: action.id,
        status: result.success ? "completed" : "failed",
        message: result.success
            ? `Transitioned ${action.id}.`
            : result.error || `Transition failed: ${action.id}`,
    };
}
/**
 * verify_trace actions are suggested when a gate's require_traces isn't satisfied.
 *
 * This is fundamentally different from run_check/transition: there's no command
 * to execute. The trace either exists (in which case the gate already passes
 * and this action wouldn't be suggested) or it's missing (in which case it
 * needs to be CREATED, not verified).
 *
 * Trace creation happens via:
 * - `spec-graph trace add` (manual)
 * - Artifact completion auto-wiring (when an artifact is completed, traces
 *   referencing it are auto-created)
 *
 * So `run` re-evaluates the trace query — if it now passes (artifacts completed
 * since the last dispatch), this is a no-op success. If still missing, blocked.
 */
async function executeVerifyTrace(projectRoot, graph, action, stepNumber) {
    // Find the trace query that's missing
    const traceQuery = findTraceQueryByName(graph, action.id);
    if (!traceQuery) {
        return {
            step: stepNumber,
            action: action.type,
            id: action.id,
            status: "failed",
            message: `Trace query '${action.id}' not declared in any gate`,
        };
    }
    const traceIndex = await (0, index_4.buildTraceIndex)(projectRoot, graph);
    const evaluation = (0, index_4.evaluateTraceQuery)(traceIndex, traceQuery);
    if (evaluation.passed) {
        return {
            step: stepNumber,
            action: action.type,
            id: action.id,
            status: "completed",
            message: `Trace '${action.id}' satisfied (${evaluation.match_count} match(es)).`,
        };
    }
    return {
        step: stepNumber,
        action: action.type,
        id: action.id,
        status: "blocked",
        message: `Trace '${action.id}' still missing. Create via: spec-graph trace add --from ${traceQuery.from_kind} --to ${traceQuery.to_kind} --via ${traceQuery.via.join(",")}  (or complete dependent artifacts to auto-wire)`,
    };
}
function findTraceQueryByName(graph, name) {
    for (const gate of graph.gates || []) {
        for (const trace of gate.require_traces || []) {
            if (trace.name === name)
                return trace;
        }
    }
    return undefined;
}
function renderRunResult(result) {
    console.log(chalk_1.default.bold("\nRun Result\n"));
    const table = new cli_table3_1.default({
        head: ["#", "Action", "ID", "Status", "Message"],
        style: { head: ["cyan"] },
        wordWrap: true,
    });
    for (const step of result.steps) {
        table.push([
            step.step,
            step.action,
            step.id,
            colorStatus(step.status),
            step.message,
        ]);
    }
    console.log(table.toString());
    if (result.completed) {
        console.log(chalk_1.default.green("\nWorkflow is complete.\n"));
        return;
    }
    if (result.failed) {
        console.log(chalk_1.default.red("\nRun failed. Inspect the failed step above.\n"));
        return;
    }
    if (result.blocked) {
        // Find the last blocked step with dispatch instructions
        const blockedStep = result.steps
            .slice()
            .reverse()
            .find((s) => s.status === "blocked" && s.dispatch_instructions);
        if (blockedStep?.dispatch_instructions) {
            const di = blockedStep.dispatch_instructions;
            console.log(chalk_1.default.yellow("\nRun is blocked — sub-agent dispatch required.\n"));
            console.log(chalk_1.default.bold("Dispatch Instructions:"));
            if (di.agent_id) {
                console.log(`  Agent:          ${di.agent_id} (${di.model_tier || "standard"})`);
            }
            if (di.agent_prompt_ref) {
                console.log(`  System prompt:  ${di.agent_prompt_ref}`);
            }
            if (di.template_ref) {
                console.log(`  Template:       ${di.template_ref}`);
            }
            if (di.suggested_doc_path) {
                console.log(`  Doc path:       ${di.suggested_doc_path}`);
            }
            if (di.document_guidance) {
                console.log(`  Guidance:       ${di.document_guidance}`);
            }
            if (di.input_artifacts.length > 0) {
                console.log(`  Input artifacts:`);
                for (const a of di.input_artifacts) {
                    console.log(`    - ${a.id} (${a.kind}) → ${a.path}`);
                }
            }
            console.log(chalk_1.default.bold("\nNext step (after sub-agent completes):"));
            console.log(chalk_1.default.gray(`  ${di.next_step}`));
            console.log("");
            console.log(chalk_1.default.gray("Coordinator: dispatch sub-agent via Agent tool, then re-run the next step."));
            console.log("");
        }
        else {
            const action = result.next_plan.suggested_actions[0];
            console.log(chalk_1.default.yellow("\nRun is blocked on manual or agent work.\n"));
            if (action) {
                console.log(`Next action: ${action.description}`);
                console.log(`Suggested dispatch: spec-graph dispatch${result.next_plan.suggested_actions.length > 1 ? " --all" : ""}`);
            }
            console.log("");
        }
    }
}
function parsePositiveInt(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
function isPlaceholderCommand(command) {
    return /^<[^>]+>$/.test(command.trim());
}
function colorStatus(status) {
    if (status === "completed" || status === "done")
        return chalk_1.default.green(status);
    if (status === "failed")
        return chalk_1.default.red(status);
    return chalk_1.default.yellow(status);
}
//# sourceMappingURL=run.js.map