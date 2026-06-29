export interface DashboardOptions {
    json?: boolean;
    html?: boolean;
    output?: string;
}
export declare function dashboardCommand(projectRoot: string, options: DashboardOptions): Promise<void>;
