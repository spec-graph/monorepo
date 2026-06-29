import { describe, it, expect } from "vitest";
import { deriveStoryStatus, getUnitStats } from "./execution-units";
import { ChangeDescriptor } from "../types/index";

function makeChange(
  executionUnits?: any[],
): ChangeDescriptor {
  return {
    id: "change-1",
    title: "Test",
    description: "Test change",
    created_at: "2026-06-28T00:00:00.000Z",
    type: "feature",
    priority: "medium",
    scope: {},
    impact: { risk_level: "low" },
    status: "in_progress",
    execution_units: executionUnits,
  };
}

describe("execution-units: deriveStoryStatus", () => {
  it("returns pending when execution_units is undefined", () => {
    const change = makeChange();
    expect(deriveStoryStatus(change)).toBe("pending");
  });

  it("returns pending when execution_units is empty", () => {
    const change = makeChange([]);
    expect(deriveStoryStatus(change)).toBe("pending");
  });

  it("returns completed when all units are completed", () => {
    const change = makeChange([
      { id: "unit-1", name: "Unit 1", status: "completed" },
      { id: "unit-2", name: "Unit 2", status: "completed" },
    ]);
    expect(deriveStoryStatus(change)).toBe("completed");
  });

  it("returns failed when any unit is failed", () => {
    const change = makeChange([
      { id: "unit-1", name: "Unit 1", status: "completed" },
      { id: "unit-2", name: "Unit 2", status: "failed" },
    ]);
    expect(deriveStoryStatus(change)).toBe("failed");
  });

  it("returns in_progress when any unit is in_progress", () => {
    const change = makeChange([
      { id: "unit-1", name: "Unit 1", status: "completed" },
      { id: "unit-2", name: "Unit 2", status: "in_progress" },
    ]);
    expect(deriveStoryStatus(change)).toBe("in_progress");
  });

  it("returns pending when all units are pending", () => {
    const change = makeChange([
      { id: "unit-1", name: "Unit 1", status: "pending" },
      { id: "unit-2", name: "Unit 2", status: "pending" },
    ]);
    expect(deriveStoryStatus(change)).toBe("pending");
  });

  it("prioritizes failed over in_progress", () => {
    const change = makeChange([
      { id: "unit-1", name: "Unit 1", status: "failed" },
      { id: "unit-2", name: "Unit 2", status: "in_progress" },
    ]);
    expect(deriveStoryStatus(change)).toBe("failed");
  });
});

describe("execution-units: getUnitStats", () => {
  it("returns all zeros when execution_units is undefined", () => {
    const change = makeChange();
    expect(getUnitStats(change)).toEqual({
      total: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
    });
  });

  it("counts units by status", () => {
    const change = makeChange([
      { id: "unit-1", name: "Unit 1", status: "pending" },
      { id: "unit-2", name: "Unit 2", status: "in_progress" },
      { id: "unit-3", name: "Unit 3", status: "completed" },
      { id: "unit-4", name: "Unit 4", status: "failed" },
    ]);
    expect(getUnitStats(change)).toEqual({
      total: 4,
      pending: 1,
      in_progress: 1,
      completed: 1,
      failed: 1,
    });
  });

  it("handles mixed statuses", () => {
    const change = makeChange([
      { id: "unit-1", name: "Unit 1", status: "pending" },
      { id: "unit-2", name: "Unit 2", status: "pending" },
      { id: "unit-3", name: "Unit 3", status: "in_progress" },
      { id: "unit-4", name: "Unit 4", status: "completed" },
      { id: "unit-5", name: "Unit 5", status: "completed" },
    ]);
    expect(getUnitStats(change)).toEqual({
      total: 5,
      pending: 2,
      in_progress: 1,
      completed: 2,
      failed: 0,
    });
  });
});
