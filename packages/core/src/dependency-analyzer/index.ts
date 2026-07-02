/**
 * Dependency Analyzer
 *
 * Analyzes task dependencies and produces execution waves (groups of
 * tasks that can execute in parallel). Uses Kahn's algorithm for
 * topological sort with cycle detection.
 *
 * **Conservative strategy**: if a dependency cannot be verified, the
 * task is placed in `serialTasks` rather than being parallelized
 * (per design Decision 3).
 *
 * **Agent-analyzed input (Decision 6)**: the `Task.dependsOn` field
 * should be filled by the agent at task-decomposition stage based on
 * actual code + specs + design analysis, not from template-default values.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A task with its declared dependencies.
 * The `dependsOn` field should contain task IDs that this task must
 * wait for. The agent is responsible for filling this based on
 * project-specific analysis (per Decision 6).
 */
export interface Task {
  id: string;
  description: string;
  dependsOn: string[];
}

export interface ExecutionPlan {
  /** waves[0] = first wave (no dependencies), waves[1] = second, etc. */
  waves: string[][];
  /** Dependency edges: { from: dependency, to: dependent } */
  edges: Array<{ from: string; to: string }>;
  /** Tasks that cannot be parallelized (unknown deps) */
  serialTasks: string[];
  /** Detected cycles (each cycle is an array of task IDs) */
  cycles: string[][];
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Analyze tasks with dependencies and produce an execution plan.
 *
 * @param tasks - Array of tasks with `id` and `dependsOn` fields
 * @returns ExecutionPlan with waves, edges, serialTasks, and cycles
 *
 * Conservative: unknown dependencies → task goes to serialTasks.
 * Cycles: detected and reported (no wave generated for cyclic tasks).
 */
export function analyzeTasks(tasks: Task[]): ExecutionPlan {
  if (tasks.length === 0) {
    return { waves: [], edges: [], serialTasks: [], cycles: [] };
  }

  // Step 1: Build task map and detect unknown dependencies (conservative)
  const taskMap = new Map<string, Task>();
  const unknownDeps = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];

  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!taskMap.has(dep)) {
        // Unknown dependency: conservative — mark task as serial
        unknownDeps.add(task.id);
      } else {
        edges.push({ from: dep, to: task.id });
      }
    }
  }

  // Step 2: Kahn's algorithm — produce waves via BFS topological sort
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    if (!unknownDeps.has(task.id)) {
      inDegree.set(task.id, 0);
      adjacency.set(task.id, []);
    }
  }

  // Count in-degree (only from known deps)
  for (const task of tasks) {
    if (unknownDeps.has(task.id)) continue;
    for (const dep of task.dependsOn) {
      if (taskMap.has(dep) && !unknownDeps.has(dep)) {
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        adjacency.get(dep)!.push(task.id);
      }
    }
  }

  // Process waves
  const waves: string[][] = [];
  const visited = new Set<string>();
  let queue = Array.from(inDegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);

  while (queue.length > 0) {
    waves.push([...queue]);
    const nextQueue: string[] = [];

    for (const id of queue) {
      visited.add(id);
      for (const dependent of adjacency.get(id) || []) {
        const newDegree = (inDegree.get(dependent) || 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0 && !visited.has(dependent) && !unknownDeps.has(dependent)) {
          nextQueue.push(dependent);
        }
      }
    }
    queue = nextQueue;
  }

  // Step 3: Detect cycles — any non-visited, non-unknown task is cyclic
  const cycles: string[][] = [];
  for (const task of tasks) {
    if (!visited.has(task.id) && !unknownDeps.has(task.id)) {
      const cycle = findCycle(task.id, taskMap);
      if (cycle.length > 0) {
        // Deduplicate cycles by sorted key
        const key = [...cycle].sort().join(',');
        if (!cycles.some((existing) => [...existing].sort().join(',') === key)) {
          cycles.push(cycle);
        }
      }
    }
  }

  return {
    waves,
    edges,
    serialTasks: Array.from(unknownDeps),
    cycles,
  };
}

/**
 * Find a cycle containing the given task using DFS.
 */
function findCycle(startId: string, taskMap: Map<string, Task>): string[] {
  const path: string[] = [];
  const onPath = new Set<string>();

  function dfs(id: string): boolean {
    if (onPath.has(id)) {
      // Extract cycle from current path
      const idx = path.indexOf(id);
      return idx >= 0;
    }
    if (path.includes(id)) return false;

    path.push(id);
    onPath.add(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        if (dfs(dep)) return true;
      }
    }

    path.pop();
    onPath.delete(id);
    return false;
  }

  if (dfs(startId)) {
    const idx = path.indexOf(startId);
    return idx >= 0 ? path.slice(idx) : [];
  }
  return [];
}
