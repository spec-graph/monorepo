"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEnforce = runEnforce;
exports.loadForbiddenInvariants = loadForbiddenInvariants;
exports.loadContractRegistry = loadContractRegistry;
exports.collectDriftedConsumers = collectDriftedConsumers;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const index_1 = require("../trace/index");
const yaml_1 = require("../../utils/yaml");
async function runEnforce(projectRoot, graph, options = {}) {
    const state = await loadMachineState(projectRoot, graph);
    const traceIndex = await (0, index_1.buildTraceIndex)(projectRoot, graph);
    const forbiddenInvariants = await loadForbiddenInvariants(projectRoot);
    const contractEntries = await loadContractRegistry(projectRoot);
    const evaluatedGates = [];
    const blockingGates = [];
    for (const gate of graph.gates) {
        if (!gate.enabled)
            continue;
        if (options.phase && gate.id !== options.phase)
            continue;
        const result = evaluateGate(gate, state, traceIndex, forbiddenInvariants, contractEntries);
        evaluatedGates.push(result);
        if (!result.passed && gate.fail_mode === "block") {
            blockingGates.push(gate.id);
        }
    }
    return {
        evaluated_gates: evaluatedGates,
        blocking_gates: blockingGates,
        all_passed: blockingGates.length === 0,
    };
}
async function loadMachineState(projectRoot, graph) {
    const statePath = node_path_1.default.join(projectRoot, ".spec-graph", "machine-state.yaml");
    try {
        return await (0, yaml_1.readYaml)(statePath);
    }
    catch {
        return {
            current_stage: graph.pipeline_skeleton.stages[0] || "start",
            stage_history: [],
            artifacts: {},
            checks: {},
            metadata: {},
        };
    }
}
async function loadForbiddenInvariants(projectRoot) {
    const invariantsFile = node_path_1.default.join(projectRoot, ".spec-graph", "invariants.json");
    try {
        const content = await promises_1.default.readFile(invariantsFile, "utf-8");
        const invariantsData = JSON.parse(content);
        return new Set(invariantsData.violations || []);
    }
    catch {
        return new Set();
    }
}
async function loadContractRegistry(projectRoot) {
    const dir = node_path_1.default.join(projectRoot, ".spec-graph", "contracts");
    let entries = [];
    try {
        entries = await promises_1.default.readdir(dir);
    }
    catch {
        return [];
    }
    const out = [];
    for (const f of entries) {
        if (!f.endsWith(".yaml") && !f.endsWith(".yml"))
            continue;
        const entry = await (0, yaml_1.tryReadYaml)(node_path_1.default.join(dir, f));
        if (entry)
            out.push(entry);
    }
    return out;
}
// Recompute drift against the live registry: a consumer is stale when its
// bound version differs from the producer's current_version. Mirrors the
// logic in commands/contract.ts so gate evaluation stays consistent without
// a hard dep on the command layer.
function collectDriftedConsumers(entries) {
    const drifted = [];
    for (const e of entries) {
        for (const c of e.consumers || []) {
            if (c.status === "broken") {
                drifted.push({
                    contract: e.contract_id,
                    consumer: c.consumer,
                    status: "broken",
                    bound: c.bound_version,
                    current: e.current_version,
                });
            }
            else if (c.bound_version !== e.current_version) {
                drifted.push({
                    contract: e.contract_id,
                    consumer: c.consumer,
                    status: "stale",
                    bound: c.bound_version,
                    current: e.current_version,
                });
            }
        }
    }
    return drifted;
}
function evaluateGate(gate, state, traceIndex, forbiddenInvariants, contractEntries) {
    const missingArtifacts = [];
    const missingChecks = [];
    const missingTraces = [];
    const missingContracts = [];
    const violatedForbids = [];
    const warnings = [];
    for (const artifactId of gate.require_artifacts) {
        if (state.artifacts[artifactId]?.status !== "completed") {
            missingArtifacts.push(artifactId);
        }
    }
    for (const checkId of gate.require_checks) {
        if (state.checks[checkId]?.status !== "passed") {
            missingChecks.push(checkId);
        }
    }
    for (const trace of gate.require_traces) {
        const evaluation = (0, index_1.evaluateTraceQuery)(traceIndex, trace);
        if (!evaluation.passed) {
            missingTraces.push(trace.name);
            if (evaluation.missing_reason) {
                warnings.push(`${trace.name}: ${evaluation.missing_reason}`);
            }
        }
    }
    if (gate.require_contracts_current) {
        const drifted = collectDriftedConsumers(contractEntries);
        for (const d of drifted) {
            missingContracts.push(`${d.contract} (${d.consumer} ${d.status}: bound ${d.bound} ≠ current ${d.current})`);
        }
        if (drifted.length > 0) {
            warnings.push(`${drifted.length} consumer(s) on stale/broken contract versions — see missing_contracts`);
        }
    }
    for (const forbid of gate.forbid) {
        if (forbiddenInvariants.has(forbid)) {
            violatedForbids.push(forbid);
        }
    }
    return {
        gate_id: gate.id,
        passed: missingArtifacts.length === 0 &&
            missingChecks.length === 0 &&
            missingTraces.length === 0 &&
            missingContracts.length === 0 &&
            violatedForbids.length === 0,
        missing_artifacts: missingArtifacts,
        missing_checks: missingChecks,
        missing_traces: missingTraces,
        missing_contracts: missingContracts,
        violated_forbids: violatedForbids,
        warnings,
    };
}
//# sourceMappingURL=index.js.map