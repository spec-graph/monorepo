/**
 * Sense — streamlined project profiling (8 dimensions).
 *
 * Scans a project root directory and produces a ProjectProfile used
 * in the MAY layer of prompts to give agents context about the project.
 *
 * Dimensions:
 *   1. language       — primary programming language
 *   2. framework      — detected framework (Express, React, etc.)
 *   3. runtime        — Node.js, Python, etc.
 *   4. test_framework — vitest, pytest, etc.
 *   5. build_tool     — tsc, webpack, etc.
 *   6. existing_features — list of detected features/modules
 *   7. brownfield     — true if project has existing code
 *   8. existing_tests — test file count
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectProfile {
  language: string | null;
  framework: string | null;
  runtime: string | null;
  testFramework: string | null;
  buildTool: string | null;
  existingFeatures: string[];
  brownfield: boolean;
  existingTests: number;
  /** Raw hints from the scanner (for prompt context) */
  hints: string[];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Analyze a project root and return a ProjectProfile.
 *
 * @param projectRoot — project root directory (default: process.cwd())
 */
export function sense(projectRoot?: string): ProjectProfile {
  const root = projectRoot || process.cwd();

  const profile: ProjectProfile = {
    language: null,
    framework: null,
    runtime: 'Node.js', // spec-graph targets Node projects primarily
    testFramework: null,
    buildTool: null,
    existingFeatures: [],
    brownfield: false,
    existingTests: 0,
    hints: [],
  };

  // 1. Read package.json
  const pkg = readPackageJson(root);
  if (pkg) {
    // Language: detect from package.json
    if (pkg.dependencies?.typescript || pkg.devDependencies?.typescript) {
      profile.language = 'TypeScript';
      profile.buildTool = 'tsc';
      profile.hints.push('TypeScript project — use strict types');
    } else {
      profile.language = 'JavaScript';
    }

    // Framework detection
    if (pkg.dependencies?.express || pkg.devDependencies?.express) {
      profile.framework = 'Express';
      profile.existingFeatures.push('HTTP server');
      profile.hints.push('Express framework detected');
    }
    if (pkg.dependencies?.react || pkg.devDependencies?.react) {
      profile.framework = profile.framework ? `${profile.framework}/React` : 'React';
      profile.existingFeatures.push('React UI');
      profile.hints.push('React detected');
    }
    if (pkg.dependencies?.next) {
      profile.framework = 'Next.js';
      profile.existingFeatures.push('Next.js app');
      profile.hints.push('Next.js framework detected');
    }

    // Test framework
    if (pkg.devDependencies?.vitest) {
      profile.testFramework = 'vitest';
      profile.hints.push('vitest test framework');
    } else if (pkg.devDependencies?.jest) {
      profile.testFramework = 'jest';
      profile.hints.push('jest test framework');
    } else if (pkg.devDependencies?.mocha) {
      profile.testFramework = 'mocha';
      profile.hints.push('mocha test framework');
    }

    // Build tool
    if (pkg.devDependencies?.webpack) {
      profile.buildTool = 'webpack';
    } else if (pkg.devDependencies?.vite) {
      profile.buildTool = 'vite';
    }

    // Existing features from dependencies
    const featureHints: Record<string, string> = {
      bcrypt: 'password hashing',
      'jsonwebtoken': 'JWT auth',
      passport: 'authentication',
      mongoose: 'MongoDB',
      sequelize: 'Sequelize ORM',
      prisma: 'Prisma ORM',
      axios: 'HTTP client',
      dotenv: 'env config',
      cors: 'CORS',
      helmet: 'security headers',
      morgan: 'HTTP logging',
      winston: 'logging',
      zod: 'schema validation',
      yup: 'schema validation',
      joi: 'schema validation',
    };
    for (const [dep, feature] of Object.entries(featureHints)) {
      if (pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]) {
        if (!profile.existingFeatures.includes(feature)) {
          profile.existingFeatures.push(feature);
        }
      }
    }
  }

  // 2. Detect brownfield
  const srcDir = path.join(root, 'src');
  if (fs.existsSync(srcDir)) {
    try {
      const files = countSourceFiles(srcDir, 5);
      profile.brownfield = files > 3; // more than 3 source files = brownfield
      if (profile.brownfield) {
        profile.hints.push(`Brownfield project — ${files}+ source files`);
      }
    } catch {
      // Permission errors — skip
    }
  }

  // 3. Count tests
  const testDirs = ['test', 'tests', '__tests__', 'spec'];
  for (const testDir of testDirs) {
    const testPath = path.join(root, testDir);
    if (fs.existsSync(testPath)) {
      try {
        profile.existingTests = countTestFiles(testPath, 3);
        profile.hints.push(`${profile.existingTests}+ test files in ${testDir}/`);
        break;
      } catch {}
    }
  }
  // Also check for inline tests (*.test.ts)
  if (profile.existingTests === 0 && fs.existsSync(srcDir)) {
    try {
      profile.existingTests = countTestFiles(srcDir, 3);
      if (profile.existingTests > 0) {
        profile.hints.push(`${profile.existingTests}+ inline test files`);
      }
    } catch {}
  }

  // 4. Detect common patterns
  const hasRoutes = fs.existsSync(path.join(root, 'src', 'routes'));
  const hasControllers = fs.existsSync(path.join(root, 'src', 'controllers'));
  const hasModels = fs.existsSync(path.join(root, 'src', 'models'));
  const hasMiddleware = fs.existsSync(path.join(root, 'src', 'middleware'));
  const hasConfig = fs.existsSync(path.join(root, 'src', 'config'));

  if (hasRoutes) profile.existingFeatures.push('REST routes');
  if (hasControllers) profile.existingFeatures.push('Controllers');
  if (hasModels) profile.existingFeatures.push('Data models');
  if (hasMiddleware) profile.existingFeatures.push('Middleware');
  if (hasConfig) profile.existingFeatures.push('Config files');

  return profile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readPackageJson(root: string): Record<string, any> | null {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}

function countSourceFiles(dir: string, maxDepth: number): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && /\.(ts|js|tsx|jsx|py|go|rs)$/.test(entry.name)) {
      count++;
    } else if (entry.isDirectory() && maxDepth > 0 && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      count += countSourceFiles(path.join(dir, entry.name), maxDepth - 1);
    }
  }
  return count;
}

function countTestFiles(dir: string, maxDepth: number): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
      count++;
    } else if (entry.isDirectory() && maxDepth > 0 && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      count += countTestFiles(path.join(dir, entry.name), maxDepth - 1);
    }
  }
  return count;
}
