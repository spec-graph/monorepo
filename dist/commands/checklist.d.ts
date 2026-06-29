export interface ChecklistOptions {
    json?: boolean;
}
export declare function checklistCommand(projectRoot: string, storyId: string, options: ChecklistOptions): Promise<void>;
