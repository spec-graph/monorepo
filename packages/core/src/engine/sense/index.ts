import fs from "node:fs/promises";
import path from "node:path";
import { Profile, FactDimension, ProfileFact } from "../../types/index";
import { inferenceRules, InferenceRule } from "./repo-rules";
import {
  RepoScanClassifier,
  LlmClassifier,
  SenseClassifier,
  LlmBackend,
  HttpLlmBackend,
} from "./classifier";

// Re-export so existing imports still work
export { inferenceRules, InferenceRule };
export {
  RepoScanClassifier,
  LlmClassifier,
  SenseClassifier,
  LlmBackend,
  HttpLlmBackend,
};

// ============ RepoSignals ============
// (InferenceRule type now imported from repo-rules.ts)

export interface RepoSignals {
  // Package
  hasPackageJson: boolean;
  packageManager: string | null;
  hasExportsField: boolean;
  hasDependencies: string[];
  hasDevDependencies: string[];
  /** Framework versions extracted from package.json */
  frameworkVersions: Record<string, string>;

  // Frontend
  hasNextConfig: boolean;
  hasViteConfig: boolean;
  hasWebpackConfig: boolean;
  hasReact: boolean;
  hasVue: boolean;
  hasTailwind: boolean;
  hasDesignTokens: boolean;

  // Backend
  hasOpenApiYaml: boolean;
  hasPrismaSchema: boolean;
  hasDockerfile: boolean;
  hasK8sConfig: boolean;
  hasGraphqlSchema: boolean;
  hasGrpcProtos: boolean;

  // Embedded
  hasPlatformioIni: boolean;
  hasArduinoFiles: boolean;
  hasRegisterMap: boolean;

  // General
  hasCiConfig: boolean;
  hasSrcDir: boolean;
  hasTestDir: boolean;
  hasGit: boolean;
  srcFileCount: number;
  testFileCount: number;

  // === NEW: Enhanced brownfield support ===

  /** TypeScript detection */
  hasTypeScript: boolean;
  hasTsConfig: boolean;

  /** Test framework detection */
  hasJest: boolean;
  hasVitest: boolean;
  hasMocha: boolean;
  hasCypress: boolean;
  hasPlaywright: boolean;

  /** Monorepo detection */
  isMonorepo: boolean;
  hasLerna: boolean;
  hasNx: boolean;
  hasTurborepo: boolean;

  /** Existing spec-graph detection */
  hasExistingSpecGraph: boolean;

  /** Project structure patterns */
  hasComponentsDir: boolean;
  hasPagesDir: boolean;
  hasAppDir: boolean;
  hasLibDir: boolean;
  hasApiDir: boolean;

  /** Build tooling */
  hasEslint: boolean;
  hasPrettier: boolean;
  buildTool: string | null; // tsc, vite, webpack, next, etc.
}

