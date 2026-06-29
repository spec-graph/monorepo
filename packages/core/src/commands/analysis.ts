import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import chalk from "chalk";
import Table from "cli-table3";

export interface AnalysisOptions {
  phase?: string;
  content?: string;
  tasks?: string;
  artifacts?: string;
  docs?: string;
  templates?: string;
  json?: boolean;
}

export interface AnalysisDocument {
  id: string;
  phase: string;
  status: "draft" | "final";
  created_at: string;
  updated_at: string;
  author?: string;
  summary: string;
  key_findings: string[];
  decisions: string[];
  linked_tasks: string[];
  linked_artifacts: string[];
  /**
   * Paths to documents produced from this analysis (tracked, not stored).
   * AI agents write documents to project filesystem, spec-graph tracks the paths.
   */
  document_paths: string[];
  /**
   * Templates used for generating documents (reference to packs templates).
   */
  templates_used: string[];
  content: string;
}

export async function analysisCommand(
  projectRoot: string,
  options: AnalysisOptions,
): Promise<void> {
  const analysisDir = path.join(projectRoot, ".spec-graph", "analysis");
  await fs.mkdir(analysisDir, { recursive: true });

  const subcommand =
    options.phase === "list"
      ? "list"
      : options.phase === "show"
        ? "show"
        : "write";

  switch (subcommand) {
    case "list":
      await listAnalysis(analysisDir, options);
      break;
    case "show":
      await showAnalysis(analysisDir, options);
      break;
    case "write":
      await writeAnalysis(analysisDir, options);
      break;
  }
}

async function listAnalysis(
  analysisDir: string,
  options: AnalysisOptions,
): Promise<void> {
  const files = await fs.readdir(analysisDir);
  const analysisDocs: AnalysisDocument[] = [];

  for (const file of files) {
    if (file.endsWith(".yaml")) {
      const content = await fs.readFile(path.join(analysisDir, file), "utf-8");
      const doc = yaml.load(content) as AnalysisDocument;
      analysisDocs.push(doc);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(analysisDocs, null, 2));
    return;
  }

  if (analysisDocs.length === 0) {
    console.log(chalk.yellow("No analysis documents found."));
    console.log(
      chalk.gray(
        "Use `spec-graph analysis write --phase <phase>` to create one.",
      ),
    );
    return;
  }

  const table = new Table({
    head: ["Phase", "Status", "Updated", "Linked Tasks", "Linked Artifacts"],
    style: { head: ["cyan"] },
  });

  for (const doc of analysisDocs.sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )) {
    table.push([
      doc.phase,
      doc.status,
      new Date(doc.updated_at).toLocaleDateString(),
      doc.linked_tasks.length.toString(),
      doc.linked_artifacts.length.toString(),
    ]);
  }

  console.log(table.toString());
}

async function showAnalysis(
  analysisDir: string,
  options: AnalysisOptions,
): Promise<void> {
  if (!options.phase) {
    console.error(chalk.red("Error: --phase is required for show command"));
    process.exit(1);
  }

  const filePath = path.join(analysisDir, `${options.phase}.yaml`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const doc = yaml.load(content) as AnalysisDocument;

    if (options.json) {
      console.log(JSON.stringify(doc, null, 2));
      return;
    }

    console.log(chalk.bold(`\nPhase Analysis: ${doc.phase}\n`));
    console.log(chalk.gray(`Status: ${doc.status}`));
    console.log(
      chalk.gray(`Updated: ${new Date(doc.updated_at).toLocaleString()}\n`),
    );

    console.log(chalk.bold("Summary:"));
    console.log(doc.summary);
    console.log();

    if (doc.key_findings.length > 0) {
      console.log(chalk.bold("Key Findings:"));
      for (const finding of doc.key_findings) {
        console.log(`  • ${finding}`);
      }
      console.log();
    }

    if (doc.decisions.length > 0) {
      console.log(chalk.bold("Decisions:"));
      for (const decision of doc.decisions) {
        console.log(`  • ${decision}`);
      }
      console.log();
    }

    if (doc.linked_tasks.length > 0) {
      console.log(chalk.bold("Linked Tasks:"));
      for (const task of doc.linked_tasks) {
        console.log(`  • ${task}`);
      }
      console.log();
    }

    if (doc.linked_artifacts.length > 0) {
      console.log(chalk.bold("Linked Artifacts:"));
      for (const artifact of doc.linked_artifacts) {
        console.log(`  • ${artifact}`);
      }
      console.log();
    }

    if (doc.document_paths.length > 0) {
      console.log(chalk.bold("Document Paths:"));
      for (const docPath of doc.document_paths) {
        console.log(`  • ${docPath}`);
      }
      console.log();
    }

    if (doc.templates_used.length > 0) {
      console.log(chalk.bold("Templates Used:"));
      for (const template of doc.templates_used) {
        console.log(`  • ${template}`);
      }
      console.log();
    }

    if (doc.content) {
      console.log(chalk.bold("Detailed Content:"));
      console.log(doc.content);
    }
  } catch (e) {
    console.error(
      chalk.red(`Error: Analysis for phase '${options.phase}' not found`),
    );
    process.exit(1);
  }
}

async function writeAnalysis(
  analysisDir: string,
  options: AnalysisOptions,
): Promise<void> {
  if (!options.phase) {
    console.error(chalk.red("Error: --phase is required"));
    process.exit(1);
  }

  const filePath = path.join(analysisDir, `${options.phase}.yaml`);

  // Load existing or create new
  let doc: AnalysisDocument;
  try {
    const content = await fs.readFile(filePath, "utf-8");
    doc = yaml.load(content) as AnalysisDocument;
    doc.updated_at = new Date().toISOString();
  } catch {
    doc = {
      id: `analysis-${options.phase}`,
      phase: options.phase,
      status: "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      summary: "",
      key_findings: [],
      decisions: [],
      linked_tasks: [],
      linked_artifacts: [],
      document_paths: [],
      templates_used: [],
      content: "",
    };
  }

  // Update fields
  if (options.content !== undefined) {
    doc.content = options.content;
  }
  if (options.tasks !== undefined) {
    doc.linked_tasks = options.tasks
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
  }
  if (options.artifacts !== undefined) {
    doc.linked_artifacts = options.artifacts
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a);
  }
  if (options.docs !== undefined) {
    doc.document_paths = options.docs
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d);
  }
  if (options.templates !== undefined) {
    doc.templates_used = options.templates
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
  }

  // Save
  const yamlContent = yaml.dump(doc, { lineWidth: -1 });
  await fs.writeFile(filePath, yamlContent, "utf-8");

  if (options.json) {
    console.log(JSON.stringify(doc, null, 2));
  } else {
    console.log(chalk.green(`✓ Analysis for phase '${options.phase}' saved`));
  }
}
