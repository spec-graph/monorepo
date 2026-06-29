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
export declare function analysisCommand(projectRoot: string, options: AnalysisOptions): Promise<void>;
