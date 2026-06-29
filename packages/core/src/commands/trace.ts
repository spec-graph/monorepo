import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import {
  buildTraceIndex,
  traceBackward,
  traceForward,
  listTraceNodes,
} from "../engine/trace/index";
import { Profile, TraceQuery } from "../types/index";
import { readYaml, writeYaml } from "../utils/yaml";

export interface TraceOptions {
  direction?: "forward" | "backward";
  nodeType?: string;
  // Subcommand: add
  from?: string;
  to?: string;
  via?: string;
  relation?: string;
  json?: boolean;
}

const SUBCOMMANDS = ["add", "list", "show"] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(arg: string | undefined): arg is Subcommand {
  return !!arg && (SUBCOMMANDS as readonly string[]).includes(arg);
}

export async function traceCommand(
  projectRoot: string,
  arg: string | undefined,
  options: TraceOptions,
): Promise<void> {
  try {
    // Route to subcommands. If `arg` is a known subcommand, dispatch.
    // Otherwise treat `arg` as a node-id for the legacy trace view.
    if (isSubcommand(arg)) {
      if (arg === "add") {
        await traceAddCommand(projectRoot, options);
        return;
      }
      // 'list' and 'show' fall through to legacy view (with arg cleared)
      arg = undefined;
    }

    await traceViewCommand(projectRoot, arg, options);
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exitCode = 1;
  }
}

/**
 * `spec-graph trace add --from <artifact-id> --to <artifact-id> --via <relation>`
 *
 * Creates a trace entry in .spec-graph/traces/. The trace file is named after
 * the gate's require_traces query that this trace satisfies (looked up by
 * matching from_kind/to_kind/via against graph gates). If no matching query
 * is found, a fallback file is created based on the from artifact id.
 *
 * This command is referenced by:
 * - verify_trace actions in dispatch.ts (manifest hint)
 * - run.ts (blocked message)
 * - coordinator-protocol.md
 *
 * After trace add, the coordinator re-runs `spec-graph dispatch` to re-evaluate
 * the gate.
 */
