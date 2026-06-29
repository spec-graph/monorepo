export interface SafetyNetOptions {
    compare?: boolean;
    json?: boolean;
}
export declare function safetyNetCommand(projectRoot: string, options: SafetyNetOptions): Promise<void>;
