/**
 * Migration Planning Engine
 *
 * Analyzes existing codebase structure and generates incremental migration plans.
 * Identifies key components, dependencies, and suggests optimal migration order.
 */
import { Graph } from "../../types/index";
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
export declare function analyzeCodebase(projectRoot: string): Promise<CodebaseAnalysis>;
/**
 * Generate migration plan based on codebase analysis.
 */
export declare function generateMigrationPlan(projectRoot: string, graph: Graph): Promise<MigrationPlan>;
/**
 * Format migration plan for display.
 */
export declare function formatMigrationPlan(plan: MigrationPlan): string;
