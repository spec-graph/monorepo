# Sense 引擎:9 维度推断规则表

Sense 引擎是 spec-graph 的第一道关卡:从用户描述 + 仓库扫描 推断出 9 个 profile 事实维度。LLM 只参与这个阶段,后续 Compose/Enforce 确定性执行。

---

## 核心原则

### 1. 证据来源优先级

```
user override (最高) > repo 硬证据 > LLM 推断 (最低)
```

- **user override**:CLI flag 或 profile.yaml 手动编辑。**永不上调**,即使用户输入比 repo 证据宽松,也按用户输入。
- **repo 硬证据**:文件存在性检查。**high confidence**,不可被 LLM 下调。
- **LLM 推断**:自然语言描述映射到枚举。**low confidence**,可被 repo 证据覆盖。

### 2. 严格方向单调规则

所有维度的取值定义为一个**严格偏序格**:从最宽松到最严格。引擎只能**上调**事实(从宽松到严格),不能**下调**(从严格到宽松)。

**例**:
- repo 检测到 `package.json` + `exports` 字段 → **上推** boundary 从 internal → published-lib
- LLM 说 boundary=internal,但 repo 有 openapi.yaml → 强制上调为 published-api

### 3. 置信度衰减规则

同一维度多证据冲突时:
- high confidence 证据 覆盖 low confidence 证据
- 同 confidence 下 → **取更严格**的(保守原则)

---

## 9 维度详细推断规则

---

### 1. `has_ui`:前端形态

**取值格**:`none` (最宽松) → `cli` → `gui` → `web` → `native` (最严格)

| 值 | 定义 | repo 硬证据(high confidence) | LLM 关键词(low confidence) |
|---|---|---|---|
| `none` | 无任何 UI | 无任何 UI 目录 + 无 electron/react/vue/angular/next | "纯后端服务"、"数据处理引擎" |
| `cli` | 命令行界面 | bin/ + commander/yargs/inquirer 依赖 | "命令行工具"、"CLI" |
| `gui` | 桌面 GUI | electron/tauri/wxWidgets 依赖 + 窗口化代码 | "桌面应用"、"GUI 工具" |
| `web` | Web 前端 | pages/ + next/nuxt/remix 依赖 或 src/routes/ + sveltekit | "Web 应用"、"网站"、"浏览器" |
| `native` | 原生移动应用 | ios/ android/ + react-native/flutter/swift 依赖 | "手机 App"、"移动应用"、"iOS/Android" |

**上调规则**:
- 有 `next.config.js` → 直接上调到 `web`
- 有 `android/` 或 `ios/` 目录 → 直接上调到 `native`
- `web` 与 `gui` 共存 → 取 `web`(更严格,前端验收)

---

### 2. `boundary`:对外接口形态

**取值格**:`internal` → `published-api` → `published-lib` → `hardware-iface`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `internal` | 无对外接口 | 无 http/grpc 依赖 + 无 public API 声明文件 | "内部服务"、"私有组件"、"纯业务逻辑" |
| `published-api` | 对外发布 API | openapi.yaml/asyncapi.yaml + routes/ + express/fastify/flask/fastapi | "REST API"、"GraphQL API"、"后端服务" |
| `published-lib` | 对外发布库 | package.json#exports/typings/ + 发布配置(.npmrc/pypirc) | "SDK"、"库"、"包"、"npm/pip/cargo 发布" |
| `hardware-iface` | 硬件接口 | register-map/device-tree/can bus 定义 + 嵌入式工具链 | "驱动"、"固件"、"硬件接口"、"外设" |

**上调规则**:
- 有 `openapi.yaml` → 直接上调到 `published-api`
- 有 `package.json#exports` 字段 → 直接上调到 `published-lib`
- 有 `register-map.hex` → 直接上调到 `hardware-iface`

---

### 3. `topology`:部署拓扑

**取值格**:`mono` → `federated` → `distributed`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `mono` | 单部署单元 | 单一 Dockerfile + 无 services/ 多目录结构 | "单体应用"、"单一服务" |
| `federated` | 多服务但同属一个产品 | docker-compose 多 service + services/ + 统一 API 网关配置 | "微服务"、"多服务"、"前后端分离" |
| `distributed` | 多系统跨团队协作 | federation supergraph + 多个独立 repo 引用 + 跨组织 API 文档 | "分布式系统"、"联邦"、"跨团队协作" |

**上调规则**:
- `docker-compose.yml` 中 services ≥ 2 → `federated`
- 有 `supergraph.yaml`(Apollo Federation) → `distributed`

---

### 4. `deployment`:部署形态

