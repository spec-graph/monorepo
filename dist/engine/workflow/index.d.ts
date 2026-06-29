import { Graph } from "../../types/index";
export declare function inferStageOrder(graph: Graph): string[];
export declare function findNextStage(graph: Graph, currentStage: string): string | null;
export declare function isValidTransition(graph: Graph, fromStage: string, toStage: string): boolean;