async function traceAddCommand(
  projectRoot: string,
  options: TraceOptions,
): Promise<void> {
  if (!options.from || !options.to) {
    console.log(chalk.red("✗ --from and --to are required."));
    console.log(
      chalk.gray(
        "Usage: spec-graph trace add --from <artifact-id> --to <artifact-id> [--via <relation>] [--relation <name>] [--json]",
      ),
    );
    process.exitCode = 1;
    return;
  }

  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");

  let graph: any;
  try {
    graph = await readYaml(graphPath);
  } catch {
    console.log(
      chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
    );
    process.exitCode = 1;
    return;
  }

  // Look up artifact declarations to get kinds (used for trace queries)
  const fromArt = (graph.artifacts || []).find(
    (a: any) => a.id === options.from,
  );
  const toArt = (graph.artifacts || []).find((a: any) => a.id === options.to);

  if (!fromArt) {
    console.log(
      chalk.red(`✗ --from artifact not found in graph: ${options.from}`),
    );
    console.log(
      chalk.gray(
        "Available artifacts: " +
          (graph.artifacts || []).map((a: any) => a.id).join(", "),
      ),
    );
    process.exitCode = 1;
    return;
  }
  if (!toArt) {
    console.log(chalk.red(`✗ --to artifact not found in graph: ${options.to}`));
    console.log(
      chalk.gray(
        "Available artifacts: " +
          (graph.artifacts || []).map((a: any) => a.id).join(", "),
      ),
    );
    process.exitCode = 1;
    return;
  }

  // Determine the relation — explicit --relation takes precedence, else --via
  const relation = options.relation || options.via || "satisfies";

  // Find the gate trace query that matches this from/to pair
  const matchingQuery = findMatchingTraceQuery(
    graph,
    fromArt.kind,
    toArt.kind,
    relation,
  );
  const traceName = matchingQuery?.name || `${fromArt.kind}-to-${toArt.kind}`;
  const traceFile = path.join(
    specGraphDir,
    "traces",
    `${kebabToSnake(traceName)}.yaml`,
  );

  // Load or create the trace file
  let traceData: any;
  try {
    traceData = await readYaml<any>(traceFile);
    if (!traceData.traces || !Array.isArray(traceData.traces)) {
      traceData = { traces: [] };
    }
  } catch {
    traceData = { traces: [] };
  }

  // Check for duplicate entry
  const exists = traceData.traces.some(
    (t: any) =>
      t.from === options.from && t.to === options.to && t.relation === relation,
  );
  if (exists) {
    if (options.json) {
      console.log(
        JSON.stringify(
          { added: false, reason: "duplicate", trace_file: traceFile },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      chalk.yellow(
        `↳ Trace entry already exists: ${options.from} → ${options.to} (${relation})`,
      ),
    );
    console.log(chalk.gray(`  File: ${traceFile}`));
    return;
  }

  // Add the entry
  traceData.traces.push({
    from: options.from,
    from_kind: fromArt.kind,
    to: options.to,
    to_kind: toArt.kind,
    relation,
  });

  await fs.mkdir(path.dirname(traceFile), { recursive: true });
  await writeYaml(traceFile, traceData);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          added: true,
          trace_file: traceFile,
          trace_name: traceName,
          from: options.from,
          to: options.to,
          relation,
          matching_gate_query: matchingQuery?.name || null,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    chalk.green(
      `✓ Trace entry added: ${options.from} → ${options.to} (${relation})`,
    ),
  );
  console.log(chalk.gray(`  File: ${traceFile}`));
  if (matchingQuery) {
    console.log(chalk.gray(`  Satisfies gate query: ${matchingQuery.name}`));
  }
  console.log(chalk.gray(`  Re-run: spec-graph dispatch --json`));
}

function findMatchingTraceQuery(
  graph: any,
  fromKind: string,
  toKind: string,
  relation: string,
): TraceQuery | undefined {
  for (const gate of graph.gates || []) {
    for (const trace of gate.require_traces || []) {
      if (trace.from_kind === fromKind && trace.to_kind === toKind) {
        // Match if relation is in the via list, or via is unspecified
        if (
          !trace.via ||
          trace.via.length === 0 ||
          trace.via.includes(relation)
        ) {
          return trace;
        }
      }
    }
  }
  return undefined;
}

async function traceViewCommand(
  projectRoot: string,
  nodeId: string | undefined,
  options: TraceOptions,
): Promise<void> {
  const specGraphDir = path.join(projectRoot, ".spec-graph");
  const graphPath = path.join(specGraphDir, "graph.yaml");
  const profilePath = path.join(specGraphDir, "profile.yaml");

  // Load graph
  let graph: any;
  try {
    graph = await readYaml(graphPath);
  } catch {
    console.log(
      chalk.red("✗ Graph not found. Run `spec-graph compose` first."),
    );
    process.exitCode = 1;
    return;
  }

  // Load profile
  let profile: Profile;
  try {
    profile = await readYaml<Profile>(profilePath);
  } catch {
    console.log(chalk.red("✗ Profile not found. Run `spec-graph init` first."));
    process.exitCode = 1;
    return;
  }

  // Build trace index
  const index = await buildTraceIndex(projectRoot, graph);

  // If no nodeId provided, list all nodes
  if (!nodeId) {
    console.log(chalk.bold("\n📊 Traceable Nodes\n"));

    const nodes = listTraceNodes(index);
    if (nodes.length === 0) {
      console.log(chalk.yellow("No traceable nodes found."));
      console.log(
        "Add artifacts to your packs or create trace files in .spec-graph/traces/\n",
      );
      return;
    }

    const table = new Table({
      head: ["ID", "Type", "Metadata"],
      style: { head: ["cyan"] },
    });

    for (const node of nodes) {
      const metadataStr = Object.entries(node.metadata)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      table.push([node.id, node.type, metadataStr || "-"]);
    }

    console.log(table.toString());
    console.log("");
    console.log(
      chalk.gray(
        "Usage: spec-graph trace <node-id> [--direction=forward|backward]",
      ),
    );
    console.log(
      chalk.gray(
        "       spec-graph trace add --from <artifact-id> --to <artifact-id> [--via <relation>]",
      ),
    );
    console.log("");
    return;
  }

  // Perform trace
  const direction = options.direction || "backward";
  const result =
    direction === "backward"
      ? traceBackward(index, nodeId)
      : traceForward(index, nodeId);

  if (!result.found) {
    console.log(chalk.yellow(`\n✗ Node not found: ${nodeId}`));
    console.log("Run `spec-graph trace` to see available nodes.\n");
    process.exitCode = 1;
    return;
  }

  // Display trace path
  console.log(chalk.bold(`\n🔍 Trace ${direction} from ${nodeId}\n`));

  if (result.path.length === 0) {
    console.log(chalk.gray("No trace path found.\n"));
    return;
  }

  // Display as a chain
  for (let i = 0; i < result.path.length; i++) {
    const node = result.path[i];
    const isLast = i === result.path.length - 1;

    const typeColor =
      node.node_type === "requirement"
        ? chalk.blue
        : node.node_type === "artifact"
          ? chalk.green
          : node.node_type === "check"
            ? chalk.yellow
            : node.node_type === "gate"
              ? chalk.magenta
              : chalk.cyan;

    console.log(
      `${typeColor(`[${node.node_type}]`)} ${chalk.bold(node.node_id)}`,
    );

    // Show metadata
    const metadataEntries = Object.entries(node.metadata).filter(
      ([_, v]) => v !== undefined && v !== null,
    );
    if (metadataEntries.length > 0) {
      for (const [key, value] of metadataEntries.slice(0, 3)) {
        const valueStr =
          typeof value === "object" ? JSON.stringify(value) : String(value);
        console.log(chalk.gray(`  ${key}: ${valueStr.slice(0, 60)}`));
      }
    }

    if (!isLast) {
      console.log(chalk.gray("  ↓"));
    }
  }

  console.log("");
  console.log(chalk.gray(`Total nodes in path: ${result.path.length}`));
  console.log("");
}

function kebabToSnake(name: string): string {
  return name.replace(/-/g, "_");
}
