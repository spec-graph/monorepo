import { Profile } from "../../types/index";
import { inferenceRules, InferenceRule } from "./repo-rules";
import { RepoScanClassifier, LlmClassifier, SenseClassifier, LlmBackend, HttpLlmBackend } from "./classifier";
export { inferenceRules, InferenceRule };
export { RepoScanClassifier, LlmClassifier, SenseClassifier, LlmBackend, HttpLlmBackend, };
export interface RepoSignals {
    hasPackageJson: boolean;
    packageManager: string | null;
    hasExportsField: boolean;
    hasDependencies: string[];
    hasDevDependencies: string[];
    /** Framework versions extracted from package.json */
    frameworkVersions: Record<string, string>;
    hasNextConfig: boolean;
    hasViteConfig: boolean;
    hasWebpackConfig: boolean;
    hasReact: boolean;
    hasVue: boolean;
    hasTailwind: boolean;
    hasDesignTokens: boolean;
    hasOpenApiYaml: boolean;
    hasPrismaSchema: boolean;
    hasDockerfile: boolean;
    hasK8sConfig: boolean;
    hasGraphqlSchema: boolean;
    hasGrpcProtos: boolean;
    hasPlatformioIni: boolean;
    hasArduinoFiles: boolean;
    hasRegisterMap: boolean;
    hasCiConfig: boolean;
    hasSrcDir: boolean;
    hasTestDir: boolean;
    hasGit: boolean;
    srcFileCount: number;
    testFileCount: number;
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
    buildTool: string | null;
}
/**
 * Generate a human-readable summary of the codebase for AI agents
 * taking over a project. Injected into profile analysis output so
 * the coordinator has context when dispatching sub-agents.
 */
export declare function buildCodebaseSummary(signals: RepoSignals): string;
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
export declare function runSense(projectRoot: string, options?: SenseOptions): Promise<SenseResult>;
