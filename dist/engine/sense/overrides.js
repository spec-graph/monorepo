"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILD_TARGET_MAP = exports.FACT_DIMENSIONS = void 0;
exports.parseBuildTargets = parseBuildTargets;
exports.parseProfileOverrides = parseProfileOverrides;
exports.collectOverrides = collectOverrides;
exports.FACT_DIMENSIONS = [
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
exports.BUILD_TARGET_MAP = {
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
function normalizeList(input) {
    if (!input)
        return [];
    const arr = Array.isArray(input) ? input : [input];
    return arr
        .flatMap((s) => s.split(","))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
// Expand --build targets into dimension overrides. Later targets win on
// conflict, with a warning so the user knows which value survived.
function parseBuildTargets(input) {
    const overrides = {};
    const warnings = [];
    for (const target of normalizeList(input)) {
        const map = exports.BUILD_TARGET_MAP[target.toLowerCase()];
        if (!map) {
            warnings.push(`unknown build target '${target}' — known: ${Object.keys(exports.BUILD_TARGET_MAP).join(", ")}`);
            continue;
        }
        for (const [dim, value] of Object.entries(map)) {
            if (overrides[dim] !== undefined && overrides[dim] !== value) {
                warnings.push(`build target '${target}' sets ${dim}=${value}, overriding earlier ${dim}=${overrides[dim]}`);
            }
            overrides[dim] = value;
        }
    }
    return { overrides, warnings };
}
// Parse --profile-override key=value pairs. Invalid keys are warned and dropped.
function parseProfileOverrides(input) {
    const overrides = {};
    const warnings = [];
    for (const pair of normalizeList(input)) {
        const eq = pair.indexOf("=");
        if (eq < 0) {
            warnings.push(`malformed override '${pair}' — expected key=value`);
            continue;
        }
        const key = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (!exports.FACT_DIMENSIONS.includes(key)) {
            warnings.push(`unknown dimension '${key}' — valid: ${exports.FACT_DIMENSIONS.join(", ")}`);
            continue;
        }
        if (!value) {
            warnings.push(`empty value for '${key}' — ignored`);
            continue;
        }
        overrides[key] = value;
    }
    return { overrides, warnings };
}
// Combine build-target overrides with explicit --profile-override pairs.
// Explicit pairs have higher precedence than build shorthand.
function collectOverrides(build, profileOverride) {
    const fromBuild = parseBuildTargets(build);
    const fromExplicit = parseProfileOverrides(profileOverride);
    return {
        overrides: { ...fromBuild.overrides, ...fromExplicit.overrides },
        warnings: [...fromBuild.warnings, ...fromExplicit.warnings],
    };
}
//# sourceMappingURL=overrides.js.map