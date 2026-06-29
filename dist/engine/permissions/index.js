"use strict";
/**
 * Permission Engine — Controls what the spec-graph CLI and AI agents can auto-execute.
 *
 * Two-level permission model:
 *   Project-level — what `spec-graph run` can auto-execute (global automation level)
 *   Sub-agent-level — per-role tool + file permissions for AI agents (Claude Code/Codex)
 *
 * Permission levels:
 *   full-auto  — `run` ATTEMPTS all action types. Truly deterministic ones
 *                (run_check, transition) execute directly. LLM-requiring ones
 *                (produce_artifact, perform_stage, resolve_violation) yield
 *                'blocked' with a clear "dispatch required" message rather than
 *                crashing. verify_trace re-evaluates the trace query — if now
 *                satisfied (artifacts completed since last check), it succeeds;
 *                otherwise blocked with a 'create via spec-graph trace add' hint.
 *   semi-auto  — `run` auto-executes only run_check + transition (default)
 *   manual     — `run` auto-executes nothing; everything requires agent dispatch
 *   custom     — user-defined allow.auto_execute list
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESETS = exports.DEFAULT_ROLES = void 0;
exports.getPermissionsPath = getPermissionsPath;
exports.loadPermissions = loadPermissions;
exports.savePermissions = savePermissions;
exports.getPreset = getPreset;
exports.isActionAllowed = isActionAllowed;
exports.getAgentConfig = getAgentConfig;
exports.getRoleConfig = getRoleConfig;
exports.roleForAction = roleForAction;
exports.resolveFileScope = resolveFileScope;
exports.generateClaudeCodeSettings = generateClaudeCodeSettings;
exports.generateOpenCodeSettings = generateOpenCodeSettings;
exports.writeAgentConfigs = writeAgentConfigs;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const yaml_1 = require("../../utils/yaml");
// ── Role definitions ──────────────────────────────────────────────
const ROLE_SPEC_AUTHOR = {
    description: "Produces spec artifacts (PRD, stories, architecture docs, etc.)",
    tools: ["Read", "Write", "Edit", "Glob", "Grep"],
    file_scope: {
        read: [".spec-graph/**", "_wdf_output/**", "*.md", "*.yaml"],
        write: [".spec-graph/**", "_wdf_output/**", "*.md"],
    },
    actions: ["produce_artifact"],
};
const ROLE_QUALITY_RUNNER = {
    description: "Runs lint, test, and quality checks declared in the graph",
    tools: ["Read", "Bash", "Glob", "Grep"],
    file_scope: {
        read: ["src/**", "*.json", "*.yaml", "*.toml", ".spec-graph/**"],
        write: [".spec-graph/**"],
    },
    actions: ["run_check"],
};
const ROLE_TRACEABILITY_REVIEWER = {
    description: "Verifies traceability links between artifacts and requirements",
    tools: ["Read", "Edit", "Glob", "Grep"],
    file_scope: {
        read: [".spec-graph/**", "*.md", "*.yaml"],
        write: [".spec-graph/traces/**"],
    },
    actions: ["verify_trace"],
};
const ROLE_GOVERNANCE_REVIEWER = {
    description: "Resolves forbidden invariant violations and constitutional issues",
    tools: ["Read", "Edit", "Write", "Glob", "Grep"],
    file_scope: {
        read: [".spec-graph/**", "*.md", "*.yaml", "*.json"],
        write: [".spec-graph/**", "*.md", "*.yaml"],
    },
    actions: ["resolve_violation"],
};
const ROLE_WORKFLOW_OPERATOR = {
    description: "Advances the workflow state machine through gated transitions",
    tools: ["Read", "Bash"],
    file_scope: {
        read: [".spec-graph/**"],
        write: [".spec-graph/machine-state.yaml"],
    },
    actions: ["transition"],
};
const ROLE_STAGE_AGENT = {
    description: "Performs full stage work — produces artifacts, runs checks, verifies traces",
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    file_scope: {
        read: [
            "src/**",
            ".spec-graph/**",
            "_wdf_output/**",
            "*.md",
            "*.yaml",
            "*.json",
            "*.toml",
        ],
        write: ["src/**", ".spec-graph/**", "_wdf_output/**", "*.md", "*.yaml"],
    },
    actions: ["perform_stage", "produce_artifact", "run_check", "verify_trace"],
};
exports.DEFAULT_ROLES = {
    "spec-author": ROLE_SPEC_AUTHOR,
    "quality-runner": ROLE_QUALITY_RUNNER,
    "traceability-reviewer": ROLE_TRACEABILITY_REVIEWER,
    "governance-reviewer": ROLE_GOVERNANCE_REVIEWER,
    "workflow-operator": ROLE_WORKFLOW_OPERATOR,
    "stage-agent": ROLE_STAGE_AGENT,
};
// ── Agent defaults ────────────────────────────────────────────────
const AGENT_CLAUDE_CODE = {
    enabled: true,
    auto_approve_tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    note: "Default Claude Code permissions — adjust based on project trust level",
};
const AGENT_CODEX = {
    enabled: true,
    auto_approve_tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    note: "Default OpenCode/Codex CLI permissions",
};
// ── Presets ───────────────────────────────────────────────────────
const BASE_CONFIG = {
    version: "1",
    file_scope: {
        read: ["src/**", "*.md", "*.yaml", "*.json", "*.toml", ".spec-graph/**"],
        write: ["src/**", ".spec-graph/**"],
    },
    roles: exports.DEFAULT_ROLES,
    agents: {
        "claude-code": AGENT_CLAUDE_CODE,
        codex: AGENT_CODEX,
    },
};
const DEFAULT_SEMI_AUTO = {
    ...BASE_CONFIG,
    level: "semi-auto",
    allow: {
        auto_execute: ["run_check", "transition"],
        agent_actions: [
            "produce_artifact",
            "run_check",
            "verify_trace",
            "resolve_violation",
            "perform_stage",
            "transition",
        ],
    },
};
const PRESETS = {
    "full-auto": {
        ...BASE_CONFIG,
        level: "full-auto",
        allow: {
            auto_execute: [
                "produce_artifact",
                "run_check",
                "verify_trace",
                "resolve_violation",
                "transition",
            ],
            agent_actions: [
                "produce_artifact",
                "run_check",
                "verify_trace",
                "resolve_violation",
                "perform_stage",
                "transition",
            ],
        },
    },
    "semi-auto": DEFAULT_SEMI_AUTO,
    manual: {
        ...BASE_CONFIG,
        level: "manual",
        allow: {
            auto_execute: [],
            agent_actions: [
                "produce_artifact",
                "run_check",
                "verify_trace",
                "resolve_violation",
                "perform_stage",
                "transition",
            ],
        },
        agents: {
            "claude-code": {
                ...AGENT_CLAUDE_CODE,
                auto_approve_tools: ["Read", "Glob", "Grep"],
                note: "Manual mode — agents may only read; all writes and commands require user approval",
            },
            codex: {
                ...AGENT_CODEX,
                auto_approve_tools: ["Read", "Glob", "Grep"],
                note: "Manual mode — agents may only read; all writes and commands require user approval",
            },
        },
    },
};
exports.PRESETS = PRESETS;
// ── Public API ────────────────────────────────────────────────────
function getPermissionsPath(projectRoot) {
    return node_path_1.default.join(projectRoot, ".spec-graph", "permissions.yaml");
}
async function loadPermissions(projectRoot) {
    const permissionsPath = getPermissionsPath(projectRoot);
    try {
        await promises_1.default.access(permissionsPath);
        const config = await (0, yaml_1.readYaml)(permissionsPath);
        return config;
    }
    catch {
        return DEFAULT_SEMI_AUTO;
    }
}
async function savePermissions(projectRoot, config) {
    const permissionsPath = getPermissionsPath(projectRoot);
    await (0, yaml_1.writeYaml)(permissionsPath, config);
}
function getPreset(level) {
    return JSON.parse(JSON.stringify(PRESETS[level]));
}
function isActionAllowed(actionType, config) {
    return config.allow.auto_execute.includes(actionType);
}
function getAgentConfig(agentName, config) {
    return config.agents[agentName];
}
function getRoleConfig(role, config) {
    return config.roles[role] || exports.DEFAULT_ROLES[role];
}
/** Map an action type to the agent role best suited to handle it */
function roleForAction(actionType) {
    switch (actionType) {
        case "produce_artifact":
            return "spec-author";
        case "run_check":
            return "quality-runner";
        case "verify_trace":
            return "traceability-reviewer";
        case "resolve_violation":
            return "governance-reviewer";
        case "transition":
            return "workflow-operator";
        case "perform_stage":
            return "stage-agent";
    }
}
/** Resolve effective file scope for a role: role scope overrides, project scope as fallback */
function resolveFileScope(role, config) {
    const roleConfig = getRoleConfig(role, config);
    return {
        read: roleConfig.file_scope.read.length > 0
            ? roleConfig.file_scope.read
            : config.file_scope.read,
        write: roleConfig.file_scope.write.length > 0
            ? roleConfig.file_scope.write
            : config.file_scope.write,
    };
}
// ── Agent Config Generators ────────────────────────────────────────
/**
 * Generate a Claude Code `.claude/settings.json` permissions section
 * from the spec-graph permission config.
 */
