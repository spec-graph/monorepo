export interface ArtifactOptions {
    status?: string;
    producer?: string;
    json?: boolean;
}
export declare function artifactCommand(projectRoot: string, subcommand: string, id: string | undefined, options: ArtifactOptions): Promise<void>;
