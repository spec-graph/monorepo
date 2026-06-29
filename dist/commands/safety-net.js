"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safetyNetCommand = safetyNetCommand;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const chalk_1 = __importDefault(require("chalk"));
const yaml_1 = require("../utils/yaml");
const index_1 = require("../engine/safety-net/index");
const SNAPSHOT_PATH = ".spec-graph/safety-net-snapshot.yaml";
async function safetyNetCommand(projectRoot, options) {
    const snapshotPath = node_path_1.default.join(projectRoot, SNAPSHOT_PATH);
    try {
        if (options.compare) {
            // Compare against existing snapshot
            const previous = await (0, yaml_1.readYaml)(snapshotPath);
            if (!previous) {
                console.log(chalk_1.default.yellow("⚠ No baseline snapshot found. Run `spec-graph safety-net` first to capture a baseline."));
                process.exit(1);
                return;
            }
            console.log(chalk_1.default.gray("Comparing against baseline snapshot..."));
            console.log("");
            const result = await (0, index_1.compareSnapshot)(projectRoot, previous);
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }
            console.log((0, index_1.formatSafetyNetResult)(result));
            if (result.changes.removed_exports.length > 0) {
                console.log(chalk_1.default.red(`\n❌ ${result.changes.removed_exports.length} export(s) removed — potential breaking change!`));
                process.exit(1);
            }
        }
        else {
            // Capture baseline snapshot
            console.log(chalk_1.default.gray("Capturing baseline snapshot..."));
            console.log("");
            const snapshot = await (0, index_1.captureSnapshot)(projectRoot);
            await promises_1.default.mkdir(node_path_1.default.dirname(snapshotPath), { recursive: true });
            await (0, yaml_1.writeYaml)(snapshotPath, snapshot);
            if (options.json) {
                console.log(JSON.stringify(snapshot, null, 2));
                return;
            }
            console.log(chalk_1.default.green("✓ Baseline snapshot captured"));
            console.log(chalk_1.default.gray(`  Snapshot: ${SNAPSHOT_PATH}`));
            console.log(chalk_1.default.gray(`  Exports: ${Object.keys(snapshot.exports).length} files`));
            console.log(chalk_1.default.gray(`  Functions: ${snapshot.function_signatures.length}`));
            if (snapshot.test_results) {
                console.log(chalk_1.default.gray(`  Tests: ${snapshot.test_results.passed}/${snapshot.test_results.total} passed`));
            }
            console.log(chalk_1.default.gray(`\n  After refactoring, run: spec-graph safety-net --compare`));
        }
    }
    catch (e) {
        console.error(chalk_1.default.red("Error:"), e.message);
        if (e.stack)
            console.log(e.stack);
        process.exit(1);
    }
}
//# sourceMappingURL=safety-net.js.map