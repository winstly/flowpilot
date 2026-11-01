# FlowPilot 全量工程实现方案

> 目标：把 FlowPilot 从演示原型升级为真实可用的 Agent 工作流桌面客户端。
> 参照物：`E:\pi-main`（Pi monorepo，MIT）中的 `pi-coding-agent` 及其依赖包。
> 存储：SQLite（已验证 Electron 45 主进程内置 `node:sqlite`，Node 24，零原生依赖）。

## 0. 结论先行

- **复用而非重写**：Pi 是 MIT 协议的 npm 包（`@earendil-works/*`），Agent 循环、工具调度、
  多 Provider 模型接入都直接以依赖方式复用；自研部分只做三件 Pi 没有的事——
  **SQLite 持久化、桌面壳交互、FlowPilot 的工作流编排语义**。
- **执行位置**：Agent 循环跑在 **Electron 主进程**（工具要 fs/exec，网络要无 CORS），
  渲染层只做展示与控制，经 IPC 传事件流。
- **数据层**：SQLite 采用 Pi durable 包的"信封模式"（索引列 + `record JSON`），
  STRICT 表 + 版本化迁移，会话/消息/工具调用全量入库。
- **Phase 0 已完成**：设置模态框（头像旁齿轮唤起）——Base URL / API Token /
  模型槽位（主/Mythos/Fable/Opus/Sonnet/Haiku）+ 连接测试，落 SQLite `app_config`，
  你现在就可以录入。

## 1. 参照物分析：Pi 是什么，取什么、弃什么

### 1.1 Pi 的包拓扑（E:\pi-main\packages\）

| 包 | 角色 | 对我们的价值 |
|---|---|---|
| `ai` | 统一多 Provider LLM API（42 个 provider、模型目录、流式、鉴权） | **直接复用**：baseUrl/apiKey/model 三元组正是它的入参 |
| `agent` | Agent 运行时：循环、工具调度、steering 队列 | **直接复用**：`agentLoop()` 是整个引擎的心脏 |
| `coding-agent` | 产品壳：内置工具、会话管理、扩展系统、SDK/RPC | **工具集 + SDK 复用**；TUI 部分弃 |
| `durable` | 耐久执行运行时，**含 SQLite 存储后端** | **表结构设计参照**（schema/migrations 范式） |
| `mcp` / `codemode` / `chord` | MCP 客户端 / 沙箱 JS / 插件宿主 | Phase 3+ 再评估 |

### 1.2 Agent 循环要点（packages/agent/src/agent-loop.ts）

```
agentLoop(prompts, context, config, signal, streamFn) → EventStream<AgentEvent, AgentMessage[]>
```

一轮 turn 的机制（`runLoop`，agent-loop.ts:172）：
1. `AgentContext { messages, tools }` 全程持有 `AgentMessage`，**只在 LLM 调用边界**转成 `Message[]`；
2. inner loop：处理工具调用与 steering 消息（用户打断时排队注入 `getSteeringMessages`）；
3. `prepareRequest`（可改 context/model/thinkingLevel）→ 流式 LLM 调用 → 产出 assistant 消息；
4. 工具调用走 `AgentTool.execute()`，前后有 `beforeToolCall/afterToolCall` 钩子，
   支持 sequential/parallel 两种执行模式、`AgentToolUpdateCallback` 增量进度；
5. `prepareNextTurn` 钩子里做 compaction（上下文压缩）；`finishTurn` 决定 continue/end；
6. 事件流：`agent_start / turn_start / message_start / message_end / agent_end` 等
  （完整类型见 `agent/src/types.ts:528` 的 `AgentEvent`）。

**对客户端的含义**：把 `AgentEvent` 流经 IPC 转发给渲染层即可实现实时打字机/工具卡片，
`AbortSignal` 天然支持"中止任务"，`getSteeringMessages` 天然支持"对话纠错/追问"。

### 1.3 模型/Provider 配置形态（pi 的做法）

- `coding-agent/src/core/model-config.ts`：每个模型可覆盖 `baseUrl`、`apiKey`（还支持
  `oauth`、headers 命令化注入）——与我们配置页的字段一一对应；
