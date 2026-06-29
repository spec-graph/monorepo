export interface DoctorOptions {
    json?: boolean;
    fix?: boolean;
}
export type CheckSeverity = "ok" | "warn" | "error";
export interface DoctorCheck {
    id: string;
    category: string;
    severity: CheckSeverity;
    message: string;
    detail?: string;
}
export interface DoctorReport {
    ok: boolean;
    errors: number;
    warnings: number;
    checks: DoctorCheck[];
}
export declare function doctorCommand(projectRoot: string, options: DoctorOptions): Promise<void>;
