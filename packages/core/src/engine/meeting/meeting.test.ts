import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MeetingDecl,
  MeetingRuntime,
  MeetingTranscript,
} from "../../types/index";
import {
  loadMeetingRuntime,
  saveMeetingRuntime,
  initMeetingRuntime,
  initAdHocMeeting,
  resolveMeetingDecl,
  recordContribution,
  advanceRound,
  completeMeeting,
  abandonMeeting,
  collectPriorContributions,
  findRoundTemplate,
  meetingRuntimePath,
} from "./index";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "spec-graph-meeting-"));
}

function makeMeetingDecl(overrides: Partial<MeetingDecl> = {}): MeetingDecl {
  return {
    id: "requirements-meeting",
    description: "Requirements roundtable",
    purpose: "Discuss requirements",
    participants: [
      { agent_id: "pm", role: "core", perspective: "user needs" },
      { agent_id: "architect", role: "core", perspective: "feasibility" },
    ],
    rounds: [
      {
        number: 1,
        phase: "diverge",
        objective: "Initial perspectives",
        prompt: "Share",
        speakers: [],
      },
      {
        number: 2,
        phase: "challenge",
        objective: "Question",
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
    output_artifacts: ["requirement/proposal"],
    on_actions: ["propose", "specify"],
    min_rounds: 2,
    max_rounds: 10,
    ...overrides,
  };
}

describe("meeting runtime I/O", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
    await fs.mkdir(path.join(projectRoot, ".spec-graph", "meetings"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("loadMeetingRuntime returns null when file does not exist", async () => {
    const result = await loadMeetingRuntime(projectRoot, "nonexistent");
    expect(result).toBeNull();
  });

  it("initMeetingRuntime creates in_progress state with round 1", async () => {
    const meeting = makeMeetingDecl();
    const runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      "propose",
      "propose",
    );

    expect(runtime.meeting_id).toBe("requirements-meeting");
    expect(runtime.status).toBe("in_progress");
    expect(runtime.current_round).toBe(1);
    expect(runtime.current_phase).toBe("diverge");
    expect(runtime.participants).toEqual([]);
    expect(runtime.rounds).toEqual([]);
    expect(runtime.current_round_contributions).toEqual([]);
    expect(runtime.convergence_summary).toBeNull();
    expect(runtime.triggered_by_action).toBe("propose");
    expect(runtime.triggered_by_stage).toBe("propose");

    // Persisted to disk
    const loaded = await loadMeetingRuntime(
      projectRoot,
      "requirements-meeting",
    );
    expect(loaded).not.toBeNull();
    expect(loaded!.meeting_id).toBe("requirements-meeting");
  });

  it("initMeetingRuntime throws when meeting has no rounds", async () => {
    const meeting = makeMeetingDecl({ rounds: [] });
    await expect(
      initMeetingRuntime(projectRoot, meeting, "propose", "propose"),
    ).rejects.toThrow(/no rounds declared/);
  });

  it("saveMeetingRuntime then loadMeetingRuntime roundtrip", async () => {
    const runtime: MeetingRuntime = {
      meeting_id: "test-meeting",
      status: "in_progress",
      started_at: "2026-06-27T00:00:00.000Z",
      completed_at: null,
      current_round: 2,
      current_phase: "challenge",
      participants: ["pm"],
      rounds: [
        {
          round: 1,
          phase: "diverge",
          contributions: [
            {
              participant: "pm",
              type: "statement",
              content: "I think X",
              round: 1,
            },
          ],
        },
      ],
      current_round_contributions: [],
      convergence_summary: null,
      open_questions: [],
      triggered_by_action: "propose",
      triggered_by_stage: "propose",
    };

    await saveMeetingRuntime(projectRoot, runtime);
    const loaded = await loadMeetingRuntime(projectRoot, "test-meeting");

    expect(loaded).toEqual(runtime);
  });

  it("recordContribution adds to current round and tracks participants", async () => {
    const meeting = makeMeetingDecl();
    let runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      "propose",
      "propose",
    );

    runtime = await recordContribution(projectRoot, meeting, runtime, {
      participant: "pm",
      type: "statement",
      content: "User wants a thermostat",
    });

    expect(runtime.current_round_contributions).toHaveLength(1);
    expect(runtime.current_round_contributions[0].participant).toBe("pm");
    expect(runtime.current_round_contributions[0].type).toBe("statement");
    expect(runtime.current_round_contributions[0].round).toBe(1);
    expect(runtime.participants).toContain("pm");

    // Add second contribution from another participant
    runtime = await recordContribution(projectRoot, meeting, runtime, {
      participant: "architect",
      type: "question",
      content: "What MCU target?",
      targets: ["pm"],
    });

    expect(runtime.current_round_contributions).toHaveLength(2);
    expect(runtime.participants).toEqual(["pm", "architect"]);
    expect(runtime.current_round_contributions[1].targets).toEqual(["pm"]);
  });

  it("advanceRound freezes current round into rounds[] and increments", async () => {
    const meeting = makeMeetingDecl();
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
    runtime = await loadMeetingRuntime(projectRoot, "requirements-meeting")!;
    runtime = await advanceRound(projectRoot, meeting, runtime!);

    expect(runtime.current_round).toBe(2);
    expect(runtime.current_phase).toBe("challenge");
    expect(runtime.rounds).toHaveLength(1);
    expect(runtime.rounds[0].round).toBe(1);
    expect(runtime.rounds[0].phase).toBe("diverge");
    expect(runtime.rounds[0].contributions).toHaveLength(1);
    expect(runtime.current_round_contributions).toHaveLength(0);
  });

  it("advanceRound throws if current round has no contributions", async () => {
    const meeting = makeMeetingDecl();
    const runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      "propose",
      "propose",
    );

    await expect(advanceRound(projectRoot, meeting, runtime)).rejects.toThrow(
      /has no contributions/,
    );
  });

  it("advanceRound throws if meeting not in_progress", async () => {
    const meeting = makeMeetingDecl();
    const runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      "propose",
      "propose",
    );
    runtime.status = "completed";

    await expect(advanceRound(projectRoot, meeting, runtime)).rejects.toThrow(
      /not in_progress/,
    );
  });

  it("advanceRound repeats last phase when past declared templates (dynamic extension)", async () => {
    const meeting = makeMeetingDecl({
      rounds: [
        {
          number: 1,
          phase: "diverge",
          objective: "Initial",
          prompt: "Share",
          speakers: [],
        },
      ],
    });
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
    runtime = (await loadMeetingRuntime(projectRoot, meeting.id))!;
    runtime = await advanceRound(projectRoot, meeting, runtime);

    // Round 2 has no declared template → repeat 'diverge'
    expect(runtime.current_round).toBe(2);
    expect(runtime.current_phase).toBe("diverge");
  });

  it("completeMeeting freezes current round, marks completed, returns transcript", async () => {
    const meeting = makeMeetingDecl();
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
    runtime = (await loadMeetingRuntime(projectRoot, meeting.id))!;
    const transcript = await completeMeeting(projectRoot, runtime, {
      convergence_summary: "We agreed on X.",
      open_questions: ["Y unresolved"],
      output_artifacts: ["requirement/proposal"],
    });

    expect(transcript.meeting_id).toBe("requirements-meeting");
    expect(transcript.completed_at).not.toBeNull();
    expect(transcript.rounds).toHaveLength(1);
    expect(transcript.participants).toEqual(["pm"]);
    expect(transcript.convergence_summary).toBe("We agreed on X.");
    expect(transcript.open_questions).toEqual(["Y unresolved"]);
    expect(transcript.output_artifacts).toEqual(["requirement/proposal"]);

    const loaded = await loadMeetingRuntime(
      projectRoot,
      "requirements-meeting",
    );
    expect(loaded!.status).toBe("completed");
  });

  it("completeMeeting throws if not in_progress", async () => {
    const meeting = makeMeetingDecl();
    const runtime = await initMeetingRuntime(
      projectRoot,
      meeting,
      "propose",
      "propose",
    );
    runtime.status = "completed";

    await expect(
      completeMeeting(projectRoot, runtime, { convergence_summary: "X" }),
    ).rejects.toThrow(/not in_progress/);
  });

  it("abandonMeeting marks abandoned with reason and freezes partial round", async () => {
    const meeting = makeMeetingDecl();
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
    runtime = (await loadMeetingRuntime(projectRoot, meeting.id))!;
    runtime = await abandonMeeting(projectRoot, runtime, "user interrupted");

    expect(runtime.status).toBe("abandoned");
    expect(runtime.convergence_summary).toBe("[ABANDONED] user interrupted");
    expect(runtime.rounds).toHaveLength(1); // current round was frozen
    expect(runtime.current_round_contributions).toHaveLength(0);
  });

  it("collectPriorContributions returns contributions from rounds before the given round", async () => {
    const runtime: MeetingRuntime = {
      meeting_id: "test",
      status: "in_progress",
      started_at: "2026-06-27T00:00:00.000Z",
      completed_at: null,
      current_round: 3,
      current_phase: "converge",
      participants: ["pm", "architect"],
      rounds: [
        {
          round: 1,
          phase: "diverge",
          contributions: [
            {
              participant: "pm",
              type: "statement",
              content: "round 1 pm",
              round: 1,
            },
            {
              participant: "architect",
              type: "statement",
              content: "round 1 arch",
              round: 1,
            },
          ],
        },
        {
          round: 2,
          phase: "challenge",
          contributions: [
            {
              participant: "pm",
              type: "challenge",
              content: "round 2 pm",
              round: 2,
              targets: ["architect"],
            },
          ],
        },
      ],
      current_round_contributions: [
        {
          participant: "pm",
          type: "statement",
          content: "current round 3",
          round: 3,
        },
      ],
      convergence_summary: null,
      open_questions: [],
      triggered_by_action: "propose",
      triggered_by_stage: "propose",
    };

    const prior = collectPriorContributions(runtime, 3);
    expect(prior).toHaveLength(3);
    expect(prior.map((c) => c.content)).toEqual([
      "round 1 pm",
      "round 1 arch",
      "round 2 pm",
    ]);
  });

  it("findRoundTemplate returns declared template or undefined for dynamic rounds", () => {
    const meeting = makeMeetingDecl();

    expect(findRoundTemplate(meeting, 1)?.phase).toBe("diverge");
    expect(findRoundTemplate(meeting, 2)?.phase).toBe("challenge");
    expect(findRoundTemplate(meeting, 99)).toBeUndefined();
  });

  it("meetingRuntimePath produces expected path", () => {
    const p = meetingRuntimePath("/proj", "my-meeting");
    expect(p).toBe(
      path.join("/proj", ".spec-graph", "meetings", "my-meeting.yaml"),
    );
  });
});

