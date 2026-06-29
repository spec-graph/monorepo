# @spec-graph/server

HTTP/WebSocket server for spec-graph Web UI. Real-time state monitoring and command execution.

## Installation

```bash
npm install -g @spec-graph/server
```

## Usage

```bash
# Start server
spec-graph-server

# Custom port
SPEC_GRAPH_SERVER_PORT=3000 spec-graph-server

# Custom workspace
SPEC_GRAPH_WORKSPACE=~/projects spec-graph-server
```

## API

- `GET /api/health` - Health check
- `GET /api/projects` - List all projects
- `GET /api/projects/:id/state` - Get project machine state
- `GET /api/projects/:id/graph` - Get project graph
- `POST /api/projects/:id/command` - Execute CLI command

## WebSocket

Connect to `ws://localhost:3001` for real-time state updates.

## License

MIT