function generateClaudeCodeSettings(config) {
    const agent = config.agents["claude-code"];
    if (!agent?.enabled)
        return {};
    const tools = new Set(agent.auto_approve_tools);
    const allow = [];
    const ask = [];
    const deny = [
        // Never allow writes outside the project
        "Write(//*)",
        "Edit(//*)",
        "Write(~/*)",
        "Edit(~/*)",
        // Dangerous commands
        "Bash(rm -rf *)",
        "Bash(sudo *)",
        "Bash(chmod *)",
        // Sensitive files
        "Read(.env)",
        "Read(**/*.pem)",
        "Read(**/*-key)",
        "Read(**/credentials*)",
        "Read(**/secrets*)",
    ];
    // Read — always auto-approved if in tools
    if (tools.has("Read")) {
        allow.push("Read(*)");
    }
    // Write — explicitly project-relative (/path = project root)
    if (tools.has("Write")) {
        for (const pattern of config.file_scope.write) {
            allow.push(`Write(/${pattern})`);
        }
    }
    else {
        ask.push("Write(/*)");
    }
    // Edit — project-scoped
    if (tools.has("Edit")) {
        for (const pattern of config.file_scope.write) {
            allow.push(`Edit(/${pattern})`);
        }
    }
    else {
        ask.push("Edit(/*)");
    }
    // Glob / Grep — always auto
    if (tools.has("Glob"))
        allow.push("Glob(*)");
    if (tools.has("Grep"))
        allow.push("Grep(*)");
    // Bash — scoped to safe commands in semi-auto, all in full-auto
    if (tools.has("Bash")) {
        if (config.level === "full-auto") {
            allow.push("Bash(*)");
        }
        else {
            // semi-auto: safe commands auto, destructive ask
            allow.push("Bash(npm *)", "Bash(npx *)", "Bash(node *)");
            allow.push("Bash(ls *)", "Bash(cat *)", "Bash(find *)", "Bash(grep *)");
            allow.push("Bash(git status*)", "Bash(git diff*)", "Bash(git log*)", "Bash(git branch*)");
            allow.push("Bash(echo *)", "Bash(mkdir *)", "Bash(cd *)");
            allow.push("Bash(curl *)", "Bash(which *)", "Bash(wc *)");
            ask.push("Bash(git commit*)", "Bash(git push*)", "Bash(git rebase*)", "Bash(git merge*)");
            ask.push("Bash(rm *)", "Bash(mv *)", "Bash(cp *)", "Bash(chmod *)");
            ask.push("Bash(docker *)", "Bash(gh *)");
        }
    }
    const settings = {
        permissions: { allow, deny },
    };
    if (ask.length > 0) {
        settings.permissions.ask = ask;
    }
    // Permission mode hint
    if (config.level === "full-auto") {
        settings.defaultMode = "acceptEdits";
    }
    else if (config.level === "manual") {
        settings.defaultMode = "default";
    }
    return settings;
}
/**
 * Generate an OpenCode `.opencode.json` config from spec-graph permissions.
 */
