import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import Table from "cli-table3";
import { Profile, FactDimension } from "../types/index";
import { tryReadYaml, writeYaml } from "../utils/yaml";
import { parseProfileOverrides } from "../engine/sense/overrides";

export interface ProfileOptions {
  subcommand?: string;
  pairs?: string;
}

const PROFILE_PATH = ".spec-graph/profile.yaml";

const DIMENSIONS: FactDimension[] = [
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

export async function profileCommand(
  projectRoot: string,
  options: ProfileOptions,
): Promise<void> {
  const subcommand = options.subcommand || "show";
  switch (subcommand) {
    case "show":
      return showProfile(projectRoot);
    case "review":
      return reviewProfile(projectRoot);
    case "override":
      return applyOverride(projectRoot, options.pairs);
    default:
      console.log(chalk.red(`✗ Unknown subcommand: ${subcommand}`));
      console.log("Available: show, review, override");
      process.exit(1);
  }
}

async function loadProfile(projectRoot: string): Promise<Profile | null> {
  return tryReadYaml<Profile>(path.join(projectRoot, PROFILE_PATH));
}

async function loadOrExit(projectRoot: string): Promise<Profile> {
  const p = await loadProfile(projectRoot);
  if (!p) {
    console.log(
      chalk.red(
        `✗ Profile not found at ${PROFILE_PATH}. Run \`spec-graph sense\` first.`,
      ),
    );
    process.exit(1);
    throw new Error("unreachable");
  }
  return p;
}

async function showProfile(projectRoot: string): Promise<void> {
  const profile = await loadOrExit(projectRoot);

  console.log(
    chalk.bold(
      `\n📊 Profile: ${profile.meta?.source?.prompt || "(unnamed)"}\n`,
    ),
  );
  const reviewed = profile.meta?.source?.reviewed_at;
  console.log(
    `  Reviewed: ${reviewed ? chalk.green(reviewed) : chalk.yellow("NOT REVIEWED (frozen)")}`,
  );
  console.log(`  Created:  ${profile.meta?.created_at || "-"}`);
  console.log("");

  const t = new Table({
    head: ["Dimension", "Value", "Confidence", "Source", "Evidence"],
    style: { head: ["cyan"] },
  });
  for (const dim of DIMENSIONS) {
    const f = profile.facts[dim];
    if (!f) continue;
    const isOverride = profile.overrides?.[dim] !== undefined;
    t.push([
      isOverride ? chalk.magenta(`${dim} (override)`) : dim,
      f.value,
      f.confidence === "high"
        ? chalk.green(f.confidence)
        : chalk.yellow(f.confidence),
      f.source === "override" ? chalk.magenta(f.source) : f.source,
      (f.evidence || "").slice(0, 40),
    ]);
  }
  console.log(t.toString());

  if (profile.overrides && Object.keys(profile.overrides).length > 0) {
    console.log(chalk.bold("\n  🛠  Active Overrides:"));
    for (const [dim, value] of Object.entries(profile.overrides)) {
      console.log(`    • ${dim} = ${value}`);
    }
    console.log("");
  }

  if (!reviewed) {
    console.log(
      chalk.gray(
        "  Run `spec-graph profile review` to freeze after human check.",
      ),
    );
  }
}

async function reviewProfile(projectRoot: string): Promise<void> {
  const profile = await loadOrExit(projectRoot);
  const now = new Date().toISOString();
  profile.meta = profile.meta || {
    created_at: now,
    source: { repo_scan: true, llm_classified: false },
  };
  profile.meta.source = profile.meta.source || {
    repo_scan: true,
    llm_classified: false,
  };
  profile.meta.source.reviewed_at = now;
  await writeYaml(path.join(projectRoot, PROFILE_PATH), profile);
  console.log(chalk.green(`\n✓ Profile frozen at ${now}`));
  console.log(
    chalk.gray(
      "  `compose` will no longer warn about an unreviewed profile.\n",
    ),
  );
}

async function applyOverride(
  projectRoot: string,
  pairs?: string,
): Promise<void> {
  if (!pairs) {
    console.log(
      chalk.red(
        "✗ No overrides provided. Usage: spec-graph profile override criticality=compliance,team=multi",
      ),
    );
    process.exit(1);
  }
  const { overrides, warnings } = parseProfileOverrides(pairs);
  if (Object.keys(overrides).length === 0) {
    console.log(chalk.red("✗ No valid overrides parsed."));
    process.exit(1);
  }

  const profile = await loadOrExit(projectRoot);
  profile.overrides = { ...profile.overrides, ...overrides };
  await writeYaml(path.join(projectRoot, PROFILE_PATH), profile);

  console.log(
    chalk.green(`\n✓ Applied ${Object.keys(overrides).length} override(s):`),
  );
  for (const [dim, value] of Object.entries(overrides)) {
    console.log(`    • ${dim} = ${value}`);
  }
  console.log(
    chalk.gray(
      "\n  Run `spec-graph profile review` to freeze, or `spec-graph compose` to re-compose.\n",
    ),
  );

  if (warnings.length > 0) {
    console.log(chalk.yellow("  Warnings:"));
    for (const w of warnings) console.log(chalk.yellow(`    • ${w}`));
  }
}
