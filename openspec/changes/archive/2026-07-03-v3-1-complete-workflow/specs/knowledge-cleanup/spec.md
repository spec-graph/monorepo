# Knowledge Cleanup — Capability Spec

## ADDED Requirements

### Requirement: Zombie Stage Archive

knowledge base SHALL 归档不在 FSM 中的 stage 目录，只保留 FSM 中定义的 9 个 stage。

#### Scenario: Archive zombie stages

WHEN P3 阶段执行
THEN spec-graph SHALL 将以下目录移动到 `knowledge/archived/`：
  - `knowledge/stages/requirement-analysis/` → `knowledge/archived/requirement-analysis/`
  - `knowledge/stages/user-stories/` → `knowledge/archived/user-stories/`
  - `knowledge/stages/ui-design/` → `knowledge/archived/ui-design/`
  - `knowledge/stages/dev-stories/` → `knowledge/archived/dev-stories/`
AND 文件 SHALL 保留（不删除）
AND `knowledge/stages/` SHALL 只包含 FSM 的 9 个 stage 目录

#### Scenario: Knowledge loader skips archived

WHEN knowledge-base loader 扫描 `knowledge/stages/`
THEN SHALL 不加载 `knowledge/archived/` 目录
AND SHALL 不加载不在 STAGES 中的 stage 目录
AND 行为 SHALL 和只有 9 个 stage 目录时一致

#### Scenario: Archived knowledge still accessible

WHEN 用户需要参考 archived stage 的内容
THEN 文件 SHALL 仍然存在于 `knowledge/archived/`
AND SHALL 可通过路径直接读取（不通过 knowledge-base API）
AND 文档 SHALL 说明 archived 目录的用途

### Requirement: Knowledge Base Validation

knowledge base SHALL 提供验证接口，检查 stage 目录和 FSM 定义的一致性。

#### Scenario: Validate knowledge base

WHEN 运行 `spec-graph validate --knowledge`
THEN SHALL 检查 `knowledge/stages/` 下的每个目录
AND SHALL 报告不在 FSM STAGES 中的目录（warning）
AND SHALL 报告在 FSM STAGES 中但缺少 gate.yaml 的 stage（error）
AND SHALL 返回验证结果（pass/warn/fail）

#### Scenario: Clean knowledge base

WHEN knowledge base 只有 9 个有效 stage 目录
AND 每个 stage 都有 gate.yaml
THEN validate SHALL 返回 pass
AND 无 warning
