import { describe, expect, it } from "vitest";
import { runCheck } from "./index";
import { CheckDecl } from "../../types/index";

function makeCheck(command: string): CheckDecl {
  return {
    id: "test-check",
    kind: "test",
    command,
  };
}

describe("Check Engine", () => {
  it("should mark dry-run checks as passed without executing the command", async () => {
    const result = await runCheck(makeCheck("exit 1"), {
      cwd: process.cwd(),
      dryRun: true,
    });

    expect(result.status).toBe("passed");
    expect(result.exit_code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("should pass when the command exits with zero", async () => {
    const result = await runCheck(makeCheck("node -e \"console.log('ok')\""), {
      cwd: process.cwd(),
    });

    expect(result.status).toBe("passed");
    expect(result.exit_code).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
  });

  it("should fail when the command exits with non-zero", async () => {
    const result = await runCheck(
      makeCheck("node -e \"console.error('bad'); process.exit(2)\""),
      {
        cwd: process.cwd(),
      },
    );

    expect(result.status).toBe("failed");
    expect(result.exit_code).toBe(2);
    expect(result.stderr.trim()).toBe("bad");
  });

  it("should fail with exit code 124 when the command times out", async () => {
    const result = await runCheck(
      makeCheck('node -e "setTimeout(() => {}, 1000)"'),
      {
        cwd: process.cwd(),
        timeoutMs: 50,
      },
    );

    expect(result.status).toBe("failed");
    expect(result.exit_code).toBe(124);
    expect(result.stderr).toContain("Command timed out after 50ms");
  });
});
