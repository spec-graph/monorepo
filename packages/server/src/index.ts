#!/usr/bin/env node

import express from "express";
import { WebSocketServer } from "ws";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import chalk from "chalk";

const app = express();
app.use(express.json());

// ── Configuration ──
const PORT = parseInt(process.env.SPEC_GRAPH_SERVER_PORT || "3000", 10);
const WS_PORT = PORT + 1;
const WORKSPACE_PATH = process.env.SPEC_GRAPH_WORKSPACE || process.cwd();

// ── Project Registry ──
interface ProjectState {
  name: string;
  root: string;
  state: any;
  graph: any;
}

const projects = new Map<string, ProjectState>();

function discoverProjects(root: string): void {
  const dirs = fs.readdirSync(root, { withFileTypes: true });
  for (const dir of dirs) {
    if (dir.name.startsWith(".") || dir.name === "node_modules") continue;
    const specGraphDir = path.join(root, dir.name, ".spec-graph");
    if (fs.existsSync(specGraphDir)) {
      const statePath = path.join(specGraphDir, "machine-state.yaml");
      const graphPath = path.join(specGraphDir, "graph.yaml");
      projects.set(dir.name, {
        name: dir.name,
        root: path.join(root, dir.name),
        state: fs.existsSync(statePath) ? yaml.load(fs.readFileSync(statePath, "utf-8")) : null,
        graph: fs.existsSync(graphPath) ? yaml.load(fs.readFileSync(graphPath, "utf-8")) : null,
      });
    }
  }
}

// ── WebSocket ──
const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
  console.log(chalk.green("✓ Client connected"));
  ws.send(JSON.stringify({ type: "projects", count: projects.size }));
});

function broadcast(event: string, data: any): void {
  const msg = JSON.stringify({ type: event, ...data });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

// ── HTTP Routes ──
app.get("/api/health", (_, res) => res.json({ status: "ok", projects: projects.size }));

app.get("/api/projects", (_, res) => {
  res.json([...projects.values()].map((p) => ({ name: p.name, root: p.root })));
});

app.get("/api/projects/:id/state", (req, res) => {
  const p = projects.get(req.params.id);
  if (!p) return res.status(404).json({ error: "Project not found" });
  res.json(p.state);
});

app.get("/api/projects/:id/graph", (req, res) => {
  const p = projects.get(req.params.id);
  if (!p) return res.status(404).json({ error: "Project not found" });
  res.json(p.graph);
});

app.post("/api/projects/:id/command", (req, res) => {
  const p = projects.get(req.params.id);
  if (!p) return res.status(404).json({ error: "Project not found" });
  const { args } = req.body;
  try {
    const output = execSync(`npx spec-graph ${args.join(" ")}`, {
      cwd: p.root,
      encoding: "utf-8",
      timeout: 30000,
    });
    broadcast("command-complete", { project: req.params.id, args });
    res.json({ success: true, output });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── File Watchers ──
function watchProjects(): void {
  for (const [name, p] of projects) {
    const statePath = path.join(p.root, ".spec-graph/machine-state.yaml");
    if (!fs.existsSync(statePath)) continue;
    try {
      const { watch } = require("chokidar");
      watch(statePath, { persistent: true, ignoreInitial: true }).on("change", () => {
        p.state = yaml.load(fs.readFileSync(statePath, "utf-8"));
        broadcast("state-changed", { project: name, state: p.state });
      });
    } catch {
      // chokidar not installed, skip watching
    }
  }
}

// ── Start ──
discoverProjects(WORKSPACE_PATH);
watchProjects();

app.listen(PORT, () => {
  console.log(chalk.bold(`\n  spec-graph server`));
  console.log(chalk.cyan(`  HTTP:  http://localhost:${PORT}`));
  console.log(chalk.cyan(`  WS:    ws://localhost:${WS_PORT}`));
  console.log(chalk.gray(`  Projects: ${projects.size}\n`));
});
