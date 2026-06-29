/**
 * Dashboard Engine
 *
 * Generates rich terminal and HTML dashboards for workflow status.
 * Combines graph, machine state, trace index, and configuration data
 * into a single visual overview.
 */
export interface DashboardData {
    project_name: string;
    current_stage: string;
    stage_order: string[];
    artifacts: Record<string, {
        status: string;
        kind?: string;
    }>;
    checks: Record<string, {
        status: string;
        layer?: string;
    }>;
    gates: Array<{
        id: string;
        passed: boolean;
        missing_artifacts: string[];
        failed_checks: string[];
        missing_traces: string[];
    }>;
    trace_coverage: {
        total_edges: number;
        satisfied: number;
        pending: number;
    };
    constitution: {
        version: string;
        principles: number;
    };
    active_change: {
        id: string;
        title: string;
        type: string;
        priority: string;
    } | null;
    stats: {
        total_artifacts: number;
        completed_artifacts: number;
        total_checks: number;
        passed_checks: number;
        total_gates: number;
        passed_gates: number;
    };
}
/**
 * Generate terminal dashboard output using box-drawing characters.
 */
export declare function renderTerminalDashboard(data: DashboardData): string;
/**
 * Generate HTML dashboard file.
 */
export declare function renderHtmlDashboard(data: DashboardData): string;
