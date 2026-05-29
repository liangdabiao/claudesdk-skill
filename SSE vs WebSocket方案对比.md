# SSE vs WebSocket 方案对比（Cloudflare Sandbox 场景）

## 一、三种可行方案

研究 Cloudflare Sandbox SDK 的官方示例后，发现有三种方式实现前后端通信：

| 方案 | 通信路径 | 官方示例 |
|------|---------|---------|
| **A: SSE（Worker 代理）** | 浏览器 ←SSE→ Worker ←exec()→ 容器 | code-interpreter |
| **B: WebSocket（DO 代理）** | 浏览器 ←WS→ DO ←sandbox.fetch(WS)→ 容器 | **collaborative-terminal** |
| **C: WebSocket（Tunnel 直连）** | 浏览器 ←WS→ tunnel URL ←→ 容器 | README 示例 |

---

## 二、方案 A：SSE（Worker 代理）

### 架构

```
浏览器                   Worker                    Sandbox 容器
  │                       │                           │
  │── POST /api/chat ────→│                           │
  │                       │── sandbox.exec(agent) ──→│
  │                       │   (等待命令完成)           │
  │                       │←── { stdout, stderr } ───│
  │←── SSE 流式响应 ──────│                           │
  │                       │                           │
```

### 核心代码

```typescript
// Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { message } = await request.json();
    const sandbox = getSandbox(env.Sandbox, 'my-session');

    // exec() 返回完整结果（非流式）
    const result = await sandbox.exec(
      `node agent-runner.mjs --message '${shellQuote(message)}'`
    );

    // 用 SSE 包装返回
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify(result.stdout)}\n\n`);
        controller.close();
      }
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' }
    });
  }
};
```

### 问题

**核心问题：`sandbox.exec()` 是阻塞式的，等待命令完成后才返回。**

claude-agent-sdk 的 `query()` 是一个长时间运行的进程（可能数分钟），期间会持续产生事件流（assistant 文本、tool_use、tool_result 等）。`sandbox.exec()` 无法在执行过程中流式返回这些中间输出。

**变通方案**：
1. 在容器内运行 agent，将事件写入文件，Worker 轮询文件 → 复杂、延迟高
2. 在容器内启动 HTTP server，Worker 通过 `sandbox.fetch()` 代理流式请求 → 本质上变成了 SSE 包装的 HTTP 代理，但需要额外构建容器内 HTTP 服务

### 优点
- Worker 原生支持 SSE（`ReadableStream`）
- 无需 WebSocket 连接管理
- 每次请求独立，无状态
- 适合简单的"发消息→收结果"模式

### 缺点
- **无法流式传输 Agent 中间输出**（exec 阻塞）
- 要实现真正的流式，需要在容器内额外搭建 HTTP 流式服务
- Agent 多轮工具调用过程中，用户看不到实时进度
- 需要重写现有 `useWebSocket.ts` 为 SSE 客户端

---

## 三、方案 B：WebSocket（DO 代理）— 推荐

### 架构

```
浏览器                  Durable Object              Sandbox 容器
  │                       │                           │
  │── WS upgrade ────────→│                           │
  │                       │── sandbox.fetch(WS) ────→│
  │                       │   (容器内 WebSocket)       │
  │                       │←── WS connect ───────────│
  │                       │                           │
  │←─ WS connected ──────│                           │
  │                       │                           │
  │── message ───────────→│── WS proxy ─────────────→│
  │                       │   (agent 启动)             │
  │←─ assistant text ────│←── WS proxy ─────────────│
  │←─ tool_use ──────────│←── WS proxy ─────────────│
  │←─ tool_result ───────│←── WS proxy ─────────────│
  │←─ done ──────────────│←── WS proxy ─────────────│
  │                       │                           │
