import { Profile, Graph } from "../../types/index";
export interface ComposeResult {
    graph: Graph;
    packsUsed: Array<{
        name: string;
        matched: any;
        priority: number;
    }>;
    warnings: string[];
    errors: string[];
}
export declare function runCompose(projectRoot: string, rawProfile: Profile, changeType?: string): Promise<ComposeResult>;
