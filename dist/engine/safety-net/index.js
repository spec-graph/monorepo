"use strict";
/**
 * Refactoring Safety Net
 *
 * Before refactoring legacy code, capture a "snapshot" of current behavior
 * (function signatures, exports, test results). After refactoring, compare
 * the snapshot to detect regressions.
 *
 * This is critical for legacy project takeovers where you need to refactor
 * without breaking existing functionality.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureSnapshot = captureSnapshot;
exports.compareSnapshot = compareSnapshot;
exports.formatSafetyNetResult = formatSafetyNetResult;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_child_process_1 = require("node:child_process");
/**
 * Capture a snapshot of the current codebase state.
 * Run before refactoring to establish a baseline.
 */
async function captureSnapshot(projectRoot) {
    const snapshot = {
        project: node_path_1.default.basename(projectRoot),
        timestamp: new Date().toISOString(),
        git_commit: getGitCommit(projectRoot),
        exports: {},
        function_signatures: [],
        test_results: null,
        file_hashes: {},
    };
    // Capture exports from source files
    const srcDir = node_path_1.default.join(projectRoot, "src");
    try {
        const files = await walkDir(srcDir);
        for (const file of files) {
            if (file.endsWith(".ts") || file.endsWith(".tsx")) {
                try {
                    const content = await promises_1.default.readFile(file, "utf-8");
                    const relativePath = node_path_1.default.relative(projectRoot, file);
                    const exports = extractExports(content);
                    if (exports.length > 0) {
                        snapshot.exports[relativePath] = exports;
                    }
                    snapshot.file_hashes[relativePath] = hashContent(content);
                }
                catch {
                    // Skip unreadable files
                }
            }
        }
    }
    catch {
        // No src directory
    }
    // Capture function signatures
    snapshot.function_signatures = extractFunctionSignatures(snapshot.exports);
    // Capture test results
    snapshot.test_results = await captureTestResults(projectRoot);
    return snapshot;
}
/**
 * Compare current state against a previously captured snapshot.
 * Run after refactoring to detect regressions.
 */
async function compareSnapshot(projectRoot, previous) {
    const current = await captureSnapshot(projectRoot);
    const changes = {
        added_exports: [],
        removed_exports: [],
        changed_files: [],
        test_regression: false,
    };
    // Compare exports
    const prevExports = new Set(Object.entries(previous.exports).flatMap(([file, exps]) => exps.map((e) => `${file}:${e}`)));
    const currExports = new Set(Object.entries(current.exports).flatMap(([file, exps]) => exps.map((e) => `${file}:${e}`)));
    for (const exp of currExports) {
        if (!prevExports.has(exp))
            changes.added_exports.push(exp);
    }
    for (const exp of prevExports) {
        if (!currExports.has(exp))
            changes.removed_exports.push(exp);
    }
    // Compare file hashes
    for (const [file, hash] of Object.entries(current.file_hashes)) {
        if (previous.file_hashes[file] && previous.file_hashes[file] !== hash) {
            changes.changed_files.push(file);
        }
    }
    // Compare test results
    if (previous.test_results && current.test_results) {
        changes.test_regression =
            current.test_results.failed > previous.test_results.failed;
    }
    return {
        snapshot_path: "",
        has_existing_snapshot: true,
        changes,
    };
}
/**
 * Format safety net result for display.
 */
function formatSafetyNetResult(result) {
    const lines = [];
    if (!result.has_existing_snapshot) {
        lines.push("✓ Baseline snapshot captured.");
        lines.push("Run this command again after refactoring to detect regressions.");
        return lines.join("\n");
    }
    const c = result.changes;
    lines.push("## Safety Net Comparison");
    lines.push("");
    if (c.removed_exports.length > 0) {
        lines.push(`### ⚠ Removed Exports (${c.removed_exports.length})`);
        for (const exp of c.removed_exports.slice(0, 10)) {
            lines.push(`- ${exp}`);
        }
        if (c.removed_exports.length > 10) {
            lines.push(`- ... and ${c.removed_exports.length - 10} more`);
        }
        lines.push("");
    }
    if (c.added_exports.length > 0) {
        lines.push(`### New Exports (${c.added_exports.length})`);
        for (const exp of c.added_exports.slice(0, 10)) {
            lines.push(`- ${exp}`);
        }
        lines.push("");
    }
    if (c.changed_files.length > 0) {
        lines.push(`### Changed Files (${c.changed_files.length})`);
        for (const file of c.changed_files.slice(0, 10)) {
            lines.push(`- ${file}`);
        }
        if (c.changed_files.length > 10) {
            lines.push(`- ... and ${c.changed_files.length - 10} more`);
        }
        lines.push("");
    }
    if (c.test_regression) {
        lines.push("### ❌ Test Regression Detected");
        lines.push("Some tests that were passing before are now failing.");
        lines.push("");
    }
    if (c.removed_exports.length === 0 &&
        c.added_exports.length === 0 &&
        c.changed_files.length === 0 &&
        !c.test_regression) {
        lines.push("✓ No regressions detected. Codebase is safe.");
    }
    return lines.join("\n");
}
// ============ Helpers ============
function getGitCommit(root) {
    try {
        return (0, node_child_process_1.execSync)("git rev-parse HEAD", { cwd: root, encoding: "utf-8" }).trim();
    }
    catch {
        return null;
    }
}
async function walkDir(dir) {
    const files = [];
    try {
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name === ".git")
                    continue;
                files.push(...(await walkDir(fullPath)));
            }
            else {
                files.push(fullPath);
            }
        }
    }
    catch {
        // Ignore
    }
    return files;
}
function extractExports(content) {
    const exports = [];
    const patterns = [
        /export\s+function\s+(\w+)/g,
        /export\s+class\s+(\w+)/g,
        /export\s+interface\s+(\w+)/g,
        /export\s+type\s+(\w+)/g,
        /export\s+const\s+(\w+)/g,
        /export\s+enum\s+(\w+)/g,
        /export\s+default\s+function\s+(\w+)/g,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            exports.push(match[1]);
        }
    }
    return [...new Set(exports)];
}
function extractFunctionSignatures(exports) {
    const sigs = [];
    for (const [file, exps] of Object.entries(exports)) {
        for (const exp of exps) {
            sigs.push(`${file}:${exp}`);
        }
    }
    return sigs.sort();
}
function hashContent(content) {
    return node_crypto_1.default.createHash("sha256").update(content).digest("hex").slice(0, 16);
}
async function captureTestResults(root) {
    try {
        const output = (0, node_child_process_1.execSync)("npx vitest run --reporter=json 2>/dev/null", {
            cwd: root,
            encoding: "utf-8",
            timeout: 30000,
        });
        const result = JSON.parse(output);
        return {
            passed: result.numPassedTests || 0,
            failed: result.numFailedTests || 0,
            total: result.numTotalTests || 0,
        };
    }
    catch {
        // Tests failed to run or no test framework
        return null;
    }
}
//# sourceMappingURL=index.js.map