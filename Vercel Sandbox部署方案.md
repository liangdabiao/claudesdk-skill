# Vercel Sandbox 部署方案（claude-agent-sdk 完整保留）

## 核心发现

你提到的问题非常关键：**claude-agent-sdk 需要操作文件、写代码、执行命令等自主能力**，之前的 Vercel AI SDK 方案确实丢失了这些能力——它只定义了几个特定工具（search_stock, generate_chart 等），无法提供 Bash、Read、Write、Glob、Grep 等通用工具。

**Vercel Sandbox (`@vercel/sandbox`) 是官方解决方案。** 它提供完整的隔离 microVM，支持 claude-agent-sdk 的所有运行需求。

---

## 一、Vercel Sandbox 是什么

Vercel Sandbox 是 Vercel 提供的**临时隔离 microVM**，核心能力：

| 能力 | 支持情况 | 说明 |
|------|---------|------|
| **child_process** | ✅ 完整支持 | 真正的 Linux VM，不是 V8 isolate |
| **fs 文件系统** | ✅ 完整支持 | 可读写文件，安装依赖 |
| **Python 运行时** | ✅ 支持 | 可在 VM 内安装 Python + baostock + matplotlib |
| **网络访问** | ✅ 支持 | 可配置 allow/deny 策略 |
| **最大时长** | 45 分钟（Hobby）/ **5 小时**（Pro/Enterprise） | 足够 Agent 多轮工具调用 |
| **vCPU** | 可配置（如 4 vCPU） | 充足的计算资源 |
| **安全性** | ✅ 高 | 隔离 VM，会话结束即销毁，凭证代理注入 |
| **快照** | ✅ 支持 | 预构建镜像，秒级启动 |

**对比之前分析的关键区别**：

| 维度 | Vercel Serverless Function | Vercel Sandbox |
|------|--------------------------|---------------|
| 运行环境 | AWS Lambda 容器 | 独立 microVM |
| child_process | ✅ 但受限 | ✅ 完全自由 |
| Python | ✅ 3.12/3.13/3.14 | ✅ 可安装任意版本 |
| 最大时长 | 800s（Pro） | **5 小时**（Pro） |
| 包大小 | 250 MB | 无硬性限制（VM 镜像） |
| 文件系统 | /tmp 临时 | 完整文件系统 |
| 用途 | HTTP API | **长时间运行的 Agent 计算** |

---

## 二、官方方案：Claude Managed Agents (CMA) + Vercel Sandbox

Vercel 官方提供了两篇指南：