```

### 关键发现：`sandbox.fetch()` 支持内部 WebSocket

官方 `collaborative-terminal` 示例揭示了关键 API：

```typescript
// Worker/DO 向容器发起 WebSocket 连接（无需 tunnel！）
const wsRequest = new Request('http://container/ws', {
  headers: { Upgrade: 'websocket', Connection: 'Upgrade' }
});
const wsResponse = await sandbox.fetch(wsRequest);
const containerWs = wsResponse.webSocket;
containerWs.accept();

// 现在可以与容器内的 WebSocket 服务双向通信
containerWs.send(JSON.stringify({ type: 'message', data: 'hello' }));
containerWs.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  // 转发给浏览器客户端
});
```

这是**内部通信通道**，不走公网，不需要 tunnel，延迟极低。

### 核心代码（完整方案）

```typescript
import { getSandbox, Sandbox } from '@cloudflare/sandbox';
export { Sandbox };

// ChatSession Durable Object — 管理一个聊天会话
export class ChatSession implements DurableObject {
  private browserWs: WebSocket | null = null;
  private containerWs: WebSocket | null = null;
  private env: Env;

  constructor(_ctx: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // 浏览器 WebSocket 升级
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.browserWs = server;

      // 连接到容器内的 WebSocket 服务
      await this.connectToContainer();

      // 设置双向代理
      this.setupProxy();

      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Not found', { status: 404 });
  }