- `ai/src/providers/*`：42 个 provider（anthropic/azure/bedrock/…），OpenAI 兼容口通用；
- `coding-agent/src/core/auth-storage.ts`：`Credential = api_key | oauth`，按 providerId 存
  `auth.json`——**我们改为 SQLite 单行 `app_config`**（已做，见 §3）。

### 1.4 弃用项

- `tui`（终端 UI）、`modes/interactive`（7211 行 TUI 模式）——被 Electron 渲染层替代；
- JSONL 会话文件（`session-manager.ts` 的 `~/.pi/agent/sessions/*.jsonl`）——被 SQLite 替代；
- CLI 安装器/自动更新/Nix 打包——不适用。

## 1.5 Agent 运行时设计（主/子双层 · 已实测贯通 2026-11-02）

```
主 Agent（supervisor：一次 pi agentLoop / 监督点）
  ├─ ① 任务展开  任务目标 + 绑定工作流 → 每节点执行简报（目标/验收标准）
  ├─ ② 节点审查  子 Agent 产出 → 通过 / 打回重跑（对应现有"打回重跑×N"语义）
  ├─ ③ 纠错转译  用户会话纠错 → 判定受影响节点 → 重跑简报（steering 队列）
  └─ ④ 复盘合成  全节点结果 → retro 真实报告（数据从 entries/tool_calls 聚合）
        │ 调度 = 确定性代码（拓扑序 · 独立节点并行 · 审查节点挂起等人工确认）
        ▼
子 Agent（worker：每节点一次 pi agentLoop，可多实例并行）
  └─ 入：节点简报 + 上游产出  →  出：summary + artifact，状态 done/fail
      模型 = 节点声明的槽位（app_config.models[slot]，未声明用任务默认）
```

**关键决策**：
- **调度确定性 + 判断智能化**：Workflow 是预绑的 DAG，调度必须确定、可观测、崩溃可恢复
  （对应桌面铁律"动作与状态严格真实对应"）；LLM 用在四个"判断点"，不做 token 级编排。
  备选方案（主 Agent 持 `dispatch_node` 工具全自主调度）灵活但不可预测、耗 token，
  适合探索型任务，不适合工作流工作室，暂不采用。
- **pi 接线（已实测）**：`agentLoop(prompts, context, config, signal, streamFn)`，
  `streamFn = (model, ctx, opts) => openai-completions 的 streamSimple(model, ctx, opts)`；
  `convertToLlm` 标准消息用恒等转换；**错误编码在流内**（stopReason:'error'），
  消费端必须检出，不能只看是否抛异常。
- **模型路由（已实测）**：网关 `xiaomi-token-plan-cn`（pi 目录内置 provider），
  官方模型 ID = `mimo-v2.6-pro`（重量档）/ `mimo-v2.6-flash`（轻量档）——
  注意：家族名 `mimo-v2.6` 会被 400 拒绝，必须带强度后缀。
- **thinking 流**：mimo-v2.6-pro 的流式事件含 thinking 块，entries 的 'think'
  kind 正好承接，Run 会话可渲染思考过程。

**验证证据**：`scripts/smoke-pi.cjs`（读本机真实配置）——层1 provider 直连 +
层2 agentLoop turn 均返回真实文本（正常 / 链路贯通）。

## 2. 总体架构

