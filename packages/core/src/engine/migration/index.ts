/**
 * Migration Planning Engine
 *
 * Analyzes existing codebase structure and generates incremental migration plans.
 * Identifies key components, dependencies, and suggests optimal migration order.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Graph, ArtifactDecl } from "../../types/index";

export interface MigrationStep {
  id: string;
  action: string;
  target: string;
  priority: "high" | "medium" | "low";
  reason: string;
  dependencies: string[];
}

export interface MigrationPlan {
  projectId: string;
  generatedAt: string;
  steps: MigrationStep[];
  summary: string;
}

export interface CodebaseAnalysis {
  hasTests: boolean;
  hasLinting: boolean;
  hasTypeScript: boolean;
  components: string[];
  dependencies: Record<string, string[]>;
  testCoverage: number;
}

/**
 * Analyze existing codebase structure for migration planning.
 */
export async function analyzeCodebase(projectRoot: string): Promise<CodebaseAnalysis> {
  const analysis: CodebaseAnalysis = {
    hasTests: false,
    hasLinting: false,
    hasTypeScript: false,
    components: [],
    dependencies: {},
    testCoverage: 0,
  };

  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));

    // Detect TypeScript
    analysis.hasTypeScript =
      (packageJson.devDependencies?.typescript !== undefined) ||
      (packageJson.dependencies?.typescript !== undefined);

    // Detect linting
    analysis.hasLinting =
      (packageJson.devDependencies?.eslint !== undefined) ||
      (packageJson.devDependencies?.prettier !== undefined);

    // Detect test framework
    analysis.hasTests =
      (packageJson.devDependencies?.vitest !== undefined) ||
      (packageJson.devDependencies?.jest !== undefined) ||
      (packageJson.devDependencies?.mocha !== undefined);

    // Scan src directory for components
    const srcDir = path.join(projectRoot, "src");
    try {
      const components = await scanDirectory(srcDir, [".ts", ".tsx", ".js", ".jsx"]);
      analysis.components = components;

      // Extract dependencies from imports (simplified)
      for (const file of components.slice(0, 20)) { // Limit to first 20 files
        try {
          const content = await fs.readFile(path.join(srcDir, file), "utf-8");
          const imports = extractImports(content);
          analysis.dependencies[file] = imports;
        } catch {
          // Ignore read errors
        }
      }
    } catch {
      // No src directory
    }
  } catch {
    // No package.json or other errors
  }

  return analysis;
}

/**
 * Scan directory for files with specific extensions.
 */
async function scanDirectory(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];

  async function scan(dir: string, prefix: string = "") {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;

        if (entry.isDirectory()) {
          await scan(fullPath, relativePath);
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
          files.push(relativePath);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  await scan(dir);
  return files;
}

/**
 * Extract import statements from TypeScript/JavaScript code.
 */
function extractImports(code: string): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    // Only include relative imports (local files)
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      imports.push(importPath);
    }
  }

  return imports;
}

/**
 * Generate migration plan based on codebase analysis.
 */
export async function generateMigrationPlan(
  projectRoot: string,
  graph: Graph,
): Promise<MigrationPlan> {
  const analysis = await analyzeCodebase(projectRoot);
  const steps: MigrationStep[] = [];

  // Step 1: Add linting if not present
  if (!analysis.hasLinting) {
    steps.push({
      id: "add-linting",
      action: "add",
      target: "linting-config",
      priority: "high",
      reason: "No linting configuration found. Add ESLint/Prettier for code quality.",
      dependencies: [],
    });
  }

  // Step 2: Add TypeScript if not present
  if (!analysis.hasTypeScript) {
    steps.push({
      id: "add-typescript",
      action: "add",
      target: "typescript-config",
      priority: "high",
      reason: "No TypeScript found. Add TypeScript for type safety.",
      dependencies: ["add-linting"],
    });
  }

  // Step 3: Add tests if not present
  if (!analysis.hasTests) {
    steps.push({
      id: "add-testing",
      action: "add",
      target: "test-framework",
      priority: "high",
      reason: "No test framework found. Add Vitest/Jest for testing.",
      dependencies: ["add-linting"],
    });
  }

  // Step 4: Create spec-graph artifacts for existing components
  if (analysis.components.length > 0) {
    steps.push({
      id: "create-artifacts",
      action: "create",
      target: "component-artifacts",
      priority: "medium",
      reason: `Found ${analysis.components.length} components. Create spec-graph artifacts for tracking.`,
      dependencies: ["add-linting"],
    });
  }

  // Step 5: Add trace relationships between components
  if (Object.keys(analysis.dependencies).length > 0) {
    steps.push({
      id: "add-traces",
      action: "add",
      target: "component-traces",
      priority: "medium",
      reason: "Analyze component dependencies and add trace relationships.",
      dependencies: ["create-artifacts"],
    });
  }

  // Step 6: Validate existing code against spec-graph rules
  steps.push({
    id: "validate-code",
    action: "validate",
    target: "existing-code",
    priority: "low",
    reason: "Validate existing code against spec-graph rules and linting rules.",
    dependencies: ["add-linting", "add-testing"],
  });

  // Step 7: Generate documentation for existing components
  steps.push({
    id: "generate-docs",
    action: "generate",
    target: "component-docs",
    priority: "low",
    reason: "Generate documentation for existing components using AI.",
    dependencies: ["create-artifacts"],
  });

  return {
    projectId: path.basename(projectRoot),
    generatedAt: new Date().toISOString(),
    steps,
    summary: `Migration plan generated for ${analysis.components.length} components. ${steps.length} steps identified.`,
  };
}

/**
 * Format migration plan for display.
 */
export function formatMigrationPlan(plan: MigrationPlan): string {
  const lines: string[] = [];

  lines.push(`# Migration Plan: ${plan.projectId}`);
  lines.push("");
  lines.push(`**Generated**: ${new Date(plan.generatedAt).toLocaleString()}`);
  lines.push(`**Summary**: ${plan.summary}`);
  lines.push("");

  // Group steps by priority
  const highPriority = plan.steps.filter((s) => s.priority === "high");
  const mediumPriority = plan.steps.filter((s) => s.priority === "medium");
  const lowPriority = plan.steps.filter((s) => s.priority === "low");

  if (highPriority.length > 0) {
    lines.push("## High Priority");
    lines.push("");
    for (const step of highPriority) {
      lines.push(`### ${step.id}`);
      lines.push(`- **Action**: ${step.action}`);
      lines.push(`- **Target**: ${step.target}`);
      lines.push(`- **Reason**: ${step.reason}`);
      if (step.dependencies.length > 0) {
        lines.push(`- **Dependencies**: ${step.dependencies.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (mediumPriority.length > 0) {
    lines.push("## Medium Priority");
    lines.push("");
    for (const step of mediumPriority) {
      lines.push(`### ${step.id}`);
      lines.push(`- **Action**: ${step.action}`);
      lines.push(`- **Target**: ${step.target}`);
      lines.push(`- **Reason**: ${step.reason}`);
      if (step.dependencies.length > 0) {
        lines.push(`- **Dependencies**: ${step.dependencies.join(", ")}`);
      }
      lines.push("");
    }
  }

  if (lowPriority.length > 0) {
    lines.push("## Low Priority");
    lines.push("");
    for (const step of lowPriority) {
      lines.push(`### ${step.id}`);
      lines.push(`- **Action**: ${step.action}`);
      lines.push(`- **Target**: ${step.target}`);
      lines.push(`- **Reason**: ${step.reason}`);
      if (step.dependencies.length > 0) {
        lines.push(`- **Dependencies**: ${step.dependencies.join(", ")}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
