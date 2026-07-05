# Worktree 隔离 — Capability Spec

## ADDED Requirements

### Requirement: Worktree Creation on Parallel Dispatch

dispatch 模块 SHALL 在检测到并行 actions 时自动为每个 action 创建 git worktree。

#### Scenario: Parallel implement stage

WHEN `spec-graph dispatch --json` 执行
AND 当前 stage 为 `implement`
AND plan.capabilities.length > 1
THEN dispatch SHALL 为每个 parallel action 创建 git worktree：
  - path: `.spec-graph/worktrees/<session-id>-<action-id>`
  - branch: `spec-graph/<session-id>-<action-id>`
  - base: 当前 HEAD
AND SHALL 写入 `.spec-graph/isolation/worktrees.yaml`
AND manifest action 的 `isolation.mode` SHALL 为 "worktree"
AND manifest action 的 `file_scope.write` SHALL 指向 worktree 路径

#### Scenario: Single action stage (no worktree)

WHEN dispatch 执行
AND 当前 stage 只有 1 个 action
OR 当前 stage 不是 `implement`
THEN dispatch SHALL 不创建 worktree
AND manifest action 的 `isolation.mode` SHALL 为 "shared"
AND manifest action 的 `file_scope.write` SHALL 指向项目根目录

#### Scenario: Worktree creation failure fallback

WHEN git worktree 创建失败（权限/磁盘空间/git 错误）
THEN dispatch SHALL 回退到 `isolation.mode: "shared"`
AND manifest 的 `isolation_summary.warning` SHALL 包含失败原因
AND dispatch SHALL 仍然生成 action（不阻塞 workflow）
AND 系统 SHALL 输出 warning

### Requirement: Worktree Lifecycle Management

spec-graph SHALL 管理 worktree 的完整生命周期（创建 → 验证 → 合并 → 清理）。

#### Scenario: Verify after sub-agent completes

WHEN 协调者运行 `spec-graph worktree verify <unit-id>`
THEN spec-graph SHALL 在 worktree 内执行验证（lint/test/typecheck）
AND 如果验证通过 SHALL 更新 unit status 为 `self_verified`
AND 如果验证失败 SHALL 返回错误 + 验证输出
AND unit status SHALL 写入 `worktrees.yaml`

#### Scenario: Merge after all units verified

WHEN 协调者运行 `spec-graph worktree merge <unit-id>`
AND unit status 为 `self_verified`
THEN spec-graph SHALL 执行 `git merge <worktree-branch>` 到主分支
AND SHALL 运行 file-conflict-analyzer 检测冲突
AND 如果无冲突 SHALL 更新 unit status 为 `merged`
AND 如果合并后测试通过 SHALL 自动清理 worktree（git worktree remove + branch delete）
AND 如果有冲突 SHALL 返回冲突报告

#### Scenario: Abandon failed unit

WHEN 协调者运行 `spec-graph worktree abandon <unit-id>`
THEN spec-graph SHALL 更新 unit status 为 `abandoned`
AND SHALL 自动清理 worktree
AND SHALL 记录 abandon 原因到 audit log

### Requirement: Scope Lock Verification

spec-graph SHALL 验证 sub-agent 没有越界写入。

#### Scenario: Scope lock check

WHEN 协调者运行 `spec-graph worktree scope-check <unit-id>`
THEN spec-graph SHALL 读取 unit 的 `scope_lock` 配置
AND SHALL 扫描 worktree 内的文件变更
AND 对于 `allowed_paths` 中的路径 SHALL 允许写入
AND 对于 `forbidden_paths` 中的路径 SHALL 报告违规
AND 对于 `protected_paths` 中的路径 SHALL 只允许读
AND SHALL 返回违规报告（如果有的话）

#### Scenario: No scope lock violations

WHEN sub-agent 遵守 file_scope 约束
THEN scope-check SHALL 返回 "clean"
AND unit status SHALL 不受影响

### Requirement: Merge Queue

spec-graph SHALL 按依赖顺序合并 worktree units。

#### Scenario: Sequential wave merge

WHEN 多个 wave 的 units 需要合并
THEN spec-graph SHALL 按 wave 顺序合并（Wave 0 → Wave 1 → ...）
AND 每个 wave 内的 units SHALL 并行合并（如果无冲突）
AND 每个 unit 合并后 SHALL 立即运行集成测试
AND 如果某 unit 合并失败 SHALL block 后续 waves

#### Scenario: Merge failure escalation

WHEN unit 合并失败（git 冲突）
THEN spec-graph SHALL 尝试自动 resolve（如果是不同文件的冲突）
AND 如果自动 resolve 失败 SHALL 标记 unit 为 `abandoned`
AND SHALL 将下一 wave 改为 serial 执行（作为 fallback）
AND 如果 serial 也失败 SHALL escalate 给协调者

### Requirement: Cleanup

spec-graph SHALL 在 unit 完成（merged 或 abandoned）后自动清理 worktree。

#### Scenario: Post-merge cleanup

WHEN unit status 变为 `merged`
THEN spec-graph SHALL 自动执行：
  - `git worktree remove <path>`
  - `git branch -D <branch>`
AND 清理 SHOULD 在 merge 命令返回前完成

#### Scenario: Abandon cleanup

WHEN unit status 变为 `abandoned`
THEN spec-graph SHALL 执行相同的清理逻辑
AND SHALL 确保工作目录中不残留 worktree 文件
