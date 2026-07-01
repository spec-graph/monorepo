import { describe, it, expect } from 'vitest';
import { analyzeTasks } from './index.js';

describe('dependency-analyzer', () => {
  it('returns empty plan for empty task list', () => {
    const result = analyzeTasks([]);
    expect(result.waves).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.serialTasks).toEqual([]);
    expect(result.cycles).toEqual([]);
  });

  it('places tasks with no dependencies in wave 1', () => {
    const tasks = [
      { id: 'A', description: 'Task A', dependsOn: [] },
      { id: 'B', description: 'Task B', dependsOn: [] },
      { id: 'C', description: 'Task C', dependsOn: [] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.waves.length).toBe(1);
    expect(result.waves[0].sort()).toEqual(['A', 'B', 'C']);
  });

  it('places dependent task in later wave', () => {
    const tasks = [
      { id: 'A', description: 'Task A', dependsOn: [] },
      { id: 'B', description: 'Task B', dependsOn: [] },
      { id: 'C', description: 'Task C', dependsOn: ['A'] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.waves.length).toBe(2);
    expect(result.waves[0].sort()).toEqual(['A', 'B']);
    expect(result.waves[1]).toEqual(['C']);
  });

  it('handles linear chain (all serial)', () => {
    const tasks = [
      { id: 'A', description: 'Task A', dependsOn: [] },
      { id: 'B', description: 'Task B', dependsOn: ['A'] },
      { id: 'C', description: 'Task C', dependsOn: ['B'] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.waves.length).toBe(3);
    expect(result.waves[0]).toEqual(['A']);
    expect(result.waves[1]).toEqual(['B']);
    expect(result.waves[2]).toEqual(['C']);
  });

  it('produces correct edges', () => {
    const tasks = [
      { id: 'A', description: 'Task A', dependsOn: [] },
      { id: 'B', description: 'Task B', dependsOn: ['A'] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.edges).toEqual([{ from: 'A', to: 'B' }]);
  });

  it('marks tasks with unknown dependencies as serial', () => {
    const tasks = [
      { id: 'A', description: 'Task A', dependsOn: ['UNKNOWN'] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.serialTasks).toEqual(['A']);
    expect(result.waves).toEqual([]);
  });

  it('handles complex graph with multiple waves', () => {
    // A (no deps) → B → D
    // C (no deps) → D
    // E (no deps)
    const tasks = [
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: ['A'] },
      { id: 'C', description: 'C', dependsOn: [] },
      { id: 'D', description: 'D', dependsOn: ['B', 'C'] },
      { id: 'E', description: 'E', dependsOn: [] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.waves.length).toBe(3);
    expect(result.waves[0].sort()).toEqual(['A', 'C', 'E']);
    expect(result.waves[1]).toEqual(['B']);
    expect(result.waves[2]).toEqual(['D']);
  });

  it('detects cycles', () => {
    const tasks = [
      { id: 'A', description: 'A', dependsOn: ['B'] },
      { id: 'B', description: 'B', dependsOn: ['A'] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('handles self-dependency as cycle', () => {
    const tasks = [
      { id: 'A', description: 'A', dependsOn: ['A'] },
    ];
    const result = analyzeTasks(tasks);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('conservative: unknown deps prevent parallelization', () => {
    const tasks = [
      { id: 'A', description: 'A', dependsOn: [] },
      { id: 'B', description: 'B', dependsOn: ['UNKNOWN'] },
      { id: 'C', description: 'C', dependsOn: [] },
    ];
    const result = analyzeTasks(tasks);
    // B is serial, A and C are in wave 1
    expect(result.serialTasks).toEqual(['B']);
    expect(result.waves[0].sort()).toEqual(['A', 'C']);
  });
});
