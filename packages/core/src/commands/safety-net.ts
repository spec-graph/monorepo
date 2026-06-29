import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { readYaml, writeYaml } from "../utils/yaml";
import {
  captureSnapshot,
  compareSnapshot,
  formatSafetyNetResult,
  SafetyNetSnapshot,
} from "../engine/safety-net/index";

export interface SafetyNetOptions {
  compare?: boolean;
  json?: boolean;
}

const SNAPSHOT_PATH = ".spec-graph/safety-net-snapshot.yaml";

export async function safetyNetCommand(
  projectRoot: string,
  options: SafetyNetOptions,
): Promise<void> {
  const snapshotPath = path.join(projectRoot, SNAPSHOT_PATH);

  try {
    if (options.compare) {
      // Compare against existing snapshot
      const previous = await readYaml<SafetyNetSnapshot>(snapshotPath);
      if (!previous) {
        console.log(
          chalk.yellow(
            "⚠ No baseline snapshot found. Run `spec-graph safety-net` first to capture a baseline.",
          ),
        );
        process.exit(1);
        return;
      }

      console.log(chalk.gray("Comparing against baseline snapshot..."));
      console.log("");

      const result = await compareSnapshot(projectRoot, previous);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(formatSafetyNetResult(result));

      if (result.changes.removed_exports.length > 0) {
        console.log(
          chalk.red(
            `\n❌ ${result.changes.removed_exports.length} export(s) removed — potential breaking change!`,
          ),
        );
        process.exit(1);
      }
    } else {
      // Capture baseline snapshot
      console.log(chalk.gray("Capturing baseline snapshot..."));
      console.log("");

      const snapshot = await captureSnapshot(projectRoot);

      await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
      await writeYaml(snapshotPath, snapshot);

      if (options.json) {
        console.log(JSON.stringify(snapshot, null, 2));
        return;
      }

      console.log(chalk.green("✓ Baseline snapshot captured"));
      console.log(chalk.gray(`  Snapshot: ${SNAPSHOT_PATH}`));
      console.log(chalk.gray(`  Exports: ${Object.keys(snapshot.exports).length} files`));
      console.log(chalk.gray(`  Functions: ${snapshot.function_signatures.length}`));
      if (snapshot.test_results) {
        console.log(
          chalk.gray(
            `  Tests: ${snapshot.test_results.passed}/${snapshot.test_results.total} passed`,
          ),
        );
      }
      console.log(
        chalk.gray(`\n  After refactoring, run: spec-graph safety-net --compare`),
      );
    }
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}
