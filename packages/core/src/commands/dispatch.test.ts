import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dispatchCommand } from "./dispatch";
import {
  initMeetingRuntime,
  recordContribution,
} from "../engine/meeting/index";
import { readYaml, writeYaml } from "../utils/yaml";
import { Graph } from "../types/index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-dispatch-"));
}

function makeGraphWithAgents(): Graph {
  return {
    version: "1",
    meta: {
      composed_at: new Date().toISOString(),
      profile_hash: "test",
      change_type: "feature",
      packs_used: [],
    },
    artifacts: [{ id: "requirement/proposal", kind: "requirement" }],
    actions: ["propose", "specify", "design", "implement"],
    checks: [],
    gates: [],
    tracks: [],
    pipeline_skeleton: {
      stages: ["propose", "specify", "design", "implement"],
      max_retries: 3,
      on_exhausted: "block",
    },
    acceptance_layers: {},
    agents: [
      {
        id: "pm",
        description: "Product Manager",
        prompt_ref: "agents/pm-agent.md",
        model_tier: "capable",
        input_artifact_kinds: [],
        output_artifact_kinds: ["requirement/*"],
        actions: ["propose", "specify"],
      },
      {
        id: "architect",
        description: "Software Architect",
        prompt_ref: "agents/architect-agent.md",
        model_tier: "capable",
        input_artifact_kinds: ["requirement/*"],
        output_artifact_kinds: ["design/*"],
        actions: ["design"],
      },
    ],
    agent_bindings: [
      { action: "propose", agent_id: "pm", provided_by: "foundation" },
      { action: "specify", agent_id: "pm", provided_by: "foundation" },
      { action: "design", agent_id: "architect", provided_by: "foundation" },
    ],
    meetings: [
      {
        id: "requirements-meeting",
        description: "Requirements roundtable",
        purpose: "Discuss requirements",
        on_actions: ["propose", "specify"],
        min_rounds: 2,
        max_rounds: 10,
        participants: [
          { agent_id: "pm", role: "core", perspective: "user needs" },
          {
            agent_id: "architect",
            role: "core",
            perspective: "technical feasibility",
          },
        ],
        expert_invite_protocol: "agents/expert-invite-protocol.md",
        output_artifacts: ["requirement/proposal"],
        rounds: [
          {
            number: 1,
            phase: "diverge",
            objective: "Initial perspectives",
            prompt: "Share perspective",
            speakers: [],
          },
          {
            number: 2,
            phase: "challenge",
            objective: "Question assumptions",
            prompt: "Challenge",
            speakers: [],
          },
          {
            number: 3,
            phase: "converge",
            objective: "Align",
            prompt: "Summarize",
            speakers: [],
          },
        ],
      },
    ],
  };
}

function makeGraphWithoutAgents(): Graph {
  const graph = makeGraphWithAgents();
  graph.agents = [];
  graph.agent_bindings = [];
  graph.meetings = [];
  return graph;
}

/**
 * Variant with a design/* artifact and a gate requiring it for design→implement transition.
 * Used to test input_artifacts collection: when stage=design and requirement/* artifacts
 * are completed, dispatch suggests produce_artifact design/architecture, which binds to
 * the architect agent (input_artifact_kinds: ['requirement/*']).
 */
function makeGraphWithDesignArtifactAndGate(): Graph {
  const graph = makeGraphWithAgents();
  graph.artifacts = [
    { id: "requirement/proposal", kind: "requirement" },
    { id: "requirement/requirements", kind: "requirement" },
    { id: "design/architecture", kind: "design" },
  ];
  graph.gates = [
    {
      id: "design-exit-gate",
      on_transition: ["design→implement"],
      require_artifacts: ["design/architecture"],
      require_checks: [],
      require_traces: [],
      require_contracts_current: false,
      forbid: [],
      fail_mode: "block",
      enabled: true,
      provided_by: "foundation",
    },
  ];
  return graph;
}

