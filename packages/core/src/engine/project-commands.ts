/**
 * Project Commands Configuration
 *
 * Maps placeholder commands (<test-command>, <lint-command>, etc.)
 * to actual commands for a specific project.
 *
 * Stored in .spec-graph/commands.yaml
 * Generated during init (or manually edited).
 *
 * Priority: commands.yaml > Sense detection > unresolved (skip)
 */

import path from "node:path";
import fs from "node:fs/promises";
import { writeYaml, readYaml } from "../utils/yaml";

export interface ProjectCommands {
  /** Tech stack identifier (typescript, python, go, rust, etc.) */
  stack?: string;
  /** Command mappings */
  commands: Record<string, string>;
  /** Custom commands not covered by defaults */
  custom?: Record<string, string>;
}

/**
 * Preset command configurations by tech stack.
 * Used during init to bootstrap commands.yaml.
 */
export const STACK_PRESETS: Record<string, { label: string; commands: Record<string, string> }> = {
  typescript: {
    label: "TypeScript (Node.js)",
    commands: {
      "<test-command>": "npx vitest run",
      "<lint-command>": "npx eslint .",
      "<typecheck-command>": "npx tsc --noEmit",
      "<build-command>": "npx tsc",
    },
  },
  javascript: {
    label: "JavaScript (Node.js)",
    commands: {
      "<test-command>": "npx jest",
      "<lint-command>": "npx eslint .",
      "<build-command>": "npx webpack --mode production",
    },
  },
  python: {
    label: "Python",
    commands: {
      "<test-command>": "pytest",
      "<lint-command>": "ruff check .",
      "<typecheck-command>": "mypy .",
      "<build-command>": "python -m build",
    },
  },
  go: {
    label: "Go",
    commands: {
      "<test-command>": "go test ./...",
      "<lint-command>": "golangci-lint run",
      "<build-command>": "go build ./...",
    },
  },
  rust: {
    label: "Rust",
    commands: {
      "<test-command>": "cargo test",
      "<lint-command>": "cargo clippy",
      "<build-command>": "cargo build",
    },
  },
  java: {
    label: "Java (Maven)",
    commands: {
      "<test-command>": "mvn test",
      "<lint-command>": "mvn checkstyle:check",
      "<build-command>": "mvn package",
    },
  },
  "java-gradle": {
    label: "Java (Gradle)",
    commands: {
      "<test-command>": "./gradlew test",
      "<lint-command>": "./gradlew checkstyleMain",
      "<build-command>": "./gradlew build",
    },
  },
  kotlin: {
    label: "Kotlin (Gradle)",
    commands: {
      "<test-command>": "./gradlew test",
      "<build-command>": "./gradlew build",
    },
  },
  "cpp-cmake": {
    label: "C/C++ (CMake)",
    commands: {
      "<test-command>": "ctest",
      "<lint-command>": "cppcheck .",
      "<build-command>": "cmake --build build",
    },
  },
  "cpp-make": {
    label: "C/C++ (Make)",
    commands: {
      "<test-command>": "make test",
      "<lint-command>": "cppcheck .",
      "<build-command>": "make",
    },
  },
  dotnet: {
    label: ".NET (C#/F#)",
    commands: {
      "<test-command>": "dotnet test",
      "<build-command>": "dotnet build",
    },
  },
  ruby: {
    label: "Ruby",
    commands: {
      "<test-command>": "rspec",
      "<lint-command>": "rubocop",
      "<build-command>": "gem build",
    },
  },
  php: {
    label: "PHP",
    commands: {
      "<test-command>": "vendor/bin/phpunit",
      "<lint-command>": "vendor/bin/phpcs",
    },
  },
  swift: {
    label: "Swift",
    commands: {
      "<test-command>": "swift test",
      "<build-command>": "swift build",
    },
  },
  generic: {
    label: "Generic / Other",
    commands: {
      "<test-command>": "echo 'Configure test command in .spec-graph/commands.yaml'",
      "<lint-command>": "echo 'Configure lint command in .spec-graph/commands.yaml'",
    },
  },
};

/**
 * Load project commands from .spec-graph/commands.yaml.
 * Returns null if file doesn't exist.
 */
export async function loadProjectCommands(
  projectRoot: string,
): Promise<ProjectCommands | null> {
  const commandsPath = path.join(projectRoot, ".spec-graph", "commands.yaml");
  try {
    return await readYaml<ProjectCommands>(commandsPath);
  } catch {
    return null;
  }
}

/**
 * Save project commands to .spec-graph/commands.yaml.
 */
export async function saveProjectCommands(
  projectRoot: string,
  commands: ProjectCommands,
): Promise<void> {
  const commandsPath = path.join(projectRoot, ".spec-graph", "commands.yaml");
  await writeYaml(commandsPath, commands);
}

/**
 * Generate commands.yaml from a stack preset.
 */
export async function generateCommandsFromStack(
  projectRoot: string,
  stack: string,
): Promise<ProjectCommands> {
  const preset = STACK_PRESETS[stack] || STACK_PRESETS.generic;
  const config: ProjectCommands = {
    stack,
    commands: { ...preset.commands },
  };
  await saveProjectCommands(projectRoot, config);
  return config;
}

// Note: detectStackFromSignals removed — spec-graph no longer scans repo.
// AI agent analyzes the project and passes --stack explicitly.
