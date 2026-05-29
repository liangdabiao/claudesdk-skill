# Cloudflare Sandbox SDK 调研报告（2026年5月）

## 一、核心发现

**Cloudflare Sandbox SDK 是 Cloudflare 对 Vercel Sandbox 的直接回应。** 它提供在 Cloudflare 边缘网络上运行的隔离 Docker 容器，支持完整的文件系统、命令执行、Python 运行时，**完美解决 *-chat 项目之前在 Cloudflare 上无法运行的所有问题。**

| 关键指标 | 详情 |
|---------|------|
| **npm 包** | `@cloudflare/sandbox` (v0.10.3) |
| **仓库** | [cloudflare/sandbox-sdk](https://github.com/cloudflare/sandbox-sdk) |
| **Star** | 1k+ |
| **状态** | **Beta**（API 可能变） |
| **许可证** | Apache 2.0 |
| **最新提交** | 2026-05-28（活跃开发） |
| **语言** | TypeScript 96.5%, Python 1.8% |
| **官方示例** | claude-code, openai-agents, code-interpreter, opencode 等 16 个 |

---

## 二、Cloudflare Sandbox 是什么

Cloudflare Sandbox SDK 让你在 Cloudflare Workers 中创建**隔离的 Docker 容器**，每个容器运行在 Cloudflare 的边缘网络上。

### 核心能力

| 能力 | 支持情况 | 说明 |
|------|---------|------|
| **child_process** | ✅ 完整支持 | Docker 容器，可执行任意命令 |
| **fs 文件系统** | ✅ 完整支持 | 完整 Linux 文件系统，可读写文件 |
| **Python 运行时** | ✅ 支持 | 可在容器内安装 Python + baostock + matplotlib |
| **命令执行** | ✅ `sandbox.exec()` | 带流式输出、超时控制 |
| **文件操作** | ✅ `sandbox.readFile/writeFile` | 读写文件 |
| **Git 集成** | ✅ `sandbox.gitCheckout()` | 直接 clone 仓库 |
| **预览 URL** | ✅ 支持 | 暴露容器内的 HTTP 服务 |
| **Quick Tunnels** | ✅ `sandbox.tunnels.get(port)` | 零配置 `*.trycloudflare.com` URL |
| **网络隔离** | ✅ `enableInternet: false` | 可配置 allow/deny 策略 |
| **凭证代理** | ✅ `interceptHttps + outboundByHost` | API Key 不进入容器 |
| **WebSocket** | ✅ 通过 tunnels | `*.trycloudflare.com` 支持 WebSocket |
| **容器持久化** | ✅ Durable Object | 基于 DO 的状态管理，容器可复用 |
| **安全性** | ✅ 高 | 隔离 Docker 容器，凭证代理注入 |

### 与 Vercel Sandbox 的关键区别

| 维度 | Cloudflare Sandbox | Vercel Sandbox |
|------|-------------------|---------------|
| **底层技术** | Docker 容器（Durable Objects） | microVM |
| **运行位置** | Cloudflare 全球边缘网络（300+ 城市） | AWS 区域 |
| **包管理** | Docker 镜像（Dockerfile） | 快照（Snapshot） |
| **状态管理** | Durable Objects（内置） | 需自行管理 |
| **凭证代理** | ✅ `interceptHttps + outboundByHost` | ✅ `networkPolicy + transform` |
| **网络策略** | `allowedHosts` 白名单 | `networkPolicy.allow` 规则 |
| **成熟度** | Beta (v0.10.3, 2026-05) | GA（更成熟） |
| **免费额度** | Workers 免费额度（10万请求/天） | 需要 Pro ($20/月) |
| **WebSocket** | ✅ tunnels 原生支持 | ❌ 不支持 |
| **冷启动** | Docker 容器启动（~2-3s） | microVM 启动（~2-5s） |
| **最长运行** | 受 Durable Object 限制 | 45min (Hobby) / 5h (Pro) |

---

## 三、官方 Claude Code 示例分析

Cloudflare 官方提供了 **Claude Code 在 Sandbox 中运行**的完整示例，这与我们的 *-chat 项目高度相关。

### 架构

```
┌──────────────────────────────────────────────────────┐
│                    Cloudflare                         │
│                                                       │
│  Worker (src/index.ts):                               │
│    ├─ POST / → runTask()                              │
│    │   ├─ getSandbox(env.Sandbox, sandboxId)          │
│    │   ├─ sandbox.gitCheckout(repo)                   │
│    │   ├─ sandbox.exec("claude --print ...")          │
│    │   └─ sandbox.exec("git diff")                    │
│    └─ 凭证代理: interceptHttps + outboundByHost       │
│                                                       │
│  Durable Object (Sandbox):                            │
│    └─ 管理 Docker 容器生命周期                         │
│                                                       │
│  Docker Container (Dockerfile):                       │
│    ├─ FROM cloudflare/sandbox:0.10.3                  │
│    ├─ npm install -g @anthropic-ai/claude-code        │
│    ├─ claude --print --permission-mode bypassPermis.. │
│    ├─ 完整文件系统、Git、命令执行                       │
│    └─ IS_SANDBOX=1, 网络隔离                          │
│                                                       │
│  安全层:                                              │
│    ├─ enableInternet = false                          │
│    ├─ allowedHosts = ['github.com', 'api.anthropic..] │
│    └─ API Key 代理注入（容器内只看到 proxy-injected）   │
└──────────────────────────────────────────────────────┘
```

### 核心代码（来自官方示例）

```typescript
// src/index.ts — Cloudflare Worker
import { Sandbox as BaseSandbox, getSandbox } from '@cloudflare/sandbox';
export { ContainerProxy } from '@cloudflare/sandbox';

// 自定义 Sandbox 类：启用 HTTPS 拦截 + 网络隔离
export class Sandbox extends BaseSandbox<Env> {
  interceptHttps = true;
  enableInternet = false;  // 禁止外网访问
  allowedHosts = ['github.com', 'api.anthropic.com'];  // 白名单
}

// 凭证代理：API Key 不进入容器
Sandbox.outboundByHost = {
  'api.anthropic.com': async (request: Request, env: Env) => {
    const headers = new Headers(request.headers);
    if (headers.has('x-api-key') && env.ANTHROPIC_API_KEY) {
      headers.set('x-api-key', env.ANTHROPIC_API_KEY);
    }
    return fetch(`https://api.anthropic.com${url.pathname}`, { headers });
  }
};