```
┌────────────────────────── Electron 渲染层（React） ──────────────────────────┐
│ 任务台 / 运行画布(RunPage) / 会话抽屉 / 模型配置(✅已做) / 复盘                │
│ 事件流消费：message_start/end → 打字机；tool_call → 工具卡片；agent_end → 完成 │
└───────────────▲──────────────────────────────────────────┬──────────────────┘
                │ IPC（事件流 up / 控制 down）               │ window.settings.*
┌───────────────┴──────────────────────────────────────────▼──────────────────┐
│ Electron 主进程 = Agent 宿主（Node 24）                                       │
│  ├─ agent-host.cjs   会话执行器：包 pi agentLoop + steering + abort           │
│  ├─ tools/           read/bash/edit/write/grep/find/ls（引 pi 工具实现）      │
│  ├─ provider.cjs     模型解析：model_levels → pi-ai 请求参数                  │
│  ├─ store.cjs        SQLite（node:sqlite）——所有持久化                        │
│  └─ main.cjs         窗口壳 + IPC 路由 + context-menu（已有）                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

关键决策：

| 决策 | 选择 | 理由 |
|---|---|---|
| Agent 跑在哪 | 主进程 | 工具要 fs/exec/shell；主进程无 CORS、无沙箱限制 |
| 依赖 or 自研循环 | 依赖 `@earendil-works/pi-agent-core` + `pi-ai` | MIT、可 npm 安装；循环/流式/工具调度是高风险复杂件 |
| 工具沙箱 | 先不做（任务目录内执行 + 确认弹窗） | 编码工具天然要碰文件系统；沙箱是 Phase 3+ 话题 |
| 存储 | `node:sqlite` 单文件 `flowpilot.db` | 零原生依赖；单用户桌面应用无并发压力 |
| 断线恢复 | 事件同步入库（每事件落 `entries`） | 会话中断重开后可从 DB 重建上下文 |

## 3. 数据层（SQLite）

沿用 Pi durable 的信封范式：**常用查询列 + `record TEXT CHECK(json_valid(record))` 存整条 JSON**，
STRICT 表、显式索引、版本化迁移（`durable/src/storage/sqlite/migrations.ts` 是模板）。
`model_levels` 已建（Phase 0）。其余表按里程碑逐步建，首发 schema：

```sql
-- 会话（一次任务的一轮/多轮对话；对应 FlowPilot 任务）
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  task_id INTEGER,                  -- 关联 tasks.id（FlowPilot 任务）
  title TEXT NOT NULL DEFAULT '',
  model_level_id INTEGER REFERENCES model_levels(id),
  status TEXT NOT NULL CHECK (status IN ('idle','running','waiting','done','fail','aborted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
) STRICT;

-- 消息与工具事件（一张表，按 kind 区分；相当于 durable 的 entries）
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,             -- 会话内有序
  kind TEXT NOT NULL CHECK (kind IN (
    'user','assistant','tool_call','tool_result','think','notice','error')),
  role TEXT,                        -- user/assistant（为消息查询冗余）
  record TEXT NOT NULL CHECK (json_valid(record)),   -- AgentMessage 完整体
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (session_id, seq)
) STRICT;
CREATE INDEX entries_by_session ON entries (session_id, seq);

-- 工具调用索引（运行画布/复盘直接查；细节在 entries.record）
CREATE TABLE tool_calls (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','done','error')),
  duration_ms INTEGER,
  summary TEXT NOT NULL DEFAULT ''  -- 一行遥测读数（"12 行 86ms"）
) STRICT;
CREATE INDEX tool_calls_by_session ON tool_calls (session_id, id);

