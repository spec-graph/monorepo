/**
 * Repo-scan inference rules — shared between the Sense engine and
 * RepoScanClassifier. Each rule maps RepoSignals → a partial ProfileFact
 * for one dimension. Rules with higher priority run first.
 *
 * NOTE: facts that aren't from actual repo evidence use source='fallback'
 * (not 'llm') to honestly reflect that no LLM was involved. Real LLM
 * classification comes from LlmClassifier with source='llm'.
 */
import { FactDimension, ProfileFact } from "../../types/index";
import { RepoSignals } from "./index";
export interface InferenceRule {
    dimension: FactDimension;
    detect: (signals: RepoSignals) => Partial<ProfileFact> | null;
    priority: number;
}
export declare const inferenceRules: InferenceRule[];