// 执行任务
async function runTask(request: Request, env: Env) {
  const { repo, task } = await request.json();
  const sandbox = getSandbox(env.Sandbox, sandboxId);

  // Clone 仓库
  await sandbox.gitCheckout(repo, { targetDir: name });

  // 运行 Claude Code headless
  const cmd = `claude --print --permission-mode bypassPermissions ${task}`;
  const logs = await sandbox.exec(cmd, {
    env: { IS_SANDBOX: '1', ANTHROPIC_API_KEY: 'proxy-injected' }
  });

  const diff = await sandbox.exec('git diff');
  return Response.json({ logs, diff });
}
```

```dockerfile
# Dockerfile — 构建容器镜像
FROM docker.io/cloudflare/sandbox:0.10.3
RUN npm install -g @anthropic-ai/claude-code
ENV COMMAND_TIMEOUT_MS=300000
EXPOSE 3000
```

```jsonc
// wrangler.jsonc — 部署配置
{
  "name": "cc-sandbox",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-22",
  "compatibility_flags": ["nodejs_compat"],
  "containers": [{
    "class_name": "Sandbox",
    "image": "./Dockerfile",
    "instance_type": "basic"
  }],
  "durable_objects": {
    "bindings": [{ "class_name": "Sandbox", "name": "Sandbox" }]
  },
  "migrations": [{ "new_sqlite_classes": ["Sandbox"], "tag": "v1" }]
}
```

---

## 四、对 *-chat 项目的适配方案

### 方案 A：Cloudflare Sandbox + claude-agent-sdk（推荐）

直接在 Docker 容器内运行 claude-agent-sdk，保留全部现有代码。

#### 架构

```
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Pages: React SPA (前端)                      │
│    ├─ HTTP POST 发送用户消息                              │
│    └─ SSE / Tunnel 接收流式输出                           │
├─────────────────────────────────────────────────────────┤
│  Cloudflare Worker: API 路由                             │
│    ├─ POST /api/chat → 创建/复用 Sandbox                 │
│    ├─ 凭证代理（API Key 不进入容器）                      │
│    └─ 流式返回 Agent 输出                                │
├─────────────────────────────────────────────────────────┤
│  Cloudflare Sandbox (Docker Container):                  │
│    ├─ Node.js + Python + baostock + matplotlib           │
│    ├─ claude-agent-sdk query() 运行                      │
│    ├─ Skills 加载（.claude/skills/）                      │
│    ├─ Bash 工具 → 执行 Python 脚本                       │
│    ├─ Read/Write/Glob/Grep → 文件操作                    │
│    └─ 所有工具调用在容器内完成                             │
├─────────────────────────────────────────────────────────┤
│  R2 Storage:                                             │
│    └─ 图表文件持久化（charts/目录）                       │
└─────────────────────────────────────────────────────────┘
```

#### Dockerfile 设计

```dockerfile
FROM docker.io/cloudflare/sandbox:0.10.3