-- 应用配置（Phase 0 已建：单行 baseUrl + API Token + 模型槽位 JSON）
-- 工作流模板（FlowPilot 现有 workflows 概念入库，替代 data/workflows.js）
CREATE TABLE workflows (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'workflow',
  status TEXT NOT NULL DEFAULT '正常',
  desc TEXT NOT NULL DEFAULT '',
  graph TEXT NOT NULL CHECK (json_valid(graph)),   -- 节点/边定义
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
) STRICT;
```

迁移策略：`store.cjs` 内维护 `PRAGMA user_version`，逐版本执行迁移 SQL（参照 durable 的
表重建手法处理 CHECK 变更）。会话导入：把现有 `src/data/*` 演示数据一次性 seed 进库（保底可演示）。

## 4. Agent 执行层

### 4.1 agent-host（主进程新模块）

```js
// 会话执行器：一个 session 一个执行上下文
class AgentHost {
  start(sessionId, promptText)   // 落 user entry → agentLoop() → 事件流逐条落库并推给窗口
  steer(sessionId, text)         // 追问/纠错：进 steering 队列（不打断当前工具）
  abort(sessionId)               // AbortSignal
}
```

- 事件流落库顺序：`message_start` 时写 `entries`（seq 递增），`tool_call` 同步写 `tool_calls`
  索引行；**先库后推**（保证崩溃可恢复）；
- 恢复：`session.status='running'` 但进程重启 → 标记 `aborted`，允许"继续任务"
  （用 `agentLoopContinue` 从最后一条 toolResult/user 续跑）；
- compaction：按 Pi 的 `prepareNextTurn` 钩子接入（Phase 2），压缩事件同样入库（notice kind）。

### 4.2 工具集（Phase 2 起逐步放开）

| 工具 | 来源 | 确认策略 |
|---|---|---|
| read / grep / find / ls | 引 pi coding-agent `core/tools` 实现 | 只读，无确认 |
| bash / powershell | 同上 | **每次执行前弹 ConfirmDialog**（沿用现有确认弹窗） |
| edit / write | 同上 | 破坏性写入，确认 + diff 预览（复用 retro 的 diff 展示） |

### 4.3 与 FlowPilot 任务语义的对接

- 任务（TasksPage）= 发起一个 session 的入口：文本目标 + 绑定的 Workflow/Agent/资源；
- Run 画布 = session 的图形化视图：节点 = 工具调用分组，边 = 先后依赖（由 tool_calls 时序生成）；
- 纠正/追问 = steering：会话抽屉输入 → `steer()`；
- 复盘（retro）= 对 `entries`/`tool_calls` 的聚合统计，数据从库读而非内存 mock。

## 5. 模型 / Provider 层

- **配置（已完成）**：设置模态框 = 单一 `baseUrl + API Token` + 模型槽位表
  （`app_config.models` JSON：main/mythos/fable/opus/sonnet/haiku），表单内
  "测试连接"（`GET {baseUrl}/models` 探活）；
- **模型解析**（provider.cjs）：按槽位名取 `app_config.models[key]` →
  组装 pi-ai 的 `{ model, apiKey, baseUrl }` → 传给 `agentLoop` 的 `config.model`；
- **多槽位路由**：Workflow 节点可声明用哪个槽位（如"采集节点用 haiku、分析节点用 opus"）；
- 兼容性：OpenAI 兼容口（deepseek/moonshot/qwen/openai 等）走同一 baseUrl+key；
  Anthropic 原生口在 Phase 2 加 provider 适配（pi 的 `providers/anthropic.ts` 可直接抄参数映射）。

## 6. UI 层映射（现有页面改造量）

| 页面 | 改造 |
|---|---|
| 设置模态框（头像旁齿轮） | ✅ 已完成 |
| 任务台 | 任务创建表单加"模型等级"选择；列表数据改从 SQLite 读 |
| Run 画布 | 节点/边由 tool_calls 实时生成（不再是静态 demo board）；进度 = 真实状态机 |
| 会话抽屉 | 消息流消费 IPC 事件（打字机已有组件）；输入即 steering |
| 复盘 | 从库聚合真实指标（时长/纠正/评分） |
| 资源与能力 | workflows 表驱动；Agent/Skill 绑定存 session 元数据 |

## 7. 里程碑

| Phase | 内容 | 产出 |
|---|---|---|
| **0** | 模型等级配置页 + SQLite 底座 | ✅ 已交付（可录入 API Key） |
| **1** | agent-host + 单会话对话（无工具）：选等级 → 发消息 → 流式回复 → 全量入库 | 会话抽屉实时对话 |
| **2** | 工具集接入（read/bash/edit… + 确认弹窗）+ 中止/steering | Run 画布真实节点流 |
| **3** | 任务/工作流语义对接：任务发起会话、复盘读库、compaction | FlowPilot 全链路真实化 |
| **4** | 增强：多等级节点路由、MCP 接入（pi-mcp）、导出、打包 .exe | 可分发桌面应用 |

依赖顺序：0 → 1 → 2 可并行推进 3 的数据层改造；4 依赖 1-3 稳定。

## 8. 风险与决策点

1. **依赖策略**：pi 的包是 npm 分发的 TS ESM，Electron 主进程可直接 `require`（CJS 互操作）
   ——风险低；若版本锁定需要，vendor 进 `vendor/pi/*` 亦可（MIT 允许）。
2. **API Key 安全**：现为明文 SQLite（本地单用户可接受）。加固项：Electron `safeStorage`
   加密 api_key 列（Phase 3），配置页展示已脱敏（✅）。
3. **工具确认的打扰度**：bash 每次确认会烦——后续可加"本会话内信任"开关（记 session 元数据）。
4. **长会话上下文**：Pi 的 compaction 是必要件，Phase 2 先做"超长提醒"，Phase 3 接真压缩。
5. **演示数据去留**：`src/data/*` 在 Phase 3 切库后删除，工作树保持纯净。
