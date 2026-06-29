### 示例 hooks.yaml 配置
  ### 放在 .spec-graph/hooks.yaml 中
  hooks:
    # dispatch 完成后通知 Slack
    - command: echo "Dispatched"  # 替换为: curl -X POST https://hooks.slack.com/...
      when: post
      command_name: dispatch

    # transition 完成后触发 CI
    - command: echo "Transition triggered"  # 替换为: curl -X POST https://ci.example.com/webhook
      when: post
      command_name: "machine"

    # check 完成后记录日志
    - command: echo "Check completed"  # 替换为: echo "$(date): Check ran" >> .spec-graph/check.log
      when: post
      command_name: "check"

    # dispatch 前备份状态
    - command: cp .spec-graph/machine-state.yaml .spec-graph/machine-state.bak.yaml
      when: pre
      command_name: dispatch

  # 环境变量可用：
  # $SPEC_GRAPH_PROJECT_ROOT — 项目根目录
  # $SPEC_GRAPH_COMMAND — 触发的命令名

  # 字段说明:
  #   command: 要执行的 shell 命令
  #   when: pre (命令前) 或 post (命令后)
  #   command_name: 关联的 spec-graph 命令名
  #   args_pattern: (可选) 匹配命令行参数的 glob
  #   timeout_ms: (可选) 超时时间, 默认 10000
  #   abort_on_failure: (可选) pre hook 失败时是否中止命令