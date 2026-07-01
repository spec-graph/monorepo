/**
 * Dependency Analyzer — analyzes task dependencies and produces execution waves.
 *
 * Conservative strategy: if dependency is uncertain, default to serial.
 * Uses Kahn's algorithm for topological sort with cycle detection.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Task {
  id: string;
  description: string;
  dependsOn: string[];
}

export interface ExecutionPlan {
  waves: string[][]; // waves[0] = first wave, waves[1] = second, etc.
  edges: Array<{ from: string; to: string }>;
  serialTasks: string[]; // tasks that cannot be parallelized (uncertain deps)
  cycles: string[][]; // detected cycles (each is array of task ids)
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Analyze a set of tasks with dependencies and produce an execution plan
 * dividing tasks into waves (parallel execution groups).
 *
 * Conservative strategy: tasks with uncertain dependencies are placed
 * in `serialTasks` rather than parallelized.
 */
export function analyzeTasks(tasks: Task[]): ExecutionPlan {
  if (tasks.length === 0) {
    return { waves: [], edges: [], serialTasks: [], cycles: [] };
  }

  const taskMap = new Map<string, Task>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const task of tasks) {
    adjacency.set(task.id, []);
    inDegree.set(task.id, 0);
  }

  const edges: Array<{ from: string; to: string }> = [];
  const unknownDeps: string[] = [];

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!taskMap.has(dep)) {
        // Unknown dependency — conservative: mark as serial
        unknownDeps.push(task.id);
        continue;
      }
      adjacency.get(dep)!.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      edges.push({ from: dep, to: task.id });
    }
  }

  // Kahn's algorithm for topological sort with cycle detection
  const queue: string[] = [];
  const waves: string[][] = [];
  const visited = new Set<string>();

  // Start with tasks that have no dependencies (in-degree 0)
  for (const [id, degree] of inDegree) {
    if (degree === 0 && !unknownDeps.includes(id)) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    // Process entire current wave (all tasks with in-degree 0)
    const currentWave = [...queue];
    waves.push(currentWave);

    for (const id of currentWave) {
      visited.add(id);
      queue.shift();
    }

    // Reduce in-degree for dependents
    const nextQueue: string[] = [];
    for (const id of currentWave) {
      for (const dependent of adjacency.get(id) || []) {
        const newDegree = (inDegree.get(dependent) || 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0 && !visited.has(dependent) && !unknownDeps.includes(dependent)) {
          nextQueue.push(dependent);
        }
      }
    }
    queue.push(...nextQueue);
  }

  // Detect cycles: any task not visited is part of a cycle
  const cycles: string[][] = [];
  for (const task of tasks) {
    if (!visited.has(task.id) && !unknownDeps.includes(task.id)) {
      // Find the cycle this task belongs to
      const cycle = findCycle(task.id, taskMap, visited);
      if (cycle.length > 0) {
        // Avoid duplicate cycles
        const cycleKey = cycle.sort().join(',');
        const existingCycleKeys = cycles.map((c) => c.sort().join(','));
        if (!existingCycleKeys.includes(cycleKey)) {
          cycles.push(cycle);
        }
      }
    }
  }

  return {
    waves,
    edges,
    serialTasks: unknownDeps,
    cycles,
  };
}

/**
 * Find a cycle containing the given task.
 */
function findCycle(
  startId: string,
  taskMap: Map<string, Task>,
  visited: Set<string>
): string[] {
  const path: string[] = [];
  const onPath = new Set<string>();

  function dfs(id: string): boolean {
    if (onPath.has(id)) {
      // Found cycle — extract it
      const cycleStart = path.indexOf(id);
      return cycleStart >= 0;
    }
    if (visited.has(id)) return false;

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
    // Extract cycle from path
    const cycleStart = path.indexOf(startId);
    return path.slice(cycleStart);
  }
  return [];
}
