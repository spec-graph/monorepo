import { describe, it, expect } from 'vitest';
import { analyzeTasks } from './index.js';

describe('dependency-analyzer', () => {
  it('returns empty plan for empty task list', () => {
    const plan = analyzeTasks([]);
    expect(plan.waves).toEqual([]);
    expect(plan.edges).toEqual([]);
    expect(plan.serialTasks).toEqual([]);
    expect(plan.cycles).toEqual([]);
  });

  it('places tasks with no dependencies in wave 1', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: [] },
      { id: 'C', description: 'C', dependsOn: [] },
    ]);
    expect(plan.waves.length).toBe(1);
    expect(plan.waves[0].sort()).toEqual(['A', 'B', 'C']);
  });

  it('places dependent task in later wave', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: [] },
      { id: 'C', description: 'C', dependsOn: ['A'] },
    ]);
    expect(plan.waves.length).toBe(2);
    expect(plan.waves[0].sort()).toEqual(['A', 'B']);
    expect(plan.waves[1]).toEqual(['C']);
  });

  it('handles linear chain (all serial)', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: ['A'] },
      { id: 'C', description: 'C', dependsOn: ['B'] },
    ]);
    expect(plan.waves.length).toBe(3);
    expect(plan.waves[0]).toEqual(['A']);
    expect(plan.waves[1]).toEqual(['B']);
    expect(plan.waves[2]).toEqual(['C']);
  });

  it('produces correct edges', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: ['A'] },
    ]);
    expect(plan.edges).toEqual([{ from: 'A', to: 'B' }]);
  });

  it('conservative: unknown dependencies → serialTasks', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: ['UNKNOWN'] },
      { id: 'C', description: 'C', dependsOn: [] },
    ]);
    expect(plan.serialTasks).toEqual(['B']);
    expect(plan.waves[0].sort()).toEqual(['A', 'C']);
  });

  it('detects cycles', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: ['B'] },
      { id: 'B', description: 'B', dependsOn: ['A'] },
    ]);
    expect(plan.cycles.length).toBeGreaterThan(0);
  });

  it('handles self-dependency as cycle', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: ['A'] },
    ]);
    expect(plan.cycles.length).toBeGreaterThan(0);
  });

  it('handles complex graph with multiple waves', () => {
    const plan = analyzeTasks([
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: ['A'] },
      { id: 'C', description: 'C', dependsOn: [] },
      { id: 'D', description: 'D', dependsOn: ['B', 'C'] },
      { id: 'E', description: 'E', dependsOn: [] },
    ]);
    expect(plan.waves.length).toBe(3);
    expect(plan.waves[0].sort()).toEqual(['A', 'C', 'E']);
    expect(plan.waves[1]).toEqual(['B']);
    expect(plan.waves[2]).toEqual(['D']);
  });
});
