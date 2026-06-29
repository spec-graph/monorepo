import { FactDimension } from "../../types/index";

export const FACT_DIMENSIONS: FactDimension[] = [
  "has_ui",
  "boundary",
  "topology",
  "deployment",
  "consumers",
  "field",
  "criticality",
  "team",
  "persistence",
];

// Build-target shorthand → fact overrides. `--build=spa,api` expands to the
// union of these maps. Lets users name *what they're building* instead of
// hand-setting individual dimensions.
export const BUILD_TARGET_MAP: Record<
  string,
  Partial<Record<FactDimension, string>>
> = {
  web: { has_ui: "web" },
  spa: { has_ui: "web" },
  gui: { has_ui: "gui" },
  cli: { has_ui: "cli" },
  app: { has_ui: "native" },
  native: { has_ui: "native" },
  desktop: { has_ui: "gui", deployment: "binary" },
  api: { boundary: "published-api" },
  service: { boundary: "published-api", deployment: "hosted-service" },
  server: { deployment: "hosted-service" },
  lib: { boundary: "published-lib", deployment: "package" },
  library: { boundary: "published-lib", deployment: "package" },
  embedded: { deployment: "firmware", has_ui: "none" },
  firmware: { deployment: "firmware", has_ui: "none" },
  plugin: { boundary: "published-lib", deployment: "package" },
};

export interface OverrideParseResult {
  overrides: Partial<Record<FactDimension, string>>;
  warnings: string[];
}

function normalizeList(input: string[] | string | undefined): string[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Expand --build targets into dimension overrides. Later targets win on
// conflict, with a warning so the user knows which value survived.
export function parseBuildTargets(
  input: string[] | string | undefined,
): OverrideParseResult {
  const overrides: Partial<Record<FactDimension, string>> = {};
  const warnings: string[] = [];

  for (const target of normalizeList(input)) {
    const map = BUILD_TARGET_MAP[target.toLowerCase()];
    if (!map) {
      warnings.push(
        `unknown build target '${target}' — known: ${Object.keys(BUILD_TARGET_MAP).join(", ")}`,
      );
      continue;
    }
    for (const [dim, value] of Object.entries(map) as Array<
      [FactDimension, string]
    >) {
      if (overrides[dim] !== undefined && overrides[dim] !== value) {
        warnings.push(
          `build target '${target}' sets ${dim}=${value}, overriding earlier ${dim}=${overrides[dim]}`,
        );
      }
      overrides[dim] = value;
    }
  }

  return { overrides, warnings };
}

// Parse --profile-override key=value pairs. Invalid keys are warned and dropped.
export function parseProfileOverrides(
  input: string[] | string | undefined,
): OverrideParseResult {
  const overrides: Partial<Record<FactDimension, string>> = {};
  const warnings: string[] = [];

  for (const pair of normalizeList(input)) {
    const eq = pair.indexOf("=");
    if (eq < 0) {
      warnings.push(`malformed override '${pair}' — expected key=value`);
      continue;
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!FACT_DIMENSIONS.includes(key as FactDimension)) {
      warnings.push(
        `unknown dimension '${key}' — valid: ${FACT_DIMENSIONS.join(", ")}`,
      );
      continue;
    }
    if (!value) {
      warnings.push(`empty value for '${key}' — ignored`);
      continue;
    }
    overrides[key as FactDimension] = value;
  }

  return { overrides, warnings };
}

// Combine build-target overrides with explicit --profile-override pairs.
// Explicit pairs have higher precedence than build shorthand.
export function collectOverrides(
  build: string[] | string | undefined,
  profileOverride: string[] | string | undefined,
): OverrideParseResult {
  const fromBuild = parseBuildTargets(build);
  const fromExplicit = parseProfileOverrides(profileOverride);
  return {
    overrides: { ...fromBuild.overrides, ...fromExplicit.overrides },
    warnings: [...fromBuild.warnings, ...fromExplicit.warnings],
  };
}
