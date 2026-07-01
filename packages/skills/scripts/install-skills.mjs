#!/usr/bin/env node
/**
 * install-skills.mjs — Copy spec-graph SKILL.md files to Claude Code
 *
 * Copies skills from packages/skills/ to:
 *   - ~/.claude/skills/ (global, default)
 *   - .claude/skills/    (project-local, with --local flag)
 *
 * Usage:
 *   node install-skills.mjs            # global install
 *   node install-skills.mjs --local    # project-local install
 */

import { readdirSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isLocal = process.argv.includes('--local');
const targetDir = isLocal
  ? join(process.cwd(), '.claude', 'skills')
  : join(homedir(), '.claude', 'skills');

const skillsDir = join(__dirname, '..');

console.log(`Installing spec-graph skills to: ${targetDir}`);
console.log(`${isLocal ? '(project-local)' : '(global)'}`);

const entries = readdirSync(skillsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith('spec-graph-'));

if (entries.length === 0) {
  console.log('No spec-graph skill directories found.');
  process.exit(0);
}

let installed = 0;
for (const entry of entries) {
  const src = join(skillsDir, entry.name, 'SKILL.md');
  if (!existsSync(src)) {
    console.log(`  ⚠ ${entry.name}: no SKILL.md found, skipping`);
    continue;
  }

  const destDir = join(targetDir, entry.name);
  const dest = join(destDir, 'SKILL.md');

  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);

  console.log(`  ✓ ${entry.name}`);
  installed++;
}

console.log(`\n${installed} skills installed.`);
console.log(`Run \`/spec-graph-plan\` in Claude Code to get started.`);
