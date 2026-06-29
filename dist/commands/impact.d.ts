export interface ImpactOptions {
    artifact?: string;
    json?: boolean;
    markStale?: boolean;
}
export declare function impactCommand(projectRoot: string, options: ImpactOptions): Promise<void>;
