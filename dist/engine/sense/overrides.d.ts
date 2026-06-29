import { FactDimension } from "../../types/index";
export declare const FACT_DIMENSIONS: FactDimension[];
export declare const BUILD_TARGET_MAP: Record<string, Partial<Record<FactDimension, string>>>;
export interface OverrideParseResult {
    overrides: Partial<Record<FactDimension, string>>;
    warnings: string[];
}
export declare function parseBuildTargets(input: string[] | string | undefined): OverrideParseResult;
export declare function parseProfileOverrides(input: string[] | string | undefined): OverrideParseResult;
export declare function collectOverrides(build: string[] | string | undefined, profileOverride: string[] | string | undefined): OverrideParseResult;