**取值格**:`process` → `package` → `binary` → `edge-function` → `hosted-service` → `firmware`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `process` | 直接作为进程运行 | 无 Dockerfile + node/python 脚本入口 | "本地运行"、"脚本"、"命令行" |
| `package` | 以包形式分发 | deb/rpm/dmg/msi 打包配置 + Makefile install 目标 | "安装包"、"分发包"、"安装程序" |
| `binary` | 原生二进制 | Cargo.toml + Rust/Go 源码 + build.rs/Makefile build | "二进制"、"可执行文件"、"编译型" |
| `edge-function` | 边缘函数 | vercel.json / netlify.toml / wrangler.toml + edge runtime 配置 | "Serverless"、"Edge Function"、"Vercel/Cloudflare" |
| `hosted-service` | 托管服务 | Dockerfile + k8s manifest + helm chart + fly.toml/render.yaml | "云服务"、"容器部署"、"K8s"、"SaaS" |
| `firmware` | 设备固件 | platformio.ini + .ino Arduino 源码 + embedded 工具链 | "固件"、"嵌入式"、"单片机"、"MCU" |

**上调规则**:
- 有 `platformio.ini` → 直接上调到 `firmware`
- 有 `Dockerfile` + `k8s/` 目录 → 直接上调到 `hosted-service`
- 有 `wrangler.toml` → 直接上调到 `edge-function`

---

### 5. `consumers`:消费者范围

**取值格**:`self` → `internal-team` → `external-public` → `third-party-ecosystem`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `self` | 只有自己/本团队用 | 无 README 公共使用说明 + 私有依赖 | "个人项目"、"自用工具" |
| `internal-team` | 团队内部使用 | README 有 "团队内部" 字样 + 内部私有包引用 | "团队工具"、"内部使用" |
| `external-public` | 外部公开使用 | public GitHub repo + npm 公开包 + 公开文档站点配置 | "开源"、"公开"、"公开可用" |
| `third-party-ecosystem` | 第三方生态系统构建 | plugin API + 第三方 extension 目录 + ecosystem 文档 | "平台"、"插件生态"、"Extension API" |

**上调规则**:
- 有 `public: true` 在 package.json → `external-public`
- 有 `plugin/` 或 `extension/` API 目录 → `third-party-ecosystem`

---

### 6. `field`:项目场

**取值格**:`greenfield` → `brownfield` → `refactor` → `migration`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `greenfield` | 从零开发 | 无 src/ 或 行数 < 100 + 无 git history 或 第一次 commit | "新项目"、"从零开始"、"空白画布" |
| `brownfield` | 现有代码上开发 | src/ 存在 + 行数 > 500 + git history > 10 commits + Issue/PR 存在 | "已有项目"、"迭代开发"、"加功能" |
| `refactor` | 重构 | REFACTOR: commit 消息 + .refactor-plan.md + linter rules 变化 | "重构"、"代码整理"、"技术债" |
| `migration` | 技术栈迁移 | MIGRATE: commit 消息 + migration-plan.md + 新旧依赖共存 | "迁移"、"从 XX 到 YY"、"升级" |

**上调规则**:
- 有 `migration-plan.md` → 直接上调到 `migration`
- 有 `// TODO: refactor` 超过 10 处 + 重构计划文档 → `refactor`
- `brownfield` 项目有 refactor/migration 信号 → 上调为对应值

---

### 7. `criticality`:关键程度

**取值格**:`prototype` → `standard` → `compliance` → `mission-critical`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `prototype` | 原型/探索 | prototype/experimental/poc 分支名 + README 有 "POC"、"原型"、"请勿生产使用" | "原型"、"POC"、"探索"、"试验" |
| `standard` | 标准质量 | 有 CI (GitHub Actions/.travis.yml) + 有 test/ 目录 | "生产可用"、"标准质量" |
| `compliance` | 合规要求 | 审计日志配置 + SOC2/ISO27001/GDPR 相关代码 + 合规检查 CI Job | "合规"、"审计"、"金融"、"医疗"、"GDPR" |
| `mission-critical` | 任务关键 | failover/HA/redundancy 配置 + SLA 文档 + 事故响应 playbook | "高可用"、"99.99%"、"核心系统"、"不能停" |

**上调规则**:
- 有 `.github/workflows/audit.yml` → `compliance`
- 有 `ha-config.yaml` 或 `sla.md` → `mission-critical`
- 无 CI 且无 test/ → 下调为 `prototype`(**唯一允许下调的场景**:无任何质量信号 = 原型)

---

### 8. `team`:团队规模

