import { loadMeetingRuntime, initMeetingRuntime, findRoundTemplate, collectPriorContributions } from "../engine/meeting/index";
export interface MeetingOptions {
    subcommand?: string;
    id?: string;
    participant?: string;
    type?: string;
    content?: string;
    targets?: string;
    summary?: string;
    openQuestions?: string;
    outputArtifacts?: string;
    reason?: string;
    purpose?: string;
    description?: string;
    participants?: string;
    minRounds?: string;
    maxRounds?: string;
    json?: boolean;
}
export declare function meetingCommand(projectRoot: string, options: MeetingOptions): Promise<void>;
export { loadMeetingRuntime, initMeetingRuntime, collectPriorContributions, findRoundTemplate, };
