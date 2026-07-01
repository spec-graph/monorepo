import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { sense } from './index.js';

describe('sense', () => {
  // Test against packages/core which has full devDependencies
  const projectRoot = process.cwd();

  it('detects TypeScript language', () => {
    const profile = sense(projectRoot);
    expect(profile.language).toBe('TypeScript');
    expect(profile.runtime).toBe('Node.js');
    expect(profile.buildTool).toBe('tsc');
  });

  it('detects test framework', () => {
    const profile = sense(projectRoot);
    expect(profile.testFramework).toBe('vitest');
  });

  it('detects brownfield with existing tests', () => {
    const profile = sense(projectRoot);
    expect(profile.brownfield).toBe(true);
  });

  it('handles non-existent directory gracefully', () => {
    const profile = sense('/non/existent/path/xyz123');
    expect(profile.brownfield).toBe(false);
    expect(profile.language).toBeNull();
  });

  it('returns valid profile with all 9 fields', () => {
    const profile = sense(projectRoot);
    expect(profile).toHaveProperty('language');
    expect(profile).toHaveProperty('framework');
    expect(profile).toHaveProperty('runtime');
    expect(profile).toHaveProperty('testFramework');
    expect(profile).toHaveProperty('buildTool');
    expect(profile).toHaveProperty('existingFeatures');
    expect(profile).toHaveProperty('brownfield');
    expect(profile).toHaveProperty('existingTests');
    expect(profile).toHaveProperty('hints');
  });
});