function generateOpenCodeSettings(config) {
    const agent = config.agents["codex"];
    if (!agent?.enabled)
        return {};
    const tools = new Set(agent.auto_approve_tools);
    // Build bash permission map
    const bashPerms = {};
    if (tools.has("Bash")) {
        if (config.level === "full-auto") {
            bashPerms["*"] = "allow";
        }
        else if (config.level === "semi-auto") {
            bashPerms["*"] = "ask";
            bashPerms["npm *"] = "allow";
            bashPerms["npx *"] = "allow";
            bashPerms["node *"] = "allow";
            bashPerms["ls *"] = "allow";
            bashPerms["cat *"] = "allow";
            bashPerms["find *"] = "allow";
            bashPerms["grep *"] = "allow";
            bashPerms["git status*"] = "allow";
            bashPerms["git diff*"] = "allow";
            bashPerms["git log*"] = "allow";
            bashPerms["git commit*"] = "ask";
            bashPerms["git push*"] = "ask";
            bashPerms["rm *"] = "ask";
            bashPerms["rm -rf*"] = "deny";
            bashPerms["sudo *"] = "deny";
        }
        else {
            bashPerms["*"] = "ask";
            bashPerms["rm -rf*"] = "deny";
            bashPerms["sudo *"] = "deny";
        }
    }
    else {
        bashPerms["*"] = "ask";
        bashPerms["rm -rf*"] = "deny";
        bashPerms["sudo *"] = "deny";
    }
    const editPerm = tools.has("Write") || tools.has("Edit") ? "allow" : "ask";
    return {
        permission: {
            edit: editPerm,
            bash: bashPerms,
            webfetch: "ask",
        },
    };
}
/**
 * Write agent config files to the project root if they don't already exist.
 * Returns which files were created.
 */