**取值格**:`solo` → `small` → `multi` → `distributed-org`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `solo` | 单人 | .gitconfig 只有一个 author + CODEOWNERS 只有一个人 | "个人项目"、"我自己"、"单人开发" |
| `small` | 小团队 | git blame 有 2-5 个不同 author + CODEOWNERS 2-5 人 | "小团队"、"几个人"、"3-5 人" |
| `multi` | 多团队 | CODEOWNERS 分目录有不同 owner + teams/ 目录 + 多模块 | "多个团队"、"跨团队" |
| `distributed-org` | 分布式组织 | MAINTAINERS 文件 + 多个 org/company 目录 + OSS 治理文件 | "开源社区"、"基金会"、"多公司协作" |

**上调规则**:
- git log 中不同 author > 10 → `multi`
- 有 `MAINTAINERS` 文件 + LICENSE 是 Apache/GPL → `distributed-org`

---

### 9. `persistence`:持久化形态

**取值格**:`none` → `embedded-store` → `database` → `distributed-storage`

| 值 | 定义 | repo 硬证据 | LLM 关键词 |
|---|---|---|---|
| `none` | 无持久化 | 无 db 配置 + 无 ORM 依赖 + 纯内存数据结构 | "无状态"、"计算引擎"、"纯逻辑"、"工具" |
| `embedded-store` | 嵌入式存储 | SQLite 文件 + leveldb/rocksdb/badger 依赖 + 本地文件存储 | "本地存储"、"文件数据库"、"SQLite"、"嵌入式数据库" |
| `database` | 中央数据库 | prisma/schema.prisma + typeorm/sequelize/mongoose 依赖 + docker-compose 有 db service | "PostgreSQL"、"MySQL"、"MongoDB"、"数据库" |
| `distributed-storage` | 分布式存储 | etcd/consul/cassandra/redis-cluster 配置 + 多副本配置 + sharding 逻辑 | "分布式存储"、"etcd"、"Cassandra"、"多副本"、"分片" |

**上调规则**:
- 有 `prisma/schema.prisma` 或 `sequelize.config.js` → `database`
- 有 `docker-compose-redis-cluster.yml` → `distributed-storage`
- 有 `schema.sqlite` → `embedded-store`

---

## 冲突解决算法

```
输入: profile 初始值(user 输入 + repo 扫描 + LLM 推断)
输出: 最终确定的 9 个维度值

1. 对每个维度:
   a. 收集所有来源的候选值(user, repo, llm)
   b. 按来源优先级过滤:user > repo > llm
   c. 同来源多值 → 取严格方向的最大值
2. 对高优先级来源的值,如果它在严格格中**低于**低优先级来源的值 → **不**下调(保持高优先级来源的值)
   - 例:user 说 boundary=internal,但 repo 有 openapi.yaml → 保持 internal(用户 override 优先级最高)
   - 例:llm 说 boundary=internal,但 repo 有 openapi.yaml → 上调为 published-api(repo > llm)
3. 同 confidence 多值冲突 → 取更严格的(保守原则)
4. 最终检查:所有维度的值都必须在该维度的枚举范围内

特殊规则:
- criticality 是唯一允许从 standard 下调为 prototype 的维度(无质量信号 = 原型)
- persistence=none 时,data-design pack 不命中
```

---

## 示例推断演示

### 项目:任务管理 SaaS (全栈 Web)

**用户输入**:
> "做一个 SaaS 任务管理应用,Web 前端 + REST API + PostgreSQL"

**repo 扫描发现**(假设这是新项目,只有脚手架):
- ✅ next.config.js
- ✅ pages/ 目录
- ✅ package.json#exports:有 API 包导出
- ✅ prisma/schema.prisma
- ✅ Dockerfile + docker-compose.yml (postgres + api + frontend 三个 service)
- ✅ .github/workflows/ci.yml
- ❌ 无 audit.yml
- ✅ test/ 目录存在

**LLM 初始推断(low confidence)**:
- has_ui: web
- boundary: internal
- topology: mono
- deployment: hosted-service
- consumers: self
- field: greenfield
- criticality: standard
- team: small
- persistence: database

**repo 硬证据上调后(high confidence)**:
- boundary: internal → **published-api** (因有 package.json#exports)
- topology: mono → **federated** (因 docker-compose 有 3 个 service)
- consumers: self → **external-public** (因有公开 exports + SaaS 描述)

**最终 profile**:

```yaml
facts:
  has_ui: { value: web, confidence: high, source: repo }
  boundary: { value: published-api, confidence: high, source: repo }
  topology: { value: federated, confidence: high, source: repo }
  deployment: { value: hosted-service, confidence: high, source: repo }
  consumers: { value: external-public, confidence: low, source: llm }
  field: { value: greenfield, confidence: high, source: repo }
  criticality: { value: standard, confidence: high, source: repo }
  team: { value: small, confidence: low, source: llm }
  persistence: { value: database, confidence: high, source: repo }
```

**Compose 命中的 packs**:foundation + requirement-analysis + architecture + task-decomposition + api-design + data-design + frontend + backend + feature (共 9 个)
