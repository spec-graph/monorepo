/**
 * External Coordination — delegate execution to external AI agents.
 *
 * spec-graph is a brain, not hands. All execution (writing code, writing
 * documents, running tests) is delegated to external agents (Claude Code,
 * Codex, Gemini CLI, etc.) via pluggable adapters.
 *
 * The adapter interface:
 *   invoke(prompt, config) → AgentResponse
 *   parseResponse(raw) → StructuredResult
 *
 * Built-in adapters:
 *   - claude-code (via `claude -p`)
 *   - codex (stub, via `codex exec`)
 */

import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfig {
  /** Registered adapter id ('claude-code', 'codex', 'gemini', or custom) */
  adapterId: string;
  /** Max time to wait for agent response (ms). Default: 300000 (5 min) */
  timeoutMs?: number;
  /** Model override (if supported by adapter) */
  model?: string;
  /** Extra args passed to the agent CLI */
  args?: Record<string, unknown>;
}

export interface AgentResponse {
  raw: string;
  artifacts: Array<{ path: string; content: string }>;
  status: 'success' | 'failure' | 'partial' | 'timeout' | 'parse-error' | 'agent-not-found';
  error?: string;
  /** Duration in ms */
  durationMs?: number;
}

export interface StructuredResult {
  artifacts: Array<{ path: string; content: string }>;
  selfCheck?: {
    acceptanceCriteriaMet: boolean;
    notes?: string;
  };
}

