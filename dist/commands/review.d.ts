export interface ReviewOptions {
    artifact: string;
    models?: string;
    focus?: string;
    save?: boolean;
    json?: boolean;
    full?: boolean;
}
export declare function reviewCommand(projectRoot: string, options: ReviewOptions): Promise<void>;
