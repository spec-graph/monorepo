import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { Graph } from "../types/index";
import { StateMachineEngine, ArtifactStatus } from "../engine/machine/index";
import { buildTraceIndex } from "../engine/trace/index";
import { readYaml } from "../utils/yaml";

export interface ChecklistOptions {
  json?: boolean;
}

export async function checklistCommand(
  projectRoot: string,
  storyId: string,
  options: ChecklistOptions,
): Promise<void> {
  try {
    const specGraphDir = path.join(projectRoot, ".spec-graph");
    const graphPath = path.join(specGraphDir, "graph.yaml");
    const statePath = path.join(specGraphDir, "machine-state.yaml");

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

    // Build trace index for checking requirement references
    const traceIndex = await buildTraceIndex(projectRoot, graph);

    // Find the story artifact
    const storyArtifact = state.artifacts[storyId];
    if (!storyArtifact) {
      console.log(chalk.red(`✗ Story not found: ${storyId}`));
      console.log(chalk.gray("Available stories:"));
      const stories = Object.keys(state.artifacts).filter((id) =>
        id.startsWith("plan/story/"),
      );
      for (const id of stories) {
        console.log(chalk.gray(`  - ${id}`));
      }
      process.exit(1);
      return;
    }

    if (
      storyArtifact.status !== "pending" &&
      storyArtifact.status !== "in_progress"
    ) {
      console.log(
        chalk.yellow(
          `⚠ Story ${storyId} is already ${storyArtifact.status}. Checklist is for pre-implementation validation.`,
        ),
      );
    }

    // Generate checklist
    const checklist = await generateChecklist(
      storyId,
      storyArtifact,
      graph,
      state,
      traceIndex,
    );

    // Write to file
    const checklistsDir = path.join(specGraphDir, "checklists");
    await fs.mkdir(checklistsDir, { recursive: true });
    const checklistPath = path.join(
      checklistsDir,
      `${storyId.replace(/\//g, "_")}.md`,
    );
    await fs.writeFile(checklistPath, checklist.content, "utf-8");

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            story_id: storyId,
            checklist_path: checklistPath,
            mechanical_checks: checklist.mechanicalChecks,
            soft_checks: checklist.softChecks,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(chalk.green(`✓ Checklist generated: ${checklistPath}`));
    console.log("");
    console.log(chalk.bold("Mechanical Checks (automated):"));
    for (const check of checklist.mechanicalChecks) {
      const status = check.passed ? chalk.green("✓") : chalk.red("✗");
      console.log(`  ${status} ${check.name}`);
      if (!check.passed && check.detail) {
        console.log(chalk.gray(`    ${check.detail}`));
      }
    }
    console.log("");
    console.log(chalk.bold("Soft Checks (manual review):"));
    for (const check of checklist.softChecks) {
      console.log(`  ○ ${check.name}`);
      if (check.detail) {
        console.log(chalk.gray(`    ${check.detail}`));
      }
    }
    console.log("");
    console.log(
      chalk.gray("Edit the checklist file to mark soft checks as complete."),
    );
  } catch (e: any) {
    console.error(chalk.red("Error:"), e.message);
    if (e.stack) console.log(e.stack);
    process.exit(1);
  }
}

interface ChecklistItem {
  name: string;
  detail?: string;
  passed?: boolean;
}

interface GeneratedChecklist {
  content: string;
  mechanicalChecks: ChecklistItem[];
  softChecks: ChecklistItem[];
}

