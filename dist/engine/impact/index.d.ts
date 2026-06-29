/**
 * Impact Analysis Engine
 *
 * Computes the "blast radius" of changes to artifacts.
 * Uses trace edges and check dependencies to identify downstream impact.
 */
import { Graph } from "../../types/index";
export interface ImpactAnalysis {
    /** The artifact that changed */
    source: string;
    /** Direct downstream artifacts (1 hop) */
    directDependencies: string[];
    /** Transitive downstream artifacts (all hops) */
    transitiveDependencies: string[];
    /** Checks that depend on the source artifact */
    affectedChecks: string[];
    /** Gates that might be affected */
    affectedGates: string[];
}
/**
 * Compute the impact of a change to an artifact.
 * Returns all downstream artifacts and checks that might be affected.
 */
export declare function analyzeImpact(projectRoot: string, graph: Graph, sourceArtifactId: string): Promise<ImpactAnalysis>;
/**
 * Format impact analysis for display.
 */
export declare function formatImpactAnalysis(impact: ImpactAnalysis): string;