async function scanRepo(root: string): Promise<RepoSignals> {
  const signals: RepoSignals = {
    hasPackageJson: false,
    packageManager: null,
    hasExportsField: false,
    hasDependencies: [],
    hasDevDependencies: [],
    frameworkVersions: {},
    hasNextConfig: false,
    hasViteConfig: false,
    hasWebpackConfig: false,
    hasReact: false,
    hasVue: false,
    hasTailwind: false,
    hasDesignTokens: false,
    hasOpenApiYaml: false,
    hasPrismaSchema: false,
    hasDockerfile: false,
    hasK8sConfig: false,
    hasGraphqlSchema: false,
    hasGrpcProtos: false,
    hasPlatformioIni: false,
    hasArduinoFiles: false,
    hasRegisterMap: false,
    hasCiConfig: false,
    hasSrcDir: false,
    hasTestDir: false,
    hasGit: false,
    srcFileCount: 0,
    testFileCount: 0,
    // Enhanced fields
    hasTypeScript: false,
    hasTsConfig: false,
    hasJest: false,
    hasVitest: false,
    hasMocha: false,
    hasCypress: false,
    hasPlaywright: false,
    isMonorepo: false,
    hasLerna: false,
    hasNx: false,
    hasTurborepo: false,
    hasExistingSpecGraph: false,
    hasComponentsDir: false,
    hasPagesDir: false,
    hasAppDir: false,
    hasLibDir: false,
    hasApiDir: false,
    hasEslint: false,
    hasPrettier: false,
    buildTool: null,
  };

  try {
    const entries = await fs.readdir(root);

    signals.hasPackageJson = entries.includes("package.json");
    if (signals.hasPackageJson) {
      const pkg = JSON.parse(
        await fs.readFile(path.join(root, "package.json"), "utf-8"),
      );
      signals.hasExportsField = !!pkg.exports;
      signals.hasDependencies = Object.keys(pkg.dependencies || {});
      signals.hasDevDependencies = Object.keys(pkg.devDependencies || {});
      const allDeps = [...signals.hasDependencies, ...signals.hasDevDependencies];

      signals.hasReact = allDeps.includes("react");
      signals.hasVue = allDeps.includes("vue");
      signals.hasTailwind = signals.hasDevDependencies.includes("tailwindcss");

      // Framework versions
      if (signals.hasReact && pkg.dependencies?.react)
        signals.frameworkVersions.react = pkg.dependencies.react;
      if (signals.hasVue && (pkg.dependencies?.vue || pkg.devDependencies?.vue))
        signals.frameworkVersions.vue = pkg.dependencies?.vue || pkg.devDependencies?.vue;
      if (pkg.dependencies?.express) signals.frameworkVersions.express = pkg.dependencies.express;
      if (pkg.dependencies?.next) signals.frameworkVersions.next = pkg.dependencies.next;

      // Test frameworks
      signals.hasJest = allDeps.includes("jest");
      signals.hasVitest = allDeps.includes("vitest");
      signals.hasMocha = allDeps.includes("mocha");
      signals.hasCypress = allDeps.includes("cypress");
      signals.hasPlaywright = allDeps.includes("@playwright/test");

      // TypeScript
      signals.hasTypeScript = allDeps.includes("typescript") ||
        allDeps.some((d: string) => d.startsWith("@types/"));
      signals.hasTsConfig = entries.some((e) => e.startsWith("tsconfig"));

      // Linting
      signals.hasEslint = allDeps.includes("eslint") ||
        entries.some((e) => e.startsWith(".eslintrc") || e.startsWith("eslint.config"));
      signals.hasPrettier = allDeps.includes("prettier") ||
        entries.includes(".prettierrc") || entries.includes(".prettierignore");

      // Build tool
      if (pkg.dependencies?.["next"]) signals.buildTool = "next";
      else if (pkg.devDependencies?.["vite"]) signals.buildTool = "vite";
      else if (pkg.devDependencies?.["webpack"]) signals.buildTool = "webpack";
      else if (pkg.devDependencies?.["tsc"] || pkg.devDependencies?.["typescript"]) signals.buildTool = "tsc";
      else if (pkg.scripts?.build?.includes("tsc")) signals.buildTool = "tsc";

      // Package manager
      if (entries.includes("pnpm-lock.yaml")) signals.packageManager = "pnpm";
      else if (entries.includes("yarn.lock")) signals.packageManager = "yarn";
      else if (entries.includes("package-lock.json")) signals.packageManager = "npm";

      // Monorepo
      signals.isMonorepo = !!pkg.workspaces;
      signals.hasLerna = entries.includes("lerna.json");
      signals.hasNx = entries.includes("nx.json");
      signals.hasTurborepo = entries.includes("turbo.json");
    }

    signals.hasNextConfig = entries.some((e) => e.startsWith("next.config."));
    signals.hasViteConfig = entries.some((e) => e.startsWith("vite.config."));
    signals.hasWebpackConfig = entries.some((e) =>
      e.startsWith("webpack.config."),
    );
    signals.hasOpenApiYaml = entries.some(
      (e) => e.includes("openapi") || e.includes("swagger"),
    );
    signals.hasPrismaSchema =
      entries.includes("prisma") || entries.some((e) => e.endsWith(".prisma"));
    signals.hasDockerfile =
      entries.includes("Dockerfile") || entries.includes("docker-compose.yml");
    signals.hasK8sConfig = entries.some(
      (e) => e.includes("kubernetes") || e.endsWith(".k8s.yaml") || e.endsWith(".k8s.yml"),
    );
    signals.hasPlatformioIni = entries.includes("platformio.ini");
    signals.hasGit = entries.includes(".git");
    signals.hasSrcDir = entries.includes("src");
    signals.hasTestDir = entries.some(
      (e) => e === "test" || e === "tests" || e === "__tests__",
    );
    signals.hasDesignTokens = entries.some(
      (e) => e.includes("design-token") || e.includes("token"),
    );

    signals.hasCiConfig = entries.some(
      (e) =>
        e.startsWith(".github") ||
        e.startsWith(".gitlab-ci") ||
        e.startsWith("circle.") ||
        e.startsWith("ci."),
    );

    // Enhanced: existing spec-graph detection
    signals.hasExistingSpecGraph = entries.includes(".spec-graph");

    // Enhanced: project structure patterns
    signals.hasComponentsDir = entries.includes("components");
    signals.hasPagesDir = entries.includes("pages");
    signals.hasAppDir = entries.includes("app");
    signals.hasLibDir = entries.includes("lib");
    signals.hasApiDir = entries.includes("api");

    if (signals.hasSrcDir) {
      const srcEntries = await fs.readdir(path.join(root, "src"));
      signals.hasComponentsDir = signals.hasComponentsDir || srcEntries.includes("components");
      signals.hasPagesDir = signals.hasPagesDir || srcEntries.includes("pages");
      signals.hasAppDir = signals.hasAppDir || srcEntries.includes("app");
      signals.hasLibDir = signals.hasLibDir || srcEntries.includes("lib");
      signals.hasApiDir = signals.hasApiDir || srcEntries.includes("api");

      const srcFiles = await walkDir(path.join(root, "src"));
      signals.srcFileCount = srcFiles.length;
      signals.hasGrpcProtos = srcFiles.some((f) => f.endsWith(".proto"));
      signals.hasGraphqlSchema = srcFiles.some(
        (f) => f.endsWith(".graphql") || f.endsWith(".gql"),
      );
      signals.hasArduinoFiles = srcFiles.some((f) => f.endsWith(".ino"));
      signals.hasRegisterMap = srcFiles.some(
        (f) => f.includes("register") && f.endsWith(".h"),
      );
      signals.hasTypeScript = signals.hasTypeScript || srcFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    }

    if (signals.hasTestDir) {
      const testDir = entries.find((e) => e === "test" || e === "tests" || e === "__tests__");
      if (testDir) {
        const testFiles = await walkDir(path.join(root, testDir));
        signals.testFileCount = testFiles.length;
      }
    }
  } catch (e) {
    // Ignore scan errors
  }

  return signals;
}