describe("dispatch command — Agent Registry integration", () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "meetings"), {
      recursive: true,
    });
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  });

  it("includes agent_id in dispatch action when agent binding exists", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    // Prime state so dispatch has a stage to work with
    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions.length).toBeGreaterThan(0);
    const action = output.actions[0];
    // When stage is 'propose', agent binding should resolve to 'pm'
    expect(action.agent_id).toBe("pm");
    expect(action.agent_prompt_ref).toBe("agents/pm-agent.md");
    expect(action.model_tier).toBe("capable");
  });

  it("falls back to permission role when no agent binding exists", async () => {
    const graph = makeGraphWithoutAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const action = output.actions[0];
    // No agent binding → agent_id should be undefined, role should be used
    expect(action.agent_id).toBeUndefined();
    expect(action.agent_role).toBeDefined();
  });

  it("includes meeting dispatch when action triggers a meeting", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const action = output.actions[0];
    // 'propose' triggers 'requirements-meeting'
    expect(action.meeting).toBeDefined();
    expect(action.meeting.meeting_id).toBe("requirements-meeting");
    expect(action.meeting.participants.length).toBe(2);
    expect(
      action.meeting.participants.some((p: any) => p.agent_id === "pm"),
    ).toBe(true);
    expect(
      action.meeting.participants.some((p: any) => p.agent_id === "architect"),
    ).toBe(true);
    expect(action.meeting.min_rounds).toBe(2);
    expect(action.meeting.max_rounds).toBe(10);
    expect(action.meeting.rounds.length).toBe(3);
  });

  it("does not include meeting when action does not trigger one", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "design",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const action = output.actions[0];
    // 'design' is not in requirements-meeting.on_actions, so no meeting
    expect(action.meeting).toBeUndefined();
  });

  it("prompt includes meeting orchestration instructions when meeting is triggered", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const prompt = output.actions[0].prompt;
    expect(prompt).toContain("Meeting Orchestration");
    expect(prompt).toContain("requirements-meeting");
    expect(prompt).toContain("Round");
    expect(prompt).toContain("diverge");
    expect(prompt).toContain("converge");
    expect(prompt).toContain("expert");
  });

  it("prompt identifies the agent when agent binding exists", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const prompt = output.actions[0].prompt;
    // propose → pm agent
    expect(prompt).toContain("pm");
    expect(prompt).toContain("capable");
  });

  it("includes next_step field that tells coordinator how to advance workflow", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const action = output.actions[0];
    expect(action.next_step).toBeDefined();
    // next_step should mention re-running dispatch (the loop)
    expect(action.next_step).toContain("spec-graph dispatch");
  });

  it("next_step for perform_stage is an executable re-dispatch command", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const action = output.actions[0];
    // perform_stage's next_step should be a runnable shell command (not a comment block).
    // The sub-agent dispatch itself happens via the Agent tool, not via Bash — so next_step
    // just re-runs dispatch after the coordinator has done its sub-agent work.
    expect(action.type).toBe("perform_stage");
    expect(action.next_step).toContain("spec-graph dispatch --json");
    // Should NOT be a comment-only block (which can't be run via Bash)
    expect(action.next_step.startsWith("#")).toBe(false);
  });

  it("prompt mentions coordinator-protocol.md for loop continuation", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const prompt = output.actions[0].prompt;
    expect(prompt).toContain("coordinator-protocol.md");
    expect(prompt).toContain("Coordinator loop");
  });

  it("includes input_artifacts field in dispatch action (empty when agent has no input kinds)", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    // pm agent (propose stage) has empty input_artifact_kinds → empty input_artifacts
    expect(Array.isArray(output.actions[0].input_artifacts)).toBe(true);
    expect(output.actions[0].input_artifacts).toHaveLength(0);
  });

  it("collects completed artifacts matching agent input_artifact_kinds (glob pattern)", async () => {
    const graph = makeGraphWithDesignArtifactAndGate();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    // Stage = design → architect agent (input_artifact_kinds: ['requirement/*'])
    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "design",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
        "requirement/requirements": {
          id: "requirement/requirements",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const action = output.actions[0];
    // architect's input_artifact_kinds is ['requirement/*'] — both completed requirement artifacts should match
    const inputIds = action.input_artifacts.map((a: any) => a.id);
    expect(inputIds).toContain("requirement/proposal");
    expect(inputIds).toContain("requirement/requirements");
    // Each ref has path resolved
    for (const ref of action.input_artifacts) {
      expect(ref.path).toContain(".spec-graph/artifacts/requirement/");
      expect(ref.path).toMatch(/\.md$/);
      expect(ref.kind).toBe("requirement");
      expect(ref.status).toBe("completed");
    }
  });

  it("skips non-completed artifacts when collecting input_artifacts", async () => {
    const graph = makeGraphWithDesignArtifactAndGate();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "design",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "in_progress",
          produced_by: "pm",
        },
        "requirement/requirements": {
          id: "requirement/requirements",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const inputIds = output.actions[0].input_artifacts.map((a: any) => a.id);
    // in_progress artifact should be excluded
    expect(inputIds).not.toContain("requirement/proposal");
    expect(inputIds).toContain("requirement/requirements");
  });

  it("input_artifacts is empty when no agent binding exists", async () => {
    const graph = makeGraphWithoutAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].input_artifacts).toHaveLength(0);
  });

  it("prompt lists input artifacts when present", async () => {
    const graph = makeGraphWithDesignArtifactAndGate();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "design",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const prompt = output.actions[0].prompt;
    expect(prompt).toContain("Input Artifacts");
    expect(prompt).toContain("requirement/proposal");
  });

  it("prompt follows standardized envelope structure (see agents/prompt-envelope.md)", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const prompt = output.actions[0].prompt;

    // Envelope header
    expect(prompt).toContain("# Spec-Graph Sub-Agent Dispatch");
    // Standardized sections
    expect(prompt).toContain("## Identity");
    expect(prompt).toContain("## System Prompt");
    expect(prompt).toContain("## Task Context");
    expect(prompt).toContain("## Input Artifacts");
    expect(prompt).toContain("## Constraints");
    expect(prompt).toContain("## Completion");
    // System prompt placeholder for coordinator to fill
    expect(prompt).toContain("--- BEGIN SYSTEM PROMPT ---");
    expect(prompt).toContain("--- END SYSTEM PROMPT ---");
    // Status report protocol reference
    expect(prompt).toContain("status-report");
    expect(prompt).toContain("status-report-protocol.md");
    // Agent identity from Agent Registry
    expect(prompt).toContain("**pm**");
    expect(prompt).toContain("agents/pm-agent.md");
  });

  it("prompt envelope includes placeholder for each input artifact when present", async () => {
    const graph = makeGraphWithDesignArtifactAndGate();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "design",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
        "requirement/requirements": {
          id: "requirement/requirements",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const prompt = output.actions[0].prompt;
    // Both artifacts get a placeholder for content
    expect(prompt).toContain("[paste content of");
    expect(prompt).toContain("requirement/proposal");
    expect(prompt).toContain("requirement/requirements");
  });

  it("meeting runtime shows null when meeting not started (fresh)", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].meeting).toBeDefined();
    expect(output.actions[0].meeting.runtime).toBeNull();
    // Prompt indicates fresh start
    expect(output.actions[0].prompt).toContain("Fresh Start");
  });

  it("meeting runtime shows in_progress continuation when meeting has contributions", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    // Initialize the meeting with a contribution (simulating prior dispatch cycle)
    const meeting = graph.meetings[0];
    let runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      "propose",
      "propose",
    );
    await recordContribution(projectRoot, meeting, runtime, {
      participant: "pm",
      type: "statement",
      content: "User wants a thermostat",
    });

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const meetingDispatch = output.actions[0].meeting;
    expect(meetingDispatch.runtime).not.toBeNull();
    expect(meetingDispatch.runtime.status).toBe("in_progress");
    expect(meetingDispatch.runtime.is_continuation).toBe(true);
    expect(meetingDispatch.runtime.current_round).toBe(1);
    expect(meetingDispatch.runtime.current_round_contributions).toHaveLength(1);
    expect(meetingDispatch.runtime.current_round_contributions[0].content).toBe(
      "User wants a thermostat",
    );

    // Prompt includes continuation marker and prior contributions
    const prompt = output.actions[0].prompt;
    expect(prompt).toContain("CONTINUATION");
    expect(prompt).toContain("User wants a thermostat");
    expect(prompt).toContain("spec-graph meeting record");
    expect(prompt).toContain("spec-graph meeting advance");
  });

  it("meeting runtime shows completed when meeting was synthesized", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const meeting = graph.meetings[0];
    let runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      "propose",
      "propose",
    );
    await recordContribution(projectRoot, meeting, runtime, {
      participant: "pm",
      type: "statement",
      content: "X",
    });
    runtime = (await loadMeetingRuntimeForTest(projectRoot, meeting.id))!;
    const { completeMeeting } = await import("../engine/meeting/index");
    await completeMeeting(projectRoot, runtime, {
      convergence_summary: "Agreed on X",
      open_questions: [],
      output_artifacts: ["requirement/proposal"],
    });

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const meetingDispatch = output.actions[0].meeting;
    expect(meetingDispatch.runtime.status).toBe("completed");
    expect(meetingDispatch.runtime.is_continuation).toBe(false);
    expect(output.actions[0].prompt).toContain("already completed");
  });

  it("requires_sub_agent is true for perform_stage actions (LLM work)", async () => {
    const graph = makeGraphWithAgents();
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    // perform_stage → requires_sub_agent: true
    expect(output.actions[0].requires_sub_agent).toBe(true);
    // Prompt is the full sub-agent envelope, not the minimal deterministic one
    expect(output.actions[0].prompt).toContain(
      "# Spec-Graph Sub-Agent Dispatch",
    );
    expect(output.actions[0].prompt).toContain("## Identity");
  });

  it("requires_sub_agent is false for run_check actions (deterministic)", async () => {
    const graph = makeGraphWithAgents();
    // Add a check + gate that requires it
    graph.checks = [
      {
        id: "lint-check",
        kind: "lint",
        command: "npm run lint",
        layer: "unit",
      },
    ];
    graph.gates = [
      {
        id: "lint-gate",
        on_transition: ["propose→specify"],
        require_artifacts: [],
        require_checks: ["lint-check"],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: { "lint-check": { id: "lint-check", status: "failed" } },
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    // run_check → requires_sub_agent: false (coordinator runs `npm run lint` directly)
    expect(output.actions[0].type).toBe("run_check");
    expect(output.actions[0].requires_sub_agent).toBe(false);
    // Prompt is the minimal deterministic form
    expect(output.actions[0].prompt).toContain("DETERMINISTIC");
    expect(output.actions[0].prompt).toContain("Do NOT dispatch a sub-agent");
    expect(output.actions[0].prompt).not.toContain("## Identity");
  });

  it("requires_sub_agent is false for transition actions (deterministic)", async () => {
    const graph = makeGraphWithAgents();
    // Add a gate that's already satisfied → action is transition
    graph.gates = [
      {
        id: "auto-gate",
        on_transition: ["propose→specify"],
        require_artifacts: [],
        require_checks: [],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].type).toBe("transition");
    expect(output.actions[0].requires_sub_agent).toBe(false);
    expect(output.actions[0].prompt).toContain("DETERMINISTIC");
  });

  it("fallback input_artifacts: when no agent binding, produce_artifact collects via producer inference", async () => {
    // Graph without agents → no binding → fallback path
    const graph = makeGraphWithoutAgents();
    // Add artifacts: a completed requirement + a pending design
    graph.artifacts = [
      { id: "requirement/proposal", kind: "requirement" },
      { id: "design/architecture", kind: "design" },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "design",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    const action = output.actions[0];
    // No agent binding → fallback infers input artifacts
    expect(action.agent_id).toBeUndefined();
    // Fallback collects ALL completed artifacts (broad — no producer agents declared either)
    expect(action.input_artifacts.length).toBeGreaterThan(0);
    expect(
      action.input_artifacts.some((a: any) => a.id === "requirement/proposal"),
    ).toBe(true);
  });

  it("fallback input_artifacts: deterministic actions get empty input_artifacts", async () => {
    const graph = makeGraphWithoutAgents();
    graph.checks = [
      { id: "lint", kind: "lint", command: "npm run lint", layer: "unit" },
    ];
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: [],
        require_checks: ["lint"],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: { lint: { id: "lint", status: "failed" } },
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    // run_check → no input_artifacts (deterministic, no sub-agent)
    expect(output.actions[0].type).toBe("run_check");
    expect(output.actions[0].requires_sub_agent).toBe(false);
    expect(output.actions[0].input_artifacts).toHaveLength(0);
  });

  it("check_command exposes the actual CheckDecl.command for run_check actions", async () => {
    const graph = makeGraphWithoutAgents();
    graph.checks = [
      { id: "lint", kind: "lint", command: "npm run lint", layer: "unit" },
    ];
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: [],
        require_checks: ["lint"],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: { lint: { id: "lint", status: "failed" } },
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].type).toBe("run_check");
    // Coordinator can run this directly via Bash without consulting graph.yaml
    expect(output.actions[0].check_command).toBe("npm run lint");
  });

  it("check_command is undefined for non-run_check actions", async () => {
    const graph = makeGraphWithAgents();
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/proposal"],
        require_checks: [],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].type).toBe("produce_artifact");
    expect(output.actions[0].check_command).toBeUndefined();
  });

  it("manifest exposes gate failure details when gate_passed === false", async () => {
    const graph = makeGraphWithoutAgents();
    graph.checks = [
      { id: "lint", kind: "lint", command: "npm run lint", layer: "unit" },
    ];
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/proposal"],
        require_checks: ["lint"],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {}, // missing requirement/proposal
      checks: { lint: { id: "lint", status: "failed" } }, // failed
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.gate_passed).toBe(false);
    // Coordinator reads these to know WHAT failed (not just that gate_passed === false)
    expect(output.missing_artifacts).toContain("requirement/proposal");
    expect(output.failed_checks).toContain("lint");
    expect(Array.isArray(output.missing_traces)).toBe(true);
    expect(Array.isArray(output.forbidden_violations)).toBe(true);
  });

  it("manifest failure arrays are empty when gate_passed === true", async () => {
    const graph = makeGraphWithAgents();
    // gate that's satisfied → no failures
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/proposal"],
        require_checks: [],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {
        "requirement/proposal": {
          id: "requirement/proposal",
          status: "completed",
          produced_by: "pm",
        },
      },
      checks: {},
      history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.gate_passed).toBe(true);
    expect(output.missing_artifacts).toEqual([]);
    expect(output.failed_checks).toEqual([]);
    expect(output.missing_traces).toEqual([]);
    expect(output.forbidden_violations).toEqual([]);
  });

  it("appends dispatch entry to active change audit_log when an in_progress change exists", async () => {
    const graph = makeGraphWithAgents();
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/proposal"],
        require_checks: [],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    // Create an in_progress change descriptor manually
    const changesDir = path.join(projectRoot, ".spec-graph", "changes");
    await fs.mkdir(changesDir, { recursive: true });
    const changeId = "change-test-audit";
    const changePath = path.join(changesDir, `${changeId}.json`);
    await fs.writeFile(
      changePath,
      JSON.stringify(
        {
          id: changeId,
          title: "Test change",
          description: "For audit trail test",
          created_at: new Date().toISOString(),
          type: "feature",
          priority: "medium",
          scope: {},
          impact: { risk_level: "low" },
          status: "in_progress",
          audit_log: [],
        },
        null,
        2,
      ),
    );

    // Silence console.log
    const originalLog = console.log;
    console.log = () => {};
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    // Read the change back — should have a dispatch entry
    const changeContent = JSON.parse(await fs.readFile(changePath, "utf-8"));
    expect(changeContent.audit_log).toBeDefined();
    const dispatchEntries = changeContent.audit_log.filter(
      (e: any) => e.action === "dispatch",
    );
    expect(dispatchEntries.length).toBeGreaterThanOrEqual(1);
    const entry = dispatchEntries[dispatchEntries.length - 1];
    expect(entry.message).toContain("propose");
    expect(entry.message).toContain("produce_artifact");
    expect(entry.message).toContain("requirement/proposal");
    expect(entry.timestamp).toBeDefined();
  });

  it("does not crash when no active change exists (audit is best-effort)", async () => {
    const graph = makeGraphWithAgents();
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/proposal"],
        require_checks: [],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      history: [],
    });

    // No changes dir at all
    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    // Should still produce a valid manifest — no crash
    expect(output).toBeDefined();
    expect(output.actions).toBeDefined();
  });

  it("trace_query exposes trace query details for verify_trace actions", async () => {
    const graph = makeGraphWithAgents();
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: [],
        require_checks: [],
        require_traces: [
          {
            name: "req-to-design",
            from_kind: "requirement",
            to_kind: "design",
            via: ["satisfies"],
            cardinality: "exists",
          },
        ],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].type).toBe("verify_trace");
    // Coordinator reads this to know WHAT trace needs to be created
    expect(output.actions[0].trace_query).toBeDefined();
    expect(output.actions[0].trace_query.name).toBe("req-to-design");
    expect(output.actions[0].trace_query.from_kind).toBe("requirement");
    expect(output.actions[0].trace_query.to_kind).toBe("design");
    expect(output.actions[0].trace_query.via).toEqual(["satisfies"]);
    expect(output.actions[0].trace_query.cardinality).toBe("exists");
  });

  it("trace_query is undefined for non-verify_trace actions", async () => {
    const graph = makeGraphWithAgents();
    graph.gates = [
      {
        id: "g",
        on_transition: ["propose→specify"],
        require_artifacts: ["requirement/proposal"],
        require_checks: [],
        require_traces: [],
        require_contracts_current: false,
        forbid: [],
        fail_mode: "block",
        enabled: true,
        provided_by: "foundation",
      },
    ];
    await writeYaml(path.join(projectRoot, ".spec-graph", "graph.yaml"), graph);

    const statePath = path.join(
      projectRoot,
      ".spec-graph",
      "machine-state.yaml",
    );
    await writeYaml(statePath, {
      current_stage: "propose",
      artifacts: {},
      checks: {},
      stage_history: [],
    });

    let output: any;
    const originalLog = console.log;
    console.log = (data: string) => {
      try {
        output = JSON.parse(data);
      } catch {
        /* not json */
      }
    };
    try {
      await dispatchCommand(projectRoot, { json: true });
    } finally {
      console.log = originalLog;
    }

    expect(output).toBeDefined();
    expect(output.actions[0].type).toBe("produce_artifact");
    expect(output.actions[0].trace_query).toBeUndefined();
  });
});

// Helper for loading runtime in tests
async function loadMeetingRuntimeForTest(
  projectRoot: string,
  meetingId: string,
) {
  const { loadMeetingRuntime } = await import("../engine/meeting/index");
  return loadMeetingRuntime(projectRoot, meetingId);
}