1. **[Using Vercel Sandbox to run Claude's Agent SDK](https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk)** — 基础安装验证
2. **[Build a Claude Managed Agent with Vercel Sandbox](https://vercel.com/kb/guide/run-claude-managed-agent-tools-with-vercel-sandbox)** — 完整 Agent 系统（推荐）

### 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel                                │
│                                                              │
│  前端: React SPA (Pages / CDN)                               │
│    ├─ SSE 接收 Agent 流式输出                                 │
│    └─ HTTP POST 发送用户消息                                  │
│                                                              │
│  Control Plane (Vercel Function):                            │
│    ├─ /api/webhook ← Anthropic webhook 触发                  │
│    ├─ poll & ack work item                                   │
│    └─ spawn Sandbox ← 从预构建快照启动                        │
│                                                              │
│  Compute Plane (Vercel Sandbox microVM):                     │
│    ├─ 完整 Linux 环境（Node.js 22/24）                       │
│    ├─ 工具执行（run_shell, read_file, ...）                  │
│    ├─ Python + baostock + matplotlib                         │
│    ├─ 文件读写、代码执行、网络请求                             │
│    └─ 会话结束自动销毁                                        │
│                                                              │
│  安全层:                                                     │
│    ├─ 凭证代理（API Key 不进入 VM）                           │
│    └─ 网络策略（按域名/路径 allow/deny）                      │
│                                                              │
│  Anthropic (AI 大脑):                                        │
│    ├─ Claude 模型推理                                        │
│    ├─ 工具调用循环                                           │
│    ├─ 会话状态管理                                           │
│    └─ Session Event Stream (SSE)                             │
└─────────────────────────────────────────────────────────────┘
```

### 核心工作流

```
1. 用户发消息 → POST /api/session
2. Anthropic 创建 Session，触发 webhook
3. Webhook → poll work item → ack → spawn Sandbox
4. Sandbox 内的 runner.ts 执行工具调用（run_shell, read_file 等）
5. Session Event Stream → SSE → 前端实时显示
6. Agent 完成后 Session 进入 idle → Sandbox 自动销毁
```

---

## 三、两种实施路径

### 路径 A：CMA + Vercel Sandbox（官方推荐，需要适配）

使用 Anthropic 的 Claude Managed Agents API。Agent 的"大脑"（Claude + 工具调用循环 + 会话管理）由 Anthropic 托管，Vercel Sandbox 只负责执行工具。

**需要的改动**：

| 组件 | 当前 | 改为 | 改动量 |
|------|------|------|--------|
| SDK | claude-agent-sdk (`query()`) | `@anthropic-ai/sdk` CMA beta | **替换** |
| Agent 循环 | SDK 内部管理 | Anthropic 托管 | 自动 |
| 工具定义 | SKILL.md + Bash 调用 | CMA custom tools (JSON Schema) | **重写** |
| 工具执行 | SDK 内部 child_process | Vercel Sandbox 内 JS 函数 | **重写** |
| 通信方式 | WebSocket | SSE（Session Event Stream） | **重写** |
| 前端 | useWebSocket | EventSource + fetch | **重写** |

**关键代码结构**（来自官方指南）：

```typescript
// 1. 定义 Agent 和工具（scripts/create-agent.ts）
const agent = await client.beta.agents.create({
  name: "FinancialChartChat",
  model: "claude-sonnet-4-20250514",
  system: "你是 AI 财经图表助手...",
  tools: [
    {
      type: "custom",
      name: "run_shell",
      description: "Run a shell command",
      input_schema: { type: "object", properties: { command: { type: "string" } } },
    },
    {
      type: "custom",
      name: "read_file",
      description: "Read file contents",
      input_schema: { type: "object", properties: { path: { type: "string" } } },
    },
    // 可以加更多工具...
  ],
  betas: ["managed-agents-2026-04-01"],
});
```

```typescript
// 2. Sandbox 内的工具执行器（sandbox/runner.ts）
async function runTool(name: string, input: unknown): Promise<string> {
  if (name === "run_shell") {
    const cmd = (input as { command: string }).command;
    return execSync(cmd, { encoding: "utf8", timeout: 30_000 });
    // 这里可以执行: python data_fetcher.py --search 茅台
    // 可以执行: python financial_charts.py ...
    // 可以执行: 任何 bash 命令
  }
  if (name === "read_file") {
    return await readFile((input as { path: string }).path, "utf8");
  }
  return `unknown tool: ${name}`;
}
```

```typescript
// 3. Webhook 控制面（app/api/webhook/route.ts）
export async function POST(req: Request) {
  // 验证 webhook 签名
  const event = client.beta.webhooks.unwrap(body, { headers, key });
  // Poll & ack
  const item = await pollAndAck();
  // Spawn sandbox
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId: SNAPSHOT_ID },
    timeout: ms("1h"),
    networkPolicy: { allow: { "api.anthropic.com": [...] } },
  });
  await sandbox.runCommand({ cmd: "npx", args: ["tsx", "runner.ts"], detached: true });
}
```

**优点**：
- Anthropic 托管 AI 循环，无需自行管理 Agent 状态
- 凭证代理（API Key 不进入 VM）
- 网络策略（防止数据泄露）
- 官方维护的架构

**缺点**：
- CMA 是 beta 功能（`managed-agents-2026-04-01`）
- 工具定义从 SKILL.md + Bash 迁移到 JSON Schema
- 需要在 Anthropic dashboard 创建 Environment 和 Agent
- 与现有 claude-agent-sdk 的 Skill 系统不兼容

---

### 路径 B：Vercel Sandbox + claude-agent-sdk（改动最小）

直接在 Vercel Sandbox 内运行现有的 claude-agent-sdk，保留全部现有代码和 Skill 系统。

**架构**：

```
┌─────────────────────────────────────────────────┐
│  Vercel Pages: React SPA                        │
│    ├─ SSE 接收流式输出                           │
│    └─ POST /api/chat 发送消息                    │
├─────────────────────────────────────────────────┤
│  Vercel Function: /api/chat                     │
│    ├─ 接收用户消息                               │
│    ├─ Spawn Sandbox（从预构建快照）              │
│    ├─ 在 Sandbox 内运行 agent-client.ts 逻辑     │
│    └─ SSE 流式返回结果                           │
├─────────────────────────────────────────────────┤
│  Vercel Sandbox (microVM):                      │
│    ├─ claude-agent-sdk query() 运行             │
│    ├─ Skills 加载（.claude/skills/）             │
│    ├─ Bash 工具 → 执行 Python 脚本              │
│    ├─ Read/Write/Glob/Grep → 文件操作           │
│    ├─ Python + baostock + matplotlib            │
│    └─ 所有工具调用在 VM 内完成                   │
└─────────────────────────────────────────────────┘
```

**核心改动**：

| 组件 | 改动 | 改动量 |
|------|------|--------|
| `server/index.ts` | 拆分为 API Route（SSE 替代 WebSocket） | **重写** |
| `server/agent-client.ts` | 在 Sandbox 内运行，输出通过 SSE 返回 | **中改** |
| `server/message-queue.ts` | 不再需要（SSE 替代） | 删除 |
| `server/logger.ts` | 不再需要 | 删除 |
| `src/hooks/useWebSocket.ts` | 改为 useChatSession（SSE） | **重写** |
| `src/App.tsx` | 接口适配 | 小改 |
| `.claude/skills/*` | **零改动** | 不变 |
| `package.json` | 添加 `@vercel/sandbox` | 小改 |

**关键代码（概念性）**：

```typescript
// api/chat.ts（Vercel Function）
import { Sandbox } from "@vercel/sandbox";
import { waitUntil } from "@vercel/functions";

export async function POST(req: Request) {
  const { message, sessionId } = await req.json();

  // 从预构建快照创建 Sandbox
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId: process.env.SNAPSHOT_ID },
    timeout: ms("30m"),
  });

  // 写入用户消息到 Sandbox
  await sandbox.writeFiles([
    { path: "/vercel/sandbox/input.json", content: Buffer.from(JSON.stringify({ message })) },
  ]);

  // 在 Sandbox 内运行 claude-agent-sdk
  // agent-client.ts 的逻辑适配为 CLI 入口
  const result = sandbox.runCommand({
    cmd: "node",
    args: ["agent-runner.mjs"],
    detached: true,  // 异步执行
  });

  // 通过 SSE 流式返回
  // ...（监听 Sandbox 内的输出文件或 stdout）
}
```

**优点**：
- claude-agent-sdk **完全保留**，所有自主能力不变
- Skills 系统 **零改动**（SKILL.md、Python 脚本）
- 前端 UI 基本不变
- Python 脚本（data_fetcher.py、financial_charts.py）**零改动**

**缺点**：
- Sandbox 间通信需要额外设计（如何将 Agent 输出流式传回前端）
- 每次对话可能需要新 Sandbox（冷启动 ~2-5s，快照可加速）
- 需要管理 Sandbox 生命周期（创建、超时、销毁）
- 文件存储需要用 Vercel Blob（/tmp 在 Sandbox 销毁后消失）

---

## 四、方案对比

| 维度 | 路径 A: CMA + Sandbox | 路径 B: SDK + Sandbox | 之前: AI SDK 重写 |
|------|----------------------|----------------------|-----------------|
| **保留自主能力** | ✅ 通过 custom tools | ✅ 完整保留 | ❌ 只有预定义工具 |
| **Skills 系统** | ❌ 需迁移到 JSON Schema | ✅ 零改动 | ❌ 完全重写 |
| **Python 脚本** | ✅ 通过 run_shell 执行 | ✅ 零改动 | ⚠️ 需要重写为 HTTP API |
| **改动量** | 中-大 | 中 | 大 |
| **安全模型** | ✅ 凭证代理 + 网络策略 | ⚠️ 需自行处理 | ✅ 标准 Vercel 安全 |
| **官方支持** | ✅ 官方指南 + Demo 仓库 | ⚠️ 需自行设计 | ✅ 官方推荐 |
| **CMA 成熟度** | ⚠️ Beta（2026-04） | N/A | N/A |
| **前端改动** | 重写（SSE） | 重写（SSE） | 重写（useChat） |
| **后端改动** | 重写 Agent 逻辑 | 改通信层 | 完全重写 |

---

## 五、推荐路径

### 短期（快速上线）：路径 B — SDK + Sandbox

- 保留 claude-agent-sdk 和所有 Skills
- 只改通信层（WebSocket → SSE）
- Python 脚本零改动
- 改动量：**中等**（主要是通信层）

### 长期（产品化）：路径 A — CMA + Sandbox

- 迁移到 Anthropic 官方托管的 Agent 系统
- 更好的安全模型（凭证代理、网络策略）
- 官方维护，随 Anthropic 平台升级
- 改动量：**中-大**（但每个改动都有官方文档参考）

### 两个路径的共同前提

无论选哪条路，都需要：

1. **Vercel Pro 账户** — Sandbox 功能需要 Pro 以上
2. **预构建 Sandbox 快照** — 包含 Node.js、Python、baostock、matplotlib
3. **SSE 替代 WebSocket** — 前端通信层必须改
4. **文件存储迁移** — 本地 `charts/` 目录改为 Vercel Blob 或 R2

---

## 六、结论

**你的直觉是对的。** Vercel Sandbox 就是解决 claude-agent-sdk 自主执行能力的关键。之前的分析遗漏了这个方案，导致结论偏向"必须重写后端"。

实际情况是：

1. **不需要用 Vercel AI SDK 替代 claude-agent-sdk** — Sandbox 提供完整 VM，SDK 可以直接在里面跑
2. **不需要重写 Python 为 HTTP API** — Python 直接在 Sandbox 内运行
3. **不需要重写工具系统** — Skills + Bash 工具调用全部保留
4. **真正需要改的只有通信层** — WebSocket → SSE（因为 Vercel 不支持 WebSocket）

这比之前预估的改动量**小很多**，核心业务逻辑（Agent 执行、工具调用、Python 脚本、Skills 系统）可以保持不变。
