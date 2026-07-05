# dispatch-cli: dispatch CLI passes graphPath

## Requirement: dispatch CLI explicitly passes graph.yaml path

The `spec-graph dispatch` CLI command MUST pass the composed graph.yaml path to `generateDispatchManifest()`, so it uses the composed graph as the primary source for agent configs.

### Scenario: graph.yaml exists at .spec-graph/graph.yaml

**Given** `.spec-graph/graph.yaml` exists (from compose or init)
**When** `spec-graph dispatch --session <id> --json` runs
**Then** `generateDispatchManifest()` receives graphPath pointing to `.spec-graph/graph.yaml`
**And** pack agent configs are loaded from graph.yaml

### Scenario: graph.yaml does not exist

**Given** `.spec-graph/graph.yaml` does not exist
**When** `spec-graph dispatch --session <id> --json` runs
**Then** `generateDispatchManifest()` falls back to inline pack scanning
**And** a warning is logged: `graph.yaml not found`

### Scenario: graph.yaml is malformed

**Given** `.spec-graph/graph.yaml` exists but contains invalid YAML
**When** dispatch loads agent configs from it
**Then** `loadPackAgentsFromGraph()` returns empty config
**And** dispatch falls back to inline pack scanning (if packs available)
**And** no crash occurs

### Scenario: graph.yaml has no agents section

**Given** `.spec-graph/graph.yaml` exists but has no `agents` or `agent_bindings` fields
**When** dispatch loads agent configs
**Then** empty agents and bindings are returned
**And** dispatch generates a valid manifest with fallback prompts

## Implementation Notes

- File: `packages/cli/src/commands/dispatch.ts`
- Add: `import * as path from 'node:path'`
- Add: `const graphPath = path.join(process.cwd(), '.spec-graph', 'graph.yaml');`
- Pass graphPath as 4th argument to `generateDispatchManifest(sessionId, process.cwd(), undefined, graphPath)`
- No changes to `generateDispatchManifest()` signature or behavior