async function writeAgentConfigs(projectRoot, config, options = {}) {
    const created = [];
    const skipped = [];
    // Claude Code settings
    const claudeDir = node_path_1.default.join(projectRoot, ".claude");
    const claudeSettingsPath = node_path_1.default.join(claudeDir, "settings.json");
    try {
        await promises_1.default.access(claudeSettingsPath);
        if (options.force) {
            const ccSettings = generateClaudeCodeSettings(config);
            await promises_1.default.mkdir(claudeDir, { recursive: true });
            const existing = JSON.parse(await promises_1.default.readFile(claudeSettingsPath, "utf-8"));
            const merged = {
                ...existing,
                ...ccSettings,
                permissions: ccSettings.permissions,
            };
            await promises_1.default.writeFile(claudeSettingsPath, JSON.stringify(merged, null, 2) + "\n");
            created.push(".claude/settings.json [updated]");
        }
        else {
            skipped.push(".claude/settings.json (already exists, use --force to overwrite)");
        }
    }
    catch {
        // Doesn't exist — create it
        const ccSettings = generateClaudeCodeSettings(config);
        if (Object.keys(ccSettings).length > 0) {
            await promises_1.default.mkdir(claudeDir, { recursive: true });
            await promises_1.default.writeFile(claudeSettingsPath, JSON.stringify(ccSettings, null, 2) + "\n");
            created.push(".claude/settings.json");
        }
    }
    // OpenCode config
    const openCodePath = node_path_1.default.join(projectRoot, ".opencode.json");
    try {
        await promises_1.default.access(openCodePath);
        if (options.force) {
            const ocSettings = generateOpenCodeSettings(config);
            await promises_1.default.writeFile(openCodePath, JSON.stringify(ocSettings, null, 2) + "\n");
            created.push(".opencode.json [updated]");
        }
        else {
            skipped.push(".opencode.json (already exists, use --force to overwrite)");
        }
    }
    catch {
        const ocSettings = generateOpenCodeSettings(config);
        if (Object.keys(ocSettings).length > 0) {
            await promises_1.default.writeFile(openCodePath, JSON.stringify(ocSettings, null, 2) + "\n");
            created.push(".opencode.json");
        }
    }
    return { created, skipped };
}
//# sourceMappingURL=index.js.map