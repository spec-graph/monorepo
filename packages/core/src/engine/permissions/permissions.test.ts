import { describe, it, expect } from "vitest";
import {
  getPreset,
  isActionAllowed,
  roleForAction,
  resolveFileScope,
  loadPermissions,
  generateClaudeCodeSettings,
  generateOpenCodeSettings,
  DEFAULT_ROLES,
  PermissionConfig,
} from "./index";

describe("permission engine", () => {
  describe("getPreset", () => {
    it("semi-auto allows run_check and transition", () => {
      const config = getPreset("semi-auto");
      expect(config.level).toBe("semi-auto");
      expect(config.allow.auto_execute).toEqual(["run_check", "transition"]);
    });

    it("full-auto allows all action types", () => {
      const config = getPreset("full-auto");
      expect(config.level).toBe("full-auto");
      expect(config.allow.auto_execute).toContain("run_check");
      expect(config.allow.auto_execute).toContain("transition");
      expect(config.allow.auto_execute).toContain("produce_artifact");
      expect(config.allow.auto_execute).toContain("verify_trace");
    });

    it("manual allows nothing", () => {
      const config = getPreset("manual");
      expect(config.level).toBe("manual");
      expect(config.allow.auto_execute).toEqual([]);
    });

    it("all presets include role definitions", () => {
      for (const level of ["full-auto", "semi-auto", "manual"] as const) {
        const config = getPreset(level);
        expect(config.roles["spec-author"]).toBeDefined();
        expect(config.roles["quality-runner"]).toBeDefined();
        expect(config.roles["traceability-reviewer"]).toBeDefined();
        expect(config.roles["governance-reviewer"]).toBeDefined();
        expect(config.roles["workflow-operator"]).toBeDefined();
        expect(config.roles["stage-agent"]).toBeDefined();
      }
    });

    it("manual mode restricts agent tools to read-only", () => {
      const config = getPreset("manual");
      const cc = config.agents["claude-code"];
      expect(cc.auto_approve_tools).not.toContain("Write");
      expect(cc.auto_approve_tools).not.toContain("Edit");
      expect(cc.auto_approve_tools).not.toContain("Bash");
      expect(cc.auto_approve_tools).toContain("Read");
    });
  });

  describe("isActionAllowed", () => {
    it("returns true for run_check in semi-auto", () => {
      const config = getPreset("semi-auto");
      expect(isActionAllowed("run_check", config)).toBe(true);
    });

    it("returns true for transition in semi-auto", () => {
      const config = getPreset("semi-auto");
      expect(isActionAllowed("transition", config)).toBe(true);
    });

    it("returns false for produce_artifact in semi-auto", () => {
      const config = getPreset("semi-auto");
      expect(isActionAllowed("produce_artifact", config)).toBe(false);
    });

    it("returns false for perform_stage in semi-auto", () => {
      const config = getPreset("semi-auto");
      expect(isActionAllowed("perform_stage", config)).toBe(false);
    });

    it("returns false for everything in manual", () => {
      const config = getPreset("manual");
      expect(isActionAllowed("run_check", config)).toBe(false);
      expect(isActionAllowed("transition", config)).toBe(false);
      expect(isActionAllowed("produce_artifact", config)).toBe(false);
    });
  });

  describe("roleForAction", () => {
    it("maps produce_artifact to spec-author", () => {
      expect(roleForAction("produce_artifact")).toBe("spec-author");
    });

    it("maps run_check to quality-runner", () => {
      expect(roleForAction("run_check")).toBe("quality-runner");
    });

    it("maps verify_trace to traceability-reviewer", () => {
      expect(roleForAction("verify_trace")).toBe("traceability-reviewer");
    });

    it("maps resolve_violation to governance-reviewer", () => {
      expect(roleForAction("resolve_violation")).toBe("governance-reviewer");
    });

    it("maps transition to workflow-operator", () => {
      expect(roleForAction("transition")).toBe("workflow-operator");
    });

    it("maps perform_stage to stage-agent", () => {
      expect(roleForAction("perform_stage")).toBe("stage-agent");
    });
  });

  describe("resolveFileScope", () => {
    it("returns role-specific file scope when defined", () => {
      const config = getPreset("semi-auto");
      const scope = resolveFileScope("quality-runner", config);
      expect(scope.read).toContain("src/**");
      expect(scope.write).toEqual([".spec-graph/**"]);
    });

    it("stage-agent has broader write scope", () => {
      const config = getPreset("semi-auto");
      const scope = resolveFileScope("stage-agent", config);
      expect(scope.write).toContain("src/**");
      expect(scope.write).toContain(".spec-graph/**");
    });

    it("workflow-operator has minimal write scope", () => {
      const config = getPreset("semi-auto");
      const scope = resolveFileScope("workflow-operator", config);
      expect(scope.write).toEqual([".spec-graph/machine-state.yaml"]);
    });
  });

  describe("generateClaudeCodeSettings", () => {
    it("semi-auto allows Read/Write/Edit/Glob/Grep/Bash for safe commands", () => {
      const config = getPreset("semi-auto");
      const settings = generateClaudeCodeSettings(config);
      expect(settings.permissions.allow).toContain("Read(*)");
      expect(settings.permissions.allow).toContain("Glob(*)");
      expect(settings.permissions.allow).toContain("Grep(*)");
      expect(settings.permissions.allow).toContain("Write(/src/**)");
      expect(settings.permissions.allow).toContain("Bash(npm *)");
      expect(settings.permissions.allow).toContain("Bash(git status*)");
      // Destructive commands are ask
      expect(settings.permissions.ask).toContain("Bash(git push*)");
      expect(settings.permissions.ask).toContain("Bash(rm *)");
    });

    it("full-auto allows Bash(*)", () => {
      const config = getPreset("full-auto");
      const settings = generateClaudeCodeSettings(config);
      expect(settings.permissions.allow).toContain("Bash(*)");
    });

    it("manual only allows Read/Glob/Grep, asks for Write/Edit", () => {
      const config = getPreset("manual");
      const settings = generateClaudeCodeSettings(config);
      expect(settings.permissions.allow).toContain("Read(*)");
      expect(settings.permissions.allow).toContain("Glob(*)");
      expect(settings.permissions.allow).toContain("Grep(*)");
      expect(settings.permissions.ask).toContain("Write(/*)");
      expect(settings.permissions.ask).toContain("Edit(/*)");
      expect(settings.defaultMode).toBe("default");
    });

    it("always denies sensitive files", () => {
      const config = getPreset("semi-auto");
      const settings = generateClaudeCodeSettings(config);
      expect(settings.permissions.deny).toContain("Read(.env)");
      expect(settings.permissions.deny).toContain("Read(**/*.pem)");
      expect(settings.permissions.deny).toContain("Bash(rm -rf *)");
      expect(settings.permissions.deny).toContain("Bash(sudo *)");
    });
  });

  describe("generateOpenCodeSettings", () => {
    it("semi-auto maps bash with allow/ask/deny pattern map", () => {
      const config = getPreset("semi-auto");
      const settings = generateOpenCodeSettings(config);
      expect(settings.permission.edit).toBe("allow");
      expect(settings.permission.bash["*"]).toBe("ask");
      expect(settings.permission.bash["npm *"]).toBe("allow");
      expect(settings.permission.bash["git push*"]).toBe("ask");
      expect(settings.permission.bash["rm -rf*"]).toBe("deny");
      expect(settings.permission.webfetch).toBe("ask");
    });

    it("full-auto sets all bash to allow", () => {
      const config = getPreset("full-auto");
      const settings = generateOpenCodeSettings(config);
      expect(settings.permission.bash["*"]).toBe("allow");
    });

    it("manual sets all bash to ask", () => {
      const config = getPreset("manual");
      const settings = generateOpenCodeSettings(config);
      expect(settings.permission.edit).toBe("ask");
      expect(settings.permission.bash["*"]).toBe("ask");
    });
  });
});
