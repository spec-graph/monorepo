export interface PrimeOptions {
    bootstrap?: boolean;
    json?: boolean;
}
export declare function primeCommand(projectRoot: string, options: PrimeOptions): Promise<void>;