async function generateChecklist(
  storyId: string,
  storyArtifact: ArtifactStatus,
  graph: Graph,
  state: any,
  traceIndex: any,
): Promise<GeneratedChecklist> {
  const mechanicalChecks: ChecklistItem[] = [];
  const softChecks: ChecklistItem[] = [];

  // Load document content for content-based checks
  let documentContent: string | undefined;
  try {
    const artifactsDir = path.join(process.cwd(), '.spec-graph', 'artifacts');
    const docPath = path.join(artifactsDir, storyId.replace(/\//g, '_') + '.md');
    // Also try the actual story path
    const altPath = path.join(artifactsDir, 'story', storyId.split('/').pop() + '.md');
    try {
      documentContent = await fs.readFile(docPath, 'utf-8');
    } catch {
      try {
        documentContent = await fs.readFile(altPath, 'utf-8');
      } catch {
        // Document not found — skip content-based checks
      }
    }
  } catch {
    // Skip content-based checks if document can't be loaded
  }

  // Mechanical Check 1: REQ mapping - story must reference at least one requirement
  const hasReqMapping = checkReqMapping(storyId, graph, state, traceIndex);
  mechanicalChecks.push({
    name: "Story references at least one requirement",
    detail: hasReqMapping.passed
      ? undefined
      : 'Add a "References" section listing requirement IDs',
    passed: hasReqMapping.passed,
  });

  // Mechanical Check 2: Scope atomicity - story should be small enough to implement in one iteration
  const hasAtomicScope = checkAtomicScope(storyArtifact, documentContent);
  mechanicalChecks.push({
    name: "Scope is atomic (implementable in one iteration)",
    detail: hasAtomicScope.passed
      ? undefined
      : "Consider splitting into smaller stories",
    passed: hasAtomicScope.passed,
  });

  // Mechanical Check 3: AC count - must have at least 2 acceptance criteria
  const hasACCount = checkACCount(storyArtifact, documentContent);
  mechanicalChecks.push({
    name: "Has at least 2 acceptance criteria",
    detail: hasACCount.passed
      ? undefined
      : "Add more acceptance criteria to ensure testability",
    passed: hasACCount.passed,
  });

  // Mechanical Check 4: REQ resolution - all referenced requirements must be resolved
  const hasReqResolution = checkReqResolution(
    storyId,
    graph,
    state,
    traceIndex,
  );
  mechanicalChecks.push({
    name: "All referenced requirements are resolved",
    detail: hasReqResolution.passed
      ? undefined
      : "Resolve or remove unresolved requirement references",
    passed: hasReqResolution.passed,
  });

  // Mechanical Check 5: Path safety - no file paths outside project scope
  const hasPathSafety = checkPathSafety(storyArtifact, documentContent);
  mechanicalChecks.push({
    name: "No file paths outside project scope",
    detail: hasPathSafety.passed
      ? undefined
      : "Remove or adjust out-of-scope file paths",
    passed: hasPathSafety.passed,
  });

  // Soft Check 1: No ambiguous adjectives (auto-detected when doc available)
  const ambiguousResults = detectAmbiguousAdjectives(documentContent);
  softChecks.push({
    name: 'No ambiguous adjectives (e.g., "fast", "user-friendly", "robust")',
    detail: ambiguousResults
      ? ambiguousResults
      : "Replace with measurable criteria or remove",
    passed: ambiguousResults === null ? undefined : ambiguousResults === "",
  });

  // Soft Check 2: Each AC is verifiable
  softChecks.push({
    name: "Each acceptance criterion is verifiable by automated test",
    detail: "Ensure AC can be checked by unit/integration test",
  });

  // Soft Check 3: Edge cases considered
  softChecks.push({
    name: "Edge cases considered and documented",
    detail: "Add edge cases to acceptance criteria or separate section",
  });

  // Soft Check 4: Dependencies declared
  softChecks.push({
    name: "Dependencies on other stories/components declared",
    detail: 'List dependencies in "Depends On" section',
  });

  // Soft Check 5: Out-of-scope explicit
  softChecks.push({
    name: "Out-of-scope items explicitly listed",
    detail: 'Add "Out of Scope" section to prevent scope creep',
  });

  // Generate markdown content
  const content = generateMarkdown(storyId, mechanicalChecks, softChecks);

  return { content, mechanicalChecks, softChecks };
}

function checkReqMapping(
  storyId: string,
  graph: Graph,
  state: any,
  traceIndex: any,
): { passed: boolean; detail?: string } {
  // Check if story has 'derives' edges to any requirement artifacts in the trace index
  if (!traceIndex || !traceIndex.edges) {
    return { passed: false };
  }

  const derivesEdges = traceIndex.edges.filter(
    (e: any) => e.from === storyId && e.relation === "derives",
  );

  // Check if any of the 'to' nodes are requirement artifacts
  const hasRequirementTarget = derivesEdges.some((e: any) => {
    const targetNode = traceIndex.nodes.get(e.to);
    // Check if the node's kind metadata starts with 'requirement'
    return (
      targetNode &&
      targetNode.metadata &&
      targetNode.metadata.kind &&
      targetNode.metadata.kind.startsWith("requirement")
    );
  });

  return { passed: hasRequirementTarget };
}

function checkAtomicScope(
  storyArtifact: ArtifactStatus,
  documentContent?: string,
): { passed: boolean; detail?: string } {
  if (!documentContent) return { passed: true };
  const lines = documentContent.split("\n").length;
  if (lines > 200) {
    return {
      passed: false,
      detail: `Story is ${lines} lines (max: 200). Consider splitting.`,
    };
  }
  return { passed: true };
}

function checkACCount(
  storyArtifact: ArtifactStatus,
  documentContent?: string,
): { passed: boolean; detail?: string } {
  if (!documentContent) return { passed: true };
  const acCount = (documentContent.match(/^###\s+AC-\d+/gm) || []).length;
  if (acCount < 2) {
    return {
      passed: false,
      detail: `Only ${acCount} AC(s) found (minimum: 2).`,
    };
  }
  return { passed: true };
}

function checkPathSafety(
  storyArtifact: ArtifactStatus,
  documentContent?: string,
): { passed: boolean; detail?: string } {
  if (!documentContent) return { passed: true };
  const suspicious = [/\/etc\//, /\/usr\//, /\/var\//, /\/tmp\//, /^~\//];
  const pathPattern = /`([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_/.*-]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = pathPattern.exec(documentContent)) !== null) {
    if (suspicious.some((p) => p.test(m![1]))) {
      return { passed: false, detail: `Suspicious path: '${m[1]}'.` };
    }
  }
  return { passed: true };
}


function checkReqResolution(
  storyId: string,
  graph: Graph,
  state: any,
  traceIndex: any,
): { passed: boolean; detail?: string } {
  // Get all requirement targets that this story derives from
  if (!traceIndex || !traceIndex.edges) {
    return { passed: true }; // No traces, so vacuously true
  }

  const derivesEdges = traceIndex.edges.filter(
    (e: any) => e.from === storyId && e.relation === "derives",
  );

  const reqIds = derivesEdges
    .map((e: any) => e.to)
    .filter((toId: string) => {
      const targetNode = traceIndex.nodes.get(toId);
      return (
        targetNode &&
        targetNode.metadata &&
        targetNode.metadata.kind &&
        targetNode.metadata.kind.startsWith("requirement")
      );
    });

  // Check if all referenced requirements are in "completed" status
  const allResolved = reqIds.every((reqId: string) => {
    const req = state.artifacts[reqId];
    return req && req.status === "completed";
  });

  return { passed: allResolved || reqIds.length === 0 };
}



/**
 * Scan document content for ambiguous adjectives.
 * Returns null if no document to check, empty string if clean,
 * or a formatted list of matches with line numbers if found.
 */
function detectAmbiguousAdjectives(documentContent?: string): string | null {
  if (!documentContent) return null;

  const ambiguous: Array<{ word: RegExp; suggestion: string }> = [
    { word: /\bfast\b/i, suggestion: "specify a measurable target (e.g., '<200ms')" },
    { word: /\bquick\b/i, suggestion: "specify a measurable target" },
    { word: /\buser-friendly\b/i, suggestion: "list specific UX requirements" },
    { word: /\bintuitive\b/i, suggestion: "describe expected user behavior" },
    { word: /\brobust\b/i, suggestion: "specify error handling requirements" },
    { word: /\breliable\b/i, suggestion: "specify uptime/availability targets" },
    { word: /\bscalable\b/i, suggestion: "specify expected load/scale" },
    { word: /\bflexible\b/i, suggestion: "describe specific extensibility points" },
    { word: /\bsimple\b/i, suggestion: "describe minimal required steps" },
    { word: /\beasy\b/i, suggestion: "specify measurable criteria" },
    { word: /\bseamless\b/i, suggestion: "describe integration requirements" },
    { word: /\bperformant\b/i, suggestion: "specify latency/throughput targets" },
    { word: /\bsecure\b/i, suggestion: "list specific security requirements" },
  ];

  const lines = documentContent.split("\n");
  const matches: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#") || lines[i].startsWith("```")) continue;
    for (const a of ambiguous) {
      if (a.word.test(lines[i])) {
        const found = lines[i].match(a.word)![0];
        matches.push(`  L${i + 1}: "${found}" -> ${a.suggestion}`);
        break;
      }
    }
  }

  if (matches.length === 0) return "";
  return `${matches.length} ambiguous adjective(s) found:\n${matches.join("\n")}`;
}

function generateMarkdown(
  storyId: string,
  mechanicalChecks: ChecklistItem[],
  softChecks: ChecklistItem[],
): string {
  const lines: string[] = [];
  lines.push(`# Checklist: ${storyId}`);
  lines.push("");
  lines.push("Generated by `spec-graph checklist` command.");
  lines.push("");
  lines.push("## Mechanical Checks");
  lines.push("");
  for (const check of mechanicalChecks) {
    const status = check.passed ? "[x]" : "[ ]";
    lines.push(`- ${status} **${check.name}**`);
    if (check.detail) {
      lines.push(`  ${check.detail}`);
    }
  }
  lines.push("");
  lines.push("## Soft Checks (Manual Review)");
  lines.push("");
  for (const check of softChecks) {
    lines.push(`- [ ] **${check.name}**`);
    if (check.detail) {
      lines.push(`  ${check.detail}`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Mark mechanical checks as complete after automated validation.");
  lines.push("Mark soft checks as complete after manual review.");
  lines.push("All checks must pass before implementation begins.");

  return lines.join("\n");
}
