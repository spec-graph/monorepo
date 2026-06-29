/**
 * Tests for Dashboard Engine
 */

import { describe, it, expect } from "vitest";
import { DashboardData, renderTerminalDashboard, renderHtmlDashboard } from "./index";

function makeTestData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    project_name: "test-project",
    current_stage: "implement",
    stage_order: ["specify", "design", "plan", "implement", "review", "accept"],
    artifacts: {
      "requirement/prd": { status: "completed", kind: "requirement" },
      "design/arch": { status: "completed", kind: "design" },
      "plan/tasks": { status: "in_progress", kind: "plan" },
      "impl/code": { status: "pending", kind: "implementation" },
    },
    checks: {
      lint: { status: "passed", layer: "unit" },
      test: { status: "failed", layer: "unit" },
    },
    gates: [
      { id: "entry-implement", passed: true, missing_artifacts: [], failed_checks: [], missing_traces: [] },
      { id: "exit-implement", passed: false, missing_artifacts: ["impl/code"], failed_checks: ["test"], missing_traces: [] },
    ],
    trace_coverage: { total_edges: 10, satisfied: 6, pending: 4 },
    constitution: { version: "1.2.0", principles: 5 },
    active_change: { id: "change-001", title: "Add feature X", type: "feature", priority: "high" },
    stats: {
      total_artifacts: 4,
      completed_artifacts: 2,
      total_checks: 2,
      passed_checks: 1,
      total_gates: 2,
      passed_gates: 1,
    },
    ...overrides,
  };
}

describe("dashboard engine", () => {
  describe("renderTerminalDashboard", () => {
    it("includes project name", () => {
      const output = renderTerminalDashboard(makeTestData());
      expect(output).toContain("test-project");
    });

    it("includes current stage", () => {
      const output = renderTerminalDashboard(makeTestData());
      expect(output).toContain("implement");
    });

    it("includes artifact counts", () => {
      const output = renderTerminalDashboard(makeTestData());
      expect(output).toContain("2/4");
    });

    it("includes gate evaluations", () => {
      const output = renderTerminalDashboard(makeTestData());
      expect(output).toContain("entry-implement");
      expect(output).toContain("exit-implement");
      expect(output).toContain("BLOCKING");
    });

    it("includes progress bars", () => {
      const output = renderTerminalDashboard(makeTestData());
      expect(output).toContain("[");
      expect(output).toMatch(/\d+%/);
    });

    it("includes active change info", () => {
      const output = renderTerminalDashboard(makeTestData());
      expect(output).toContain("Add feature X");
      expect(output).toContain("feature");
    });

    it("includes constitution version", () => {
      const output = renderTerminalDashboard(makeTestData());
      expect(output).toContain("v1.2.0");
    });
  });

  describe("renderHtmlDashboard", () => {
    it("produces valid HTML", () => {
      const html = renderHtmlDashboard(makeTestData());
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
    });

    it("includes project name", () => {
      const html = renderHtmlDashboard(makeTestData());
      expect(html).toContain("test-project");
    });

    it("includes artifact data", () => {
      const html = renderHtmlDashboard(makeTestData());
      expect(html).toContain("requirement/prd");
      expect(html).toContain("completed");
    });

    it("includes gate status", () => {
      const html = renderHtmlDashboard(makeTestData());
      expect(html).toContain("entry-implement");
      expect(html).toContain("passed");
      expect(html).toContain("blocked");
    });

    it("includes pipeline stages", () => {
      const html = renderHtmlDashboard(makeTestData());
      expect(html).toContain("specify");
      expect(html).toContain("accept");
    });

    it("includes progress percentages", () => {
      const html = renderHtmlDashboard(makeTestData());
      expect(html).toContain("50%"); // artifacts
    });
  });
});