# 安装 Node.js 依赖
WORKDIR /app
COPY package*.json ./
RUN npm install

# 安装 Python 依赖
RUN apt-get update && apt-get install -y python3 python3-pip
RUN pip3 install baostock matplotlib pandas akshare

# 复制项目代码
COPY . .

# 复制 Skills
COPY .claude/skills/ /app/.claude/skills/

ENV COMMAND_TIMEOUT_MS=300000
EXPOSE 3000
```

#### Worker 代码（核心概念）

```typescript
import { getSandbox, Sandbox } from '@cloudflare/sandbox';
export { Sandbox };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const { message, sessionId } = await request.json();

      // 获取或创建 Sandbox（基于 session 复用）
      const sandbox = getSandbox(env.Sandbox, `chat-${sessionId}`);

      // 在容器内运行 agent
      const result = await sandbox.exec(
        `node agent-runner.mjs --message '${shellQuote(message)}'`,
        { env: { ANTHROPIC_API_KEY: 'proxy-injected', IS_SANDBOX: '1' } }
      );

      return Response.json({ output: result.stdout });
    }

    // SSE 流式端点
    if (url.pathname === '/api/stream' && request.method === 'POST') {
      const { message, sessionId } = await request.json();
      const sandbox = getSandbox(env.Sandbox, `chat-${sessionId}`);

      // 使用 tunnel 暴露容器内的 HTTP 服务
      const tunnel = await sandbox.tunnels.get(3000);

      // 代理到容器内的流式 API
      const response = await fetch(`${tunnel.url}/stream`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });

      return new Response(response.body, {
        headers: { 'Content-Type': 'text/event-stream' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};
```

#### 改动清单

| 组件 | 改动 | 改动量 |
|------|------|--------|
| `server/index.ts` | 重写为 Cloudflare Worker | **重写** |
| `server/agent-client.ts` | 适配为在容器内运行 | **中改** |
| `server/message-queue.ts` | 保留（容器内使用） | 不变 |
| `src/hooks/useWebSocket.ts` | SSE 或 WebSocket via tunnel | **重写** |
| `src/App.tsx` | 接口适配 | 小改 |
| `.claude/skills/*` | **零改动** | 不变 |
| `package.json` | 添加 `@cloudflare/sandbox` | 小改 |
| **新增** `Dockerfile` | 构建容器镜像 | 新增 |
| **新增** `wrangler.jsonc` | Cloudflare 部署配置 | 新增 |
| **新增** `agent-runner.mjs` | 容器内 Agent 入口 | 新增 |

### 方案 B：使用 Quick Tunnels 保留 WebSocket

Cloudflare Sandbox 的 tunnels 功能支持 WebSocket，可以最小化改动：

```typescript
// Worker 中创建 tunnel
const tunnel = await sandbox.tunnels.get(3015);

// 前端连接 tunnel URL（支持 WebSocket）
const ws = new WebSocket(tunnel.url); // wss://xxx.trycloudflare.com/ws
```

这样前端 `useWebSocket.ts` 几乎不需要改动，只需要连接 tunnel URL 而不是本地服务器。

---

## 五、OpenAI Agents 示例分析

Cloudflare 官方还提供了 OpenAI Agents SDK 集成示例，使用 `@cloudflare/sandbox/openai` 子包：

```typescript
import { Editor, Shell } from '@cloudflare/sandbox/openai';
import { Agent, shellTool, applyPatchTool, run } from '@openai/agents';

const sandbox = getSandbox(env.Sandbox, `session-${sessionId}`);
const shell = new Shell(sandbox);
const editor = new Editor(sandbox, '/workspace');

const agent = new Agent({
  name: 'Sandbox Studio',
  model: 'gpt-5.1',
  tools: [
    shellTool({ shell, needsApproval: false }),
    applyPatchTool({ editor, needsApproval: false })
  ]
});

const result = await run(agent, input);
```

**注意**：目前没有 `@cloudflare/sandbox/anthropic` 子包，但 `Shell` 和 `Editor` 是通用的，可以与任何 Agent SDK 配合使用。

---

## 六、Cloudflare Sandbox vs Vercel Sandbox 全面对比

### 对 *-chat 项目的影响

| 维度 | Cloudflare Sandbox | Vercel Sandbox | 之前的 AI SDK 方案 |
|------|-------------------|---------------|-----------------|
| **保留自主能力** | ✅ Docker 容器完整能力 | ✅ microVM 完整能力 | ❌ 只有预定义工具 |
| **Skills 系统** | ✅ 零改动 | ✅ 零改动 | ❌ 需迁移 |
| **Python 脚本** | ✅ Docker 内安装 | ✅ VM 内安装 | ⚠️ 需重写为 HTTP API |
| **WebSocket** | ✅ tunnels 支持 | ❌ 不支持 | ❌ 改为 SSE |
| **改动量** | 中（通信层+Worker） | 中（通信层+Function） | 大（全面重写） |
| **免费额度** | ✅ Workers 免费（10万/天） | ❌ 需要 Pro ($20/月) | ❌ 需要 Pro |
| **全球分布** | ✅ 300+ 城市 | ⚠️ AWS 区域 | ⚠️ AWS 区域 |
| **成熟度** | ⚠️ Beta | ✅ GA | ✅ 成熟 |
| **凭证代理** | ✅ 内置 | ✅ 内置 | N/A |
| **Claude Code 支持** | ✅ 官方示例 | ✅ 官方指南 | ❌ |
| **冷启动** | Docker 容器 (~2-3s) | microVM (~2-5s) | Serverless (~1s) |

### 关键优势

**Cloudflare Sandbox 的优势**：
1. **WebSocket 原生支持** — 通过 tunnels，无需改为 SSE
2. **免费可用** — Workers 免费额度足够开发测试
3. **全球边缘** — 300+ 城市，延迟更低
4. **Durable Objects** — 内置状态管理，容器可复用
5. **Docker 灵活性** — 可以自定义任何依赖

**Vercel Sandbox 的优势**：
1. **更成熟** — GA 级别，非 Beta
2. **5 小时超时** — 更适合长时间 Agent 任务
3. **官方 CMA 集成** — Claude Managed Agents 原生支持
4. **更好的文档** — 完整的部署指南

---

## 七、推荐方案

### 短期（快速验证）：Cloudflare Sandbox SDK

**推荐理由**：
- 免费（不需要 Pro 账户）
- 有官方 Claude Code 示例可参考
- WebSocket 通过 tunnels 支持，前端改动最小
- Docker 容器提供完整自主能力
- Skills 系统、Python 脚本零改动

**改动量**：中等（主要是 Worker 适配 + Dockerfile + 通信层）

### 中期：观察 Beta 进展

- Cloudflare Sandbox SDK 仍在 Beta，API 可能变化
- 关注 `@cloudflare/sandbox` 的正式版本发布
- 关注是否出现 Anthropic Agent SDK 的官方子包

### 长期：Cloudflare vs Vercel 选择

| 如果优先 | 选择 |
|---------|------|
| **成本** | Cloudflare（免费额度大） |
| **稳定性** | Vercel（GA 非Beta） |
| **全球延迟** | Cloudflare（300+ 城市） |
| **Claude 集成** | 两者相当（都有官方示例） |
| **WebSocket** | Cloudflare（tunnels 原生支持） |
| **成熟生态** | Vercel（AI SDK 更成熟） |

---

## 八、结论

**Cloudflare Sandbox SDK 是一个改变游戏规则的产品。** 它直接解决了之前分析中 Cloudflare 的所有短板：

1. ~~child_process 不支持~~ → ✅ Docker 容器完整支持
2. ~~fs 不支持~~ → ✅ 完整文件系统
3. ~~Python 受限~~ → ✅ Docker 内安装任意 Python 包
4. ~~WebSocket 需 Durable Objects~~ → ✅ tunnels 直接支持
5. ~~包大小 10MB 限制~~ → ✅ Docker 镜像无硬性限制

**与之前的结论对比**：

之前的分析结论是"Cloudflare 不能直接部署 *-chat"。现在有了 sandbox-sdk，这个结论需要修正为：

> **Cloudflare 现在可以部署 *-chat 项目，且改动量与 Vercel Sandbox 方案相当。** 核心业务逻辑（claude-agent-sdk、Skills、Python 脚本）全部保留，只需改通信层和添加 Dockerfile/Worker 配置。

**两个 Sandbox 方案都是"改动最小"的正确路径**——不再需要用 Vercel AI SDK 或 Cloudflare Agents SDK 重写后端。
