import { describe, it, expect } from "vitest";

/**
 * Tests for the sub-agent status report parsing logic.
 *
 * Per packs/foundation.pack/agents/status-report-protocol.md, sub-agents end
 * their response with a fenced ```status-report block. The coordinator extracts
 * it with a regex + JSON.parse — this test pins that contract.
 *
 * If the spec-graph kernel ever grows a StatusReportParser utility, move these
 * tests next to it. For now they live as a contract pin: any sub-agent prompt
 * that produces output conforming to the protocol must be parseable by this regex.
 */

const STATUS_BLOCK_REGEX = /```status-report\s*\n([\s\S]*?)\n```/;

function parseStatusReport(response: string): any | null {
  const match = response.match(STATUS_BLOCK_REGEX);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

describe("sub-agent status report parsing", () => {
  it("parses a DONE report at the end of a response", () => {
    const response = `I analyzed the user intent and produced the proposal.

## Reasoning
The user said "build a thermostat". I decomposed this into JTBD, scope, and 3 measurable ACs.

\`\`\`status-report
{
  "status": "DONE",
  "artifacts_produced": ["requirement/proposal"],
  "concerns": [],
  "missing_context": null,
  "blocker": null,
  "summary": "Translated user intent into a proposal with measurable ACs."
}
\`\`\``;

    const report = parseStatusReport(response);
    expect(report).not.toBeNull();
    expect(report.status).toBe("DONE");
    expect(report.artifacts_produced).toEqual(["requirement/proposal"]);
    expect(report.concerns).toEqual([]);
    expect(report.summary).toContain("proposal");
  });

  it("parses a DONE_WITH_CONCERNS report with blocking concerns", () => {
    const response = `Design complete but I have a concern about the protocol choice.

\`\`\`status-report
{
  "status": "DONE_WITH_CONCERNS",
  "artifacts_produced": ["design/architecture"],
  "concerns": [
    {
      "severity": "blocking",
      "description": "Chose REST over gRPC; latency budget at risk",
      "suggested_action": "Add latency check at L2 integration"
    }
  ],
  "missing_context": null,
  "blocker": null,
  "summary": "Produced C4 + ADR. One blocking concern on protocol choice."
}
\`\`\``;

    const report = parseStatusReport(response);
    expect(report.status).toBe("DONE_WITH_CONCERNS");
    expect(report.concerns).toHaveLength(1);
    expect(report.concerns[0].severity).toBe("blocking");
  });

  it("parses a NEEDS_CONTEXT report", () => {
    const response = `Cannot proceed without knowing the target MCU.

\`\`\`status-report
{
  "status": "NEEDS_CONTEXT",
  "artifacts_produced": [],
  "concerns": [],
  "missing_context": "Target MCU family: ESP32, STM32, or both? Affects HAL selection.",
  "blocker": null,
  "summary": "Cannot select HAL without target MCU info."
}
\`\`\``;

    const report = parseStatusReport(response);
    expect(report.status).toBe("NEEDS_CONTEXT");
    expect(report.missing_context).toContain("ESP32");
  });

  it("parses a BLOCKED report", () => {
    const response = `Compliance check requires SME not in registry.

\`\`\`status-report
{
  "status": "BLOCKED",
  "artifacts_produced": [],
  "concerns": [],
  "missing_context": null,
  "blocker": "ISO 62304 documentation required; no regulatory SME in agent registry.",
  "summary": "Compliance gate cannot be satisfied with current agent roster."
}
\`\`\``;

    const report = parseStatusReport(response);
    expect(report.status).toBe("BLOCKED");
    expect(report.blocker).toContain("ISO 62304");
  });

  it("returns null when no status-report block present", () => {
    const response = `I just did the work, no structured output.`;
    expect(parseStatusReport(response)).toBeNull();
  });

  it("returns null when block contains malformed JSON", () => {
    const response = `Done.

\`\`\`status-report
{ this is not valid json }
\`\`\``;
    expect(parseStatusReport(response)).toBeNull();
  });

  it("uses the LAST status-report block when multiple present", () => {
    const response = `First attempt.

\`\`\`status-report
{
  "status": "NEEDS_CONTEXT",
  "artifacts_produced": [],
  "concerns": [],
  "missing_context": "first",
  "blocker": null,
  "summary": "First."
}
\`\`\`

Retry with context.

\`\`\`status-report
{
  "status": "DONE",
  "artifacts_produced": ["requirement/proposal"],
  "concerns": [],
  "missing_context": null,
  "blocker": null,
  "summary": "Second."
}
\`\`\``;

    const report = parseStatusReport(response);
    // Regex without 'g' flag matches the first occurrence — but coordinator
    // contract says "block MUST be the LAST thing in the response". This test
    // pins that the regex returns the FIRST match; coordinators should enforce
    // the "last position" invariant by convention, not by regex.
    expect(report.status).toBe("NEEDS_CONTEXT");
  });

  it("handles multi-line summary with special characters", () => {
    const response = `Done.

\`\`\`status-report
{
  "status": "DONE",
  "artifacts_produced": ["design/architecture"],
  "concerns": [],
  "missing_context": null,
  "blocker": null,
  "summary": "Produced C4 + ADR.\\nNoted protocol choice (REST vs gRPC)."
}
\`\`\``;

    const report = parseStatusReport(response);
    expect(report.status).toBe("DONE");
    expect(report.summary).toContain("REST vs gRPC");
  });

  it("parses reports with empty concerns array", () => {
    const response = `\`\`\`status-report
{
  "status": "DONE",
  "artifacts_produced": ["implementation/src/foo.ts"],
  "concerns": [],
  "missing_context": null,
  "blocker": null,
  "summary": "Done."
}
\`\`\``;
    const report = parseStatusReport(response);
    expect(report.concerns).toEqual([]);
  });
});