async function walkDir(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore
  }
  return files;
}

/**
 * Generate a human-readable summary of the codebase for AI agents
 * taking over a project. Injected into profile analysis output so
 * the coordinator has context when dispatching sub-agents.
 */
export function buildCodebaseSummary(signals: RepoSignals): string {
  const lines: string[] = [];

  lines.push("## Codebase Analysis");
  lines.push("");

  // Language & TypeScript
  if (signals.hasTypeScript) {
    lines.push(`- **Language**: TypeScript`);
  }
  if (signals.hasTsConfig) {
    lines.push("- **tsconfig.json**: found");
  }
  lines.push("");

  // Framework
  const frameworks: string[] = [];
  if (signals.hasReact) frameworks.push(`React${signals.frameworkVersions.react ? " " + signals.frameworkVersions.react : ""}`);
  if (signals.hasVue) frameworks.push(`Vue${signals.frameworkVersions.vue ? " " + signals.frameworkVersions.vue : ""}`);
  if (signals.frameworkVersions.express) frameworks.push(`Express ${signals.frameworkVersions.express}`);
  if (signals.frameworkVersions.next) frameworks.push(`Next.js ${signals.frameworkVersions.next}`);
  if (frameworks.length > 0) {
    lines.push(`- **Frameworks**: ${frameworks.join(", ")}`);
  }

  // Build tool
  if (signals.buildTool) {
    lines.push(`- **Build tool**: ${signals.buildTool}`);
  }

  // Package manager
  if (signals.packageManager) {
    lines.push(`- **Package manager**: ${signals.packageManager}`);
  }
  lines.push("");

  // Project structure
  lines.push("### Project Structure");
  if (signals.hasSrcDir) {
    const dirs: string[] = [];
    if (signals.hasComponentsDir) dirs.push("components/");
    if (signals.hasPagesDir) dirs.push("pages/");
    if (signals.hasAppDir) dirs.push("app/");
    if (signals.hasLibDir) dirs.push("lib/");
    if (signals.hasApiDir) dirs.push("api/");
    lines.push(`- **src/**: ${signals.srcFileCount} file(s)`);
    if (dirs.length > 0) lines.push(`  - Subdirs: ${dirs.join(", ")}`);
  }
  if (signals.hasTestDir) {
    lines.push(`- **test/**: ${signals.testFileCount} file(s)`);
  }
  if (signals.isMonorepo) {
    lines.push("- **Monorepo**: yes (workspaces)");
    if (signals.hasLerna) lines.push("  - lerna.json found");
    if (signals.hasNx) lines.push("  - nx.json found");
    if (signals.hasTurborepo) lines.push("  - turbo.json found");
  }
  lines.push("");

  // Testing
  lines.push("### Testing");
  const testFrameworks: string[] = [];
  if (signals.hasJest) testFrameworks.push("Jest");
  if (signals.hasVitest) testFrameworks.push("Vitest");
  if (signals.hasMocha) testFrameworks.push("Mocha");
  if (signals.hasCypress) testFrameworks.push("Cypress");
  if (signals.hasPlaywright) testFrameworks.push("Playwright");
  if (testFrameworks.length > 0) {
    lines.push(`- **Test frameworks**: ${testFrameworks.join(", ")}`);
  } else {
    lines.push("- **Test frameworks**: none detected");
  }
  lines.push("");

  // Tooling
  lines.push("### Tooling");
  if (signals.hasEslint) lines.push("- **Linter**: ESLint");
  if (signals.hasPrettier) lines.push("- **Formatter**: Prettier");
  if (signals.hasDockerfile) lines.push("- **Docker**: yes");
  if (signals.hasK8sConfig) lines.push("- **Kubernetes**: yes");
  if (signals.hasCiConfig) lines.push("- **CI/CD**: yes");
  if (signals.hasExistingSpecGraph) lines.push("- **spec-graph**: already initialized");
  lines.push("");

  // Dependencies summary
  if (signals.hasDependencies.length > 0) {
    lines.push(`- **Dependencies**: ${signals.hasDependencies.length}`);
    if (signals.hasDevDependencies.length > 0) {
      lines.push(`- **Dev dependencies**: ${signals.hasDevDependencies.length}`);
    }
  }

  return lines.join("\n");
}

