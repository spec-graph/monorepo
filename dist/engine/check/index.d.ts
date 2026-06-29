import { Graph } from "../../types/index";
import { MachineState } from "../machine/index";
import { CheckDecl } from "../../types/index";
export interface CheckRunResult {
    id: string;
    command: string;
    status: "passed" | "failed";
    exit_code: number | null;
    stdout: string;
    stderr: string;
    started_at: string;
    finished_at: string;
    duration_ms: number;
}
export interface RunCheckOptions {
    cwd: string;
    timeoutMs?: number;
    dryRun?: boolean;
    graph?: Graph;
    state?: MachineState;
}
export declare function runCheck(check: CheckDecl, options: RunCheckOptions): Promise<CheckRunResult>;
