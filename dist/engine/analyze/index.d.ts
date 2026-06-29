/**
 * Cross-Artifact Analysis Engine
 *
 * Compares content across multiple artifacts to detect:
 * - Duplication (same requirement in multiple docs)
 * - Coverage gaps (requirements with no corresponding design/story/task)
 * - Terminology drift (same concept named differently)
 * - AC gaps (stories with acceptance criteria not covered by tasks)
 * - Vague language (across all artifacts, not just one)
 */
import { Graph } from "../../types/index";
export interface AnalysisFinding {
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    message: string;
    artifacts: string[];
    detail?: string;
}
export interface AnalysisResult {
    findings: AnalysisFinding[];
    stats: {
        artifacts_analyzed: number;
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
}
/**
 * Analyze all artifacts for cross-artifact consistency issues.
 */
export declare function analyzeArtifacts(projectRoot: string, graph: Graph): Promise<AnalysisResult>;
/**
 * Format analysis result for display.
 */
export declare function formatAnalysisResult(result: AnalysisResult): string;