export interface AgentAdapter {
  /** Unique id for this adapter (e.g., 'claude-code') */
  id: string;
  /** Invoke the agent with a prompt. Returns the full agent output. */
  invoke(prompt: string, config: AgentConfig): Promise<AgentResponse>;
  /** Parse raw agent output into structured artifacts + self-check */
  parseResponse(raw: string): Promise<StructuredResult>;
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

const adapterRegistry = new Map<string, AgentAdapter>();

export function registerAdapter(adapter: AgentAdapter): void {
  adapterRegistry.set(adapter.id, adapter);
}

export function getAdapter(adapterId: string): AgentAdapter | undefined {
  return adapterRegistry.get(adapterId);
}

export function listAdapters(): string[] {
  return Array.from(adapterRegistry.keys());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Invoke an agent by adapter id.
 *
 * Looks up the adapter, calls its invoke method, and returns the result.
 * Times out after `config.timeoutMs` (default: 5 minutes).
 */
export async function invokeAgent(
  prompt: string,
  config: AgentConfig
): Promise<AgentResponse> {
  const adapter = adapterRegistry.get(config.adapterId);
  if (!adapter) {
    return {
      raw: '',
      artifacts: [],
      status: 'failure',
      error: `Unknown adapter: ${config.adapterId}. Available: ${Array.from(adapterRegistry.keys()).join(', ')}`,
    };
  }

  const startTime = Date.now();

  try {
    const timeoutMs = config.timeoutMs || 300_000; // 5 min default
    const timeoutPromise = new Promise<AgentResponse>((_, reject) =>
      setTimeout(
        () =>
          reject(
            Object.assign(new Error('Agent invocation timed out'), { code: 'TIMEOUT' })
          ),
        timeoutMs
      )
    );

    const invokePromise = adapter.invoke(prompt, config);
    const result = await Promise.race([invokePromise, timeoutPromise]);
    result.durationMs = Date.now() - startTime;
    return result;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'TIMEOUT') {
      return {
        raw: '',
        artifacts: [],
        status: 'timeout',
        error: `Agent ${config.adapterId} timed out after ${config.timeoutMs || 300000}ms`,
        durationMs: Date.now() - startTime,
      };
    }
    return {
      raw: '',
      artifacts: [],
      status: 'failure',
      error: `Agent ${config.adapterId} failed: ${error.message}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Parse a raw agent response into structured format.
 */
export async function parseResponse(
  adapterId: string,
  raw: string
): Promise<StructuredResult> {
  const adapter = adapterRegistry.get(adapterId);
  if (!adapter) {
    return { artifacts: [] };
  }
  return adapter.parseResponse(raw);
}

// ---------------------------------------------------------------------------
// Claude Code Adapter
// ---------------------------------------------------------------------------

/**
 * Create and register a Claude Code adapter.
 *
 * Invokes `claude -p "<prompt>" --output-format text`.
 * Checks that `claude` is available on PATH before invoking.
 */
export function createClaudeCodeAdapter(): AgentAdapter {
  const adapter: AgentAdapter = {
    id: 'claude-code',

    async invoke(prompt: string, config: AgentConfig): Promise<AgentResponse> {
      // Check claude is available
      const claudePath = findCommand('claude');
      if (!claudePath) {
        return {
          raw: '',
          artifacts: [],
          status: 'agent-not-found',
          error: 'Claude Code (claude) not found on PATH. Install with: npm install -g @anthropic-ai/claude-code',
        };
      }

      // Build args
      const args = ['-p', prompt, '--output-format', 'text'];
      if (config.model) {
        args.push('--model', config.model);
      }
      if (config.args) {
        for (const [key, value] of Object.entries(config.args)) {
          if (typeof value === 'string') {
            args.push(`--${key}`, value);
          } else if (typeof value === 'boolean' && value) {
            args.push(`--${key}`);
          }
        }
      }

      return runProcess(claudePath, args);
    },

    async parseResponse(raw: string): Promise<StructuredResult> {
      return parseAgentOutput(raw);
    },
  };

  registerAdapter(adapter);
  return adapter;
}

// ---------------------------------------------------------------------------
// Codex Adapter (stub)
// ---------------------------------------------------------------------------

export function createCodexAdapter(): AgentAdapter {
  const adapter: AgentAdapter = {
    id: 'codex',

    async invoke(prompt: string, config: AgentConfig): Promise<AgentResponse> {
      const codexPath = findCommand('codex');
      if (!codexPath) {
        return {
          raw: '',
          artifacts: [],
          status: 'agent-not-found',
          error: 'Codex CLI (codex) not found on PATH.',
        };
      }

      const args = ['exec', prompt];
      return runProcess(codexPath, args);
    },

    async parseResponse(raw: string): Promise<StructuredResult> {
      return parseAgentOutput(raw);
    },
  };

  registerAdapter(adapter);
  return adapter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command with args, capture stdout/stderr, return AgentResponse.
 */
function runProcess(cmd: string, args: string[]): Promise<AgentResponse> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString('utf-8');
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString('utf-8');
    });

    child.on('close', (code) => {
      const hasOutput = stdout.trim().length > 0;
      if (code === 0 && hasOutput) {
        resolve({
          raw: stdout,
          artifacts: extractArtifacts(stdout),
          status: 'success',
        });
      } else if (code === 0 && !hasOutput) {
        resolve({
          raw: stderr || stdout,
          artifacts: [],
          status: 'partial',
          error: 'Agent returned exit code 0 but no stdout output',
        });
      } else {
        resolve({
          raw: stdout || stderr,
          artifacts: [],
          status: 'failure',
          error: `Agent exited with code ${code}: ${stderr || stdout}`,
        });
      }
    });

    child.on('error', (err) => {
      resolve({
        raw: stdout,
        artifacts: [],
        status: 'failure',
        error: `Failed to start agent: ${err.message}`,
      });
    });
  });
}

/**
 * Find a command on PATH.
 */
function findCommand(cmd: string): string | null {
  const paths = (process.env.PATH || '').split(path.delimiter);
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
      : [''];

  for (const dir of paths) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, cmd + ext);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch {
        // Permission errors, etc. — skip
      }
    }
  }

  // Also check common global npm paths
  const npmPrefix = process.env.npm_config_prefix || '';
  for (const base of [npmPrefix, os.homedir() + '/.npm-global', '/usr/local', '/usr']) {
    for (const ext of extensions) {
      const fullPath = path.join(base, 'bin', cmd + ext);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Extract artifacts (file paths and content) from raw agent output.
 *
 * Looks for code blocks with file path markers:
 *   ```filepath
 *   content
 *   ```
 *
 * Or the pattern: `Writing: path/to/file` followed by content.
 */
function extractArtifacts(raw: string): Array<{ path: string; content: string }> {
  const artifacts: Array<{ path: string; content: string }> = [];

  // Pattern 1: fenced code blocks with file path
  const fenced = raw.match(/```(\S+)\n([\s\S]*?)```/g);
  if (fenced) {
    for (const block of fenced) {
      const match = block.match(/```(\S+)\n([\s\S]*?)```/);
      if (match) {
        const [, maybePath, content] = match;
        // If the lang specifier looks like a file path (contains / or .ext)
        if (maybePath.includes('/') || maybePath.match(/\.\w{1,6}$/)) {
          artifacts.push({ path: maybePath, content: content.trim() });
        }
      }
    }
  }

  // Pattern 2: "Writing: path" or "Created: path" markers
  const writeMarker = raw.match(/(?:Writing|Created|Saved)\s*[:：]\s*(\S+)/gi);
  if (writeMarker) {
    for (const marker of writeMarker) {
      const match = marker.match(/(?:Writing|Created|Saved)\s*[:：]\s*(\S+)/i);
      if (match) {
        artifacts.push({ path: match[1], content: '' });
      }
    }
  }

  return artifacts;
}

/**
 * Parse raw agent output into a StructuredResult.
 *
 * Extracts artifacts and looks for a self-check section.
 */
function parseAgentOutput(raw: string): StructuredResult {
  const artifacts = extractArtifacts(raw);

  // Look for self-check section
  const selfCheckMatch = raw.match(/(?:Self[- ]?Check|Acceptance)[\s\S]*?(?:\n\n|\n##|\n```|$)/i);
  const hasSelfCheck = selfCheckMatch
    ? selfCheckMatch[0].toLowerCase().includes('met') ||
      selfCheckMatch[0].toLowerCase().includes('pass') ||
      selfCheckMatch[0].toLowerCase().includes('all criteria')
    : undefined;

  return {
    artifacts,
    selfCheck: selfCheckMatch
      ? {
          acceptanceCriteriaMet: hasSelfCheck ?? false,
          notes: selfCheckMatch[0].trim(),
        }
      : undefined,
  };
}
