import { Constitution } from "../types/index";
export interface ConstitutionOptions {
    subcommand?: string;
    force?: boolean;
    json?: boolean;
    type?: string;
}
export declare function constitutionCommand(projectRoot: string, options: ConstitutionOptions): Promise<void>;
export declare function loadConstitution(projectRoot: string): Promise<Constitution | null>;