  private async connectToContainer() {
    const sandbox = getSandbox(this.env.Sandbox, 'chat-session');

    // 通过 sandbox.fetch() 向容器发起 WebSocket 连接
    const wsRequest = new Request('http://container/ws', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' }
    });
    const wsResponse = await sandbox.fetch(wsRequest);
    this.containerWs = wsResponse.webSocket;
    this.containerWs.accept();
  }

  private setupProxy() {
    // 浏览器 → 容器
    this.browserWs?.addEventListener('message', (event) => {
      this.containerWs?.send(event.data as string);
    });

    // 容器 → 浏览器
    this.containerWs?.addEventListener('message', (event) => {
      this.browserWs?.send(event.data as string);
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket 端点
    if (url.pathname === '/ws') {
      const id = env.ChatSession.idFromName('default');
      const session = env.ChatSession.get(id);
      return session.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};
```

### 容器内代码（基本复用现有代码）

```typescript
// 容器内 server/index.ts — 几乎不变！
import express from 'express';
import { WebSocketServer } from 'ws';
import { AgentSession } from './agent-client.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const agent = new AgentSession();
  // 现有的流转发逻辑完全保留
  agent.on('data', (data) => ws.send(JSON.stringify(data)));
  ws.on('message', (raw) => agent.sendMessage(raw.toString()));
  ws.on('close', () => agent.close());
});

server.listen(3000);
```

### 优点

1. **现有代码几乎零改动** — 容器内运行完整的 Express + WebSocket + claude-agent-sdk
2. **实时流式** — Agent 的每一个事件（文本、工具调用、工具结果）都实时传输
3. **双向通信** — 用户可以随时发送消息、上传文件
4. **DO 提供稳定连接** — 容器重启不影响浏览器连接（DO 自动重连容器）
5. **内部通信** — `sandbox.fetch()` 是内部通道，不走公网，低延迟
6. **无需 tunnel** — 不依赖 `*.trycloudflare.com` URL
7. **官方推荐模式** — collaborative-terminal 示例用的就是这个模式
8. **`useWebSocket.ts` 改动极小** — 只需改连接 URL

### 缺点

1. DO 内需要管理两个 WebSocket 的生命周期
2. 容器冷启动时需要等待 Express 服务就绪
3. DO 有 CPU 时间限制（但 WebSocket 等待不计入）

---

## 四、方案 C：WebSocket（Tunnel 直连）

### 架构

```
浏览器                    Cloudflare Edge           Sandbox 容器
  │                           │                       │
  │── WS wss://xxx.trycloudflare.com ───────────────→│
  │   (直连容器，经过 Cloudflare 边缘)                │
  │←── WS ←─────────────────────────────────────────│
```

### 核心代码

```typescript
// Worker
const sandbox = getSandbox(env.Sandbox, 'my-session');
const tunnel = await sandbox.tunnels.get(3015);
// tunnel.url → "https://random-words.trycloudflare.com"
// 前端直接连接这个 URL
```

### 优点
- 最简单 — 前端直连容器，Worker 几乎不参与
- 延迟低 — Cloudflare 边缘转发
- 现有 WebSocket 代码完全不变

### 缺点

1. **URL 不稳定** — 容器重启后 URL 变化，DNS 传播需几秒
2. **无法添加中间层** — Worker 无法在中间做鉴权、限流、日志
3. **安全问题** — 容器直接暴露在公网（虽然是 Cloudflare 域名）
4. **buffering 问题** — `*.trycloudflare.com` 会缓冲 `text/event-stream`（虽然 WebSocket 没问题）
5. **每次会话需要先获取 tunnel URL** — 多一次 API 调用

---

## 五、方案对比总结

| 维度 | A: SSE | **B: WS+DO 代理** | C: WS+Tunnel |
|------|--------|-------------------|-------------|
| **实时流式** | ❌ exec 阻塞 | ✅ 实时双向 | ✅ 实时双向 |
| **现有代码改动** | 大（重写通信层） | **小（URL 改一下）** | **小（URL 改一下）** |
| **Agent 中间输出** | ❌ 看不到 | ✅ 实时可见 | ✅ 实时可见 |
| **连接稳定性** | ✅ 每次请求独立 | ✅ DO 管理 | ⚠️ URL 变化 |
| **安全性** | ✅ Worker 控制 | ✅ DO 控制 | ⚠️ 容器暴露 |
| **官方示例** | code-interpreter | **collaborative-terminal** | README |
| **双向通信** | ❌ 单向 | ✅ 双向 | ✅ 双向 |
| **文件上传** | 需要 base64 | ✅ 原生支持 | ✅ 原生支持 |
| **鉴权/限流** | ✅ Worker 层 | ✅ DO 层 | ❌ 无中间层 |
| **容器重启恢复** | N/A | ✅ DO 自动重连 | ❌ URL 变化 |
| **复杂度** | 中（需重建流式） | **中（DO 代理）** | 低 |
| **适合场景** | 简单问答 | **AI Agent 长会话** | 快速原型 |

---

## 六、结论：推荐方案 B（WebSocket + DO 代理）

### 推荐理由

1. **官方最佳实践** — `collaborative-terminal` 示例就是这个模式，官方推荐
2. **改动最小** — 容器内代码几乎不变（Express + WS + claude-agent-sdk），前端 `useWebSocket.ts` 只改 URL
3. **实时流式** — Agent 的每一个输出（文本、工具调用、进度）都实时传输到前端，用户体验最佳
4. **连接稳定** — Durable Object 管理连接生命周期，容器重启可自动重连
5. **安全** — DO 可以做鉴权、限流、日志，API Key 通过凭证代理注入
6. **Skills 零改动** — .claude/skills/、Python 脚本全部保留

### 不推荐 SSE 的原因

对于 AI Agent 长会话场景，SSE 有致命短板：
- `sandbox.exec()` 是阻塞式的，无法在 Agent 执行过程中流式返回中间输出
- Agent 可能执行多轮工具调用（搜索 → 获取数据 → 生成图表），每一步都需要实时反馈
- 要实现真正的 SSE 流式，需要在容器内额外搭建 HTTP 流式服务，等于重新发明 WebSocket

### 改动量估算

| 文件 | 改动 |
|------|------|
| `src/hooks/useWebSocket.ts` | 改 1 行（URL） |
| `server/index.ts` | **几乎不变**（容器内运行） |
| `server/agent-client.ts` | **零改动** |
| `.claude/skills/*` | **零改动** |
| **新增** Worker DO | ~80 行（DO 代理） |
| **新增** Dockerfile | ~15 行 |
| **新增** wrangler.jsonc | ~30 行 |

**核心业务逻辑零改动。** 改动集中在部署配置（Dockerfile + wrangler）和新增 DO 代理层。
