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

export const inferenceRules: InferenceRule[] = [
  // has_ui
  {
    dimension: "has_ui",
    priority: 100,
    detect: (s) => {
      if (s.hasNextConfig || s.hasReact || s.hasVue) {
        return {
          value: "web",
          confidence: "high",
          source: "repo",
          evidence: "React/Vue/Next.js detected",
        };
      }
      if (s.hasPlatformioIni || s.hasArduinoFiles) {
        return {
          value: "none",
          confidence: "high",
          source: "repo",
          evidence: "Embedded project, no UI",
        };
      }
      return {
        value: "none",
        confidence: "low",
        source: "fallback",
        evidence: "No UI framework detected",
      };
    },
  },

  // boundary
  {
    dimension: "boundary",
    priority: 90,
    detect: (s) => {
      if (s.hasOpenApiYaml || s.hasGraphqlSchema || s.hasGrpcProtos) {
        return {
          value: "published-api",
          confidence: "high",
          source: "repo",
          evidence: "API schema detected",
        };
      }
      if (s.hasExportsField) {
        return {
          value: "published-lib",
          confidence: "high",
          source: "repo",
          evidence: "package.json#exports detected",
        };
      }
      return {
        value: "internal",
        confidence: "low",
        source: "fallback",
        evidence: "No public API boundary detected",
      };
    },
  },

  // topology
  {
    dimension: "topology",
    priority: 80,
    detect: (s) => {
      if (s.hasDockerfile && s.hasK8sConfig) {
        return {
          value: "distributed",
          confidence: "high",
          source: "repo",
          evidence: "K8s + Docker detected",
        };
      }
      if (s.hasDockerfile) {
        return {
          value: "federated",
          confidence: "low",
          source: "fallback",
          evidence: "Docker detected, possible multi-service",
        };
      }
      return {
        value: "mono",
        confidence: "low",
        source: "fallback",
        evidence: "No deployment config detected",
      };
    },
  },

  // deployment
  {
    dimension: "deployment",
    priority: 85,
    detect: (s) => {
      if (s.hasPlatformioIni) {
        return {
          value: "firmware",
          confidence: "high",
          source: "repo",
          evidence: "PlatformIO embedded project",
        };
      }
      if (s.hasDockerfile) {
        return {
          value: "hosted-service",
          confidence: "high",
          source: "repo",
          evidence: "Docker detected",
        };
      }
      if (s.hasExportsField) {
        return {
          value: "package",
          confidence: "high",
          source: "repo",
          evidence: "npm package detected",
        };
      }
      return {
        value: "process",
        confidence: "low",
        source: "fallback",
        evidence: "Default deployment: standalone process",
      };
    },
  },

  // consumers
  {
    dimension: "consumers",
    priority: 70,
    detect: (s) => {
      if (s.hasOpenApiYaml && s.hasDockerfile) {
        return {
          value: "external-public",
          confidence: "low",
          source: "fallback",
          evidence: "Public API detected",
        };
      }
      return {
        value: "self",
        confidence: "low",
        source: "fallback",
        evidence: "Default: internal use only",
      };
    },
  },

  // field
  {
    dimension: "field",
    priority: 75,
    detect: (s) => {
      if (s.srcFileCount === 0) {
        return {
          value: "greenfield",
          confidence: "high",
          source: "repo",
          evidence: "No src files detected",
        };
      }
      return {
        value: "brownfield",
        confidence: "high",
        source: "repo",
        evidence: `Found ${s.srcFileCount} source files`,
      };
    },
  },

  // criticality
  {
    dimension: "criticality",
    priority: 65,
    detect: (s) => {
      if (s.testFileCount > 50 && s.hasCiConfig) {
        return {
          value: "standard",
          confidence: "high",
          source: "repo",
          evidence: "CI + extensive tests",
        };
      }
      if (s.srcFileCount === 0) {
        return {
          value: "prototype",
          confidence: "low",
          source: "fallback",
          evidence: "New project, likely prototype",
        };
      }
      return {
        value: "standard",
        confidence: "low",
        source: "fallback",
        evidence: "Default: standard quality",
      };
    },
  },

  // team
  {
    dimension: "team",
    priority: 60,
    detect: () => ({
      value: "small",
      confidence: "low",
      source: "fallback",
      evidence: "Default: small team assumption",
    }),
  },

  // persistence
  {
    dimension: "persistence",
    priority: 95,
    detect: (s) => {
      if (s.hasPrismaSchema) {
        return {
          value: "database",
          confidence: "high",
          source: "repo",
          evidence: "Prisma schema detected",
        };
      }
      return null; // null = dimension not present
    },
  },
];