describe("ad-hoc meetings (coordinator-initiated)", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("initAdHocMeeting creates in_progress runtime with default round templates", async () => {
    const runtime = await initAdHocMeeting(projectRoot, {
      meeting_id: "ad-hoc-auth-design",
      purpose: "Decide on auth strategy: JWT vs session cookies",
      participants: [
        { agent_id: "architect", perspective: "system design" },
        { agent_id: "pm", perspective: "user experience" },
      ],
    });

    expect(runtime.meeting_id).toBe("ad-hoc-auth-design");
    expect(runtime.status).toBe("in_progress");
    expect(runtime.triggered_by_action).toBe("ad-hoc");
    expect(runtime.triggered_by_stage).toBe("ad-hoc");
    expect(runtime.ad_hoc_decl).toBeDefined();
    expect(runtime.ad_hoc_decl!.id).toBe("ad-hoc-auth-design");
    expect(runtime.ad_hoc_decl!.purpose).toContain("auth strategy");
    expect(runtime.ad_hoc_decl!.rounds).toHaveLength(3); // default diverge/challenge/converge
    expect(runtime.ad_hoc_decl!.on_actions).toEqual([]); // ad-hoc: not triggered by any action
    expect(runtime.ad_hoc_decl!.min_rounds).toBe(1);
    expect(runtime.ad_hoc_decl!.max_rounds).toBe(5);
  });

  it("initAdHocMeeting respects custom min/max rounds", async () => {
    const runtime = await initAdHocMeeting(projectRoot, {
      meeting_id: "custom-rounds",
      purpose: "test",
      participants: [{ agent_id: "pm", perspective: "x" }],
      min_rounds: 3,
      max_rounds: 8,
    });

    expect(runtime.ad_hoc_decl!.min_rounds).toBe(3);
    expect(runtime.ad_hoc_decl!.max_rounds).toBe(8);
  });

  it("initAdHocMeeting supports expert_role participants (no agent_id)", async () => {
    const runtime = await initAdHocMeeting(projectRoot, {
      meeting_id: "expert-meeting",
      purpose: "Compliance question",
      participants: [
        { expert_role: "compliance-officer", perspective: "regulatory" },
        { agent_id: "architect", perspective: "feasibility" },
      ],
    });

    expect(runtime.ad_hoc_decl!.participants).toHaveLength(2);
    expect(runtime.ad_hoc_decl!.participants[0].expert_role).toBe(
      "compliance-officer",
    );
    expect(runtime.ad_hoc_decl!.participants[1].agent_id).toBe("architect");
  });

  it("ad-hoc meeting supports full record/advance/complete lifecycle", async () => {
    const runtime = await initAdHocMeeting(projectRoot, {
      meeting_id: "lifecycle-test",
      purpose: "Test the lifecycle",
      participants: [
        { agent_id: "pm", perspective: "p1" },
        { agent_id: "architect", perspective: "p2" },
      ],
    });

    // Use the ad_hoc_decl as the meeting decl for lifecycle ops
    const meeting = runtime.ad_hoc_decl!;

    let rt = await recordContribution(projectRoot, meeting, runtime, {
      participant: "pm",
      type: "statement",
      content: "I think X",
    });
    rt = await advanceRound(projectRoot, meeting, rt);
    expect(rt.current_round).toBe(2);

    rt = await recordContribution(projectRoot, meeting, rt, {
      participant: "architect",
      type: "challenge",
      content: "But Y",
      targets: ["pm"],
    });
    const transcript = await completeMeeting(projectRoot, rt, {
      convergence_summary: "Agreed on Z",
      open_questions: [],
    });

    expect(transcript.meeting_id).toBe("lifecycle-test");
    expect(transcript.rounds).toHaveLength(2);
    expect(transcript.participants).toEqual(["pm", "architect"]);
    expect(transcript.convergence_summary).toBe("Agreed on Z");
  });

  it("resolveMeetingDecl returns declared meeting from graph first", async () => {
    const declaredMeeting = makeMeetingDecl({ id: "graph-meeting" });
    const graph = { meetings: [declaredMeeting] };

    const result = await resolveMeetingDecl(
      projectRoot,
      graph,
      "graph-meeting",
    );

    expect(result).not.toBeNull();
    expect(result!.isAdHoc).toBe(false);
    expect(result!.decl.id).toBe("graph-meeting");
  });

  it("resolveMeetingDecl falls back to ad_hoc_decl in runtime file", async () => {
    await initAdHocMeeting(projectRoot, {
      meeting_id: "ad-hoc-fallback",
      purpose: "test",
      participants: [{ agent_id: "pm", perspective: "x" }],
    });
    const graph = { meetings: [] }; // not declared in graph

    const result = await resolveMeetingDecl(
      projectRoot,
      graph,
      "ad-hoc-fallback",
    );

    expect(result).not.toBeNull();
    expect(result!.isAdHoc).toBe(true);
    expect(result!.decl.id).toBe("ad-hoc-fallback");
  });

  it("resolveMeetingDecl returns null when meeting does not exist", async () => {
    const graph = { meetings: [] };
    const result = await resolveMeetingDecl(projectRoot, graph, "nonexistent");
    expect(result).toBeNull();
  });
});
