/**
 * Refactoring Safety Net
 *
 * Before refactoring legacy code, capture a "snapshot" of current behavior
 * (function signatures, exports, test results). After refactoring, compare
 * the snapshot to detect regressions.
 *
 * This is critical for legacy project takeovers where you need to refactor
 * without breaking existing functionality.
 */
export interface SafetyNetSnapshot {
    project: string;
    timestamp: string;
    git_commit: string | null;
    exports: Record<string, string[]>;
    function_signatures: string[];
    test_results: TestSnapshot | null;
    file_hashes: Record<string, string>;
}
interface TestSnapshot {
    passed: number;
    failed: number;
    total: number;
}
export interface SafetyNetResult {
    snapshot_path: string;
    has_existing_snapshot: boolean;
    changes: {
        added_exports: string[];
        removed_exports: string[];
        changed_files: string[];
        test_regression: boolean;
    };
}
/**
 * Capture a snapshot of the current codebase state.
 * Run before refactoring to establish a baseline.
 */
export declare function captureSnapshot(projectRoot: string): Promise<SafetyNetSnapshot>;
/**
 * Compare current state against a previously captured snapshot.
 * Run after refactoring to detect regressions.
 */
export declare function compareSnapshot(projectRoot: string, previous: SafetyNetSnapshot): Promise<SafetyNetResult>;
/**
 * Format safety net result for display.
 */
export declare function formatSafetyNetResult(result: SafetyNetResult): string;
export {};