// ============ Sense Engine ============

export interface SenseResult {
  profile: Profile;
  signals: RepoSignals;
  warnings: string[];
}

export interface SenseOptions {
  /** User's free-text description of the project — passed to LLM classifier. */
  description?: string;
  /** Classifier to use. Defaults to RepoScanClassifier (deterministic). */
  classifier?: SenseClassifier;
}

/**
 * Run the Sense stage: scan repo + classify dimensions.
 *
 * Pipeline:
 *   1. Repo scan (deterministic) — produces hard evidence with confidence='high'
 *   2. Classifier fills in dimensions not established by hard evidence
 *      - RepoScanClassifier (default): deterministic fallback values
 *      - LlmClassifier (injectable): calls LLM, fails-closed to repo-scan
 *
 * The classifier CANNOT downgrade hard evidence — only fills gaps.
 * Per CLAUDE.md: LLM 输出必须落成 profile.yaml 给人复核再冻结,
 * 失败闭合 / 不静默通过。
 */
export async function runSense(
  projectRoot: string,
  options: SenseOptions = {},
): Promise<SenseResult> {
  const warnings: string[] = [];
  const signals = await scanRepo(projectRoot);

  // Phase 1: repo scan — establishes hard evidence
  const facts: Partial<Record<FactDimension, ProfileFact>> = {};
  const hardEvidence: Partial<Record<FactDimension, ProfileFact>> = {};

  for (const rule of inferenceRules.sort((a, b) => b.priority - a.priority)) {
    const result = rule.detect(signals);
    if (result) {
      const fact: ProfileFact = {
        value: result.value ?? "unknown",
        confidence: result.confidence ?? "low",
        source: result.source ?? "fallback",
        evidence: result.evidence,
      };
      facts[rule.dimension] = fact;
      if (fact.confidence === "high") {
        hardEvidence[rule.dimension] = fact;
      }
    }
  }

  // Phase 2: classifier fills gaps
  const classifier = options.classifier || new RepoScanClassifier();
  const classifyOut = await classifier.classify({
    signals,
    description: options.description,
    hardEvidence,
  });

  // Merge classifier facts — never overriding hard evidence
  let llmClassified = false;
  for (const [dim, fact] of Object.entries(classifyOut.facts) as [
    FactDimension,
    ProfileFact,
  ][]) {
    if (hardEvidence[dim]?.confidence === "high") continue; // never downgrade
    if (!facts[dim] || facts[dim]!.confidence !== "high") {
      facts[dim] = fact;
      if (fact.source === "llm") llmClassified = true;
    }
  }
  if (classifyOut.used) llmClassified = true;
  warnings.push(...classifyOut.warnings);

  // Fill any still-missing dimensions with explicit unknowns
  const allDimensions: FactDimension[] = [
    "has_ui",
    "boundary",
    "topology",
    "deployment",
    "consumers",
    "field",
    "criticality",
    "team",
    "persistence",
  ];

  for (const dim of allDimensions) {
    if (!facts[dim]) {
      warnings.push(`Could not infer '${dim}', defaulting to unknown`);
      facts[dim] = {
        value: "unknown",
        confidence: "low",
        source: "fallback",
        evidence: "Default fallback",
      };
    }
  }

  const profile: Profile = {
    version: "1",
    meta: {
      created_at: new Date().toISOString(),
      source: {
        repo_scan: true,
        llm_classified: llmClassified,
      },
    },
    facts: facts as Record<FactDimension, ProfileFact>,
    repo_signals: signals,
  };

  return { profile, signals, warnings };
}
