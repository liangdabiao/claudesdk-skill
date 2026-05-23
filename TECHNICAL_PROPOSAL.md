# TikHub AI Chat Webapp - 技术方案

## 一、项目概述

基于 **Claude Agent SDK** 构建一个支持实时对话的 Web 应用，用户通过自然语言与 AI 助手交互，AI 自动调用 TikHub API 完成社交媒体数据查询。

**核心机制**：利用 Claude Agent SDK 的 **Skill 系统**，将 `tikhub-api-helper` 作为原生 Skill 注入。Claude 会自动发现该 Skill，读取 `SKILL.md` 中的指令，自主决定何时调用 `api_searcher.py` / `api_client.py`（通过 Bash 工具执行 Python 脚本）。无需手动封装 MCP 工具。

---

## 二、系统架构

```
┌──────────────────────────────────────────────┐
│              React Frontend (Vite)            │
│       Chat UI + Message Stream + Cards       │
└────────────────────┬─────────────────────────┘
                     │ WebSocket (ws://)
┌────────────────────▼─────────────────────────┐
│         Express + WebSocket Server            │
│       Session Manager + Message Router        │
└────────────────────┬─────────────────────────┘
                     │ query()
┌────────────────────▼─────────────────────────┐
│           Claude Agent SDK                    │
│   settingSources: ["project"]                │
│   allowedTools: ["Skill","Bash","Read",...]   │
│                                              │
│   ┌──────────────────────────────────┐       │
│   │  Skill: tikhub-api-helper        │       │
│   │  (从 .claude/skills/ 自动发现)    │       │
│   │                                  │       │
│   │  读取 SKILL.md → 获取调用指令     │       │
│   │  使用 Bash 工具执行:             │       │
│   │    python api_searcher.py ...    │       │
│   │    python api_client.py ...      │       │
│   └──────────────────────────────────┘       │
└────────────────────┬─────────────────────────┘
                     │ HTTPS (由 Python 脚本发起)
          ┌──────────▼───────────────────┐
          │     TikHub API Server         │
          │ (api.tikhub.io / tikhub.dev)  │
          └──────────────────────────────┘
```

### 关键区别：Skill vs Custom MCP Tools

| 方面 | ~~Custom MCP Tools~~ (旧方案) | **Skill 系统** (本方案) |
|------|------|------|
| 集成方式 | 手动编写 MCP Server + 5个 tool | 放置 SKILL.md，自动发现 |
| 调用路径 | `mcp__tikhub__search_api` | Claude 读 SKILL.md → 用 Bash 执行 Python |
| 维护成本 | 需同步维护 MCP 工具和 Python 脚本 | 只需维护 SKILL.md 和 Python 脚本 |
| 扩展性 | 每增加功能需改 MCP Server | 修改 SKILL.md 即可 |
| 本质 | 重新封装了一层 | 直接复用已有的 Skill 生态 |

---

## 三、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | React 18 + TypeScript | SPA 聊天界面 |
| **UI** | Tailwind CSS + shadcn/ui | 现代化聊天 UI |
| **构建** | Vite | 快速开发与构建 |
| **后端** | Express.js + ws | HTTP + WebSocket 服务 |
| **AI 引擎** | `@anthropic-ai/claude-agent-sdk` | Agent 驱动的多轮对话 |
| **能力集成** | SDK Skill 系统 + Bash | tikhub-api-helper 作为原生 Skill 加载 |
| **运行时** | Node.js 20+ | 服务端运行环境 |
| **Python** | Python 3 (标准库) | TikHub API 搜索与调用（Skill 内部使用） |

---

## 四、目录结构

```
tikhub-chat/
├── package.json
├── tsconfig.json
├── .env                            # ANTHROPIC_API_KEY, TIKHUB_TOKEN
│
├── .claude/
│   └── skills/
│       └── tikhub-api-helper/      # ← TikHub Skill (从原项目直接引用)
│           ├── SKILL.md            # Skill 定义文件 (Agent 自动读取)
│           ├── api_searcher.py     # API 搜索脚本
│           ├── api_client.py       # API 调用脚本
│           └── openapi.json        # TikHub OpenAPI 规格
│
├── server/                         # 后端服务
│   ├── index.ts                    # Express + WebSocket 入口
│   ├── session-manager.ts          # 聊天会话管理
│   ├── message-queue.ts            # 异步消息队列 (流式输入)
│   └── agent-client.ts             # Claude Agent SDK 封装 (核心)
│
├── src/                            # React 前端
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── ChatWindow.tsx          # 聊天窗口容器
│   │   ├── MessageList.tsx         # 消息列表
│   │   ├── MessageInput.tsx        # 输入框
│   │   ├── AssistantMessage.tsx    # AI 回复 (Markdown 渲染)
│   │   ├── ToolCallCard.tsx        # 工具/Skill 调用展示卡片
│   │   └── ResultCard.tsx          # API 结果展示卡片
│   ├── hooks/
│   │   └── useWebSocket.ts         # WebSocket 连接管理
│   └── types.ts                    # TypeScript 类型定义
│
└── public/
    └── index.html
```

---

## 五、核心模块设计

### 5.1 Agent Client (`server/agent-client.ts`) - 核心配置

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";

// 异步消息队列 - 支持流式输入
class MessageQueue {
  private messages: UserMessage[] = [];
  private waiting: ((msg: UserMessage) => void) | null = null;
  private closed = false;

  push(content: string) {
    const msg = { type: "user" as const, message: { role: "user" as const, content } };
    if (this.waiting) { this.waiting(msg); this.waiting = null; }
    else { this.messages.push(msg); }
  }

  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      if (this.messages.length > 0) yield this.messages.shift()!;
      else yield await new Promise<UserMessage>(r => { this.waiting = r; });
    }
  }

  close() { this.closed = true; }
}

// Agent 会话
export class AgentSession {
  private queue = new MessageQueue();
  private outputIterator: AsyncIterator<any>;
  private sdkSessionId: string | null = null;

  constructor() {
    // ★ 关键配置：通过 Skill 系统加载 tikhub-api-helper
    this.outputIterator = query({
      prompt: this.queue as any,
      options: {
        // 1. cwd 指向项目根目录，确保能找到 .claude/skills/
        cwd: path.resolve(process.cwd()),

        // 2. settingSources 加载 project 级配置，Skill 从 .claude/skills/ 发现
        settingSources: ["project"],

        // 3. allowedTools 必须包含 "Skill" 和 "Bash"
        //    - Skill: 触发 tikhub-api-helper skill
        //    - Bash:  Skill 内部需要执行 python 命令
        //    - Read:  Skill 可能需要读取文件
        allowedTools: ["Skill", "Bash", "Read", "Write"],

        // 4. 系统提示：引导 Agent 使用 Skill
        systemPrompt: `你是一个社交媒体数据助手，专注于帮助用户从 TikHub API 获取数据。

工作流程：
1. 理解用户想查什么平台、什么数据
2. 使用 tikhub-api-helper skill 搜索合适的 API
3. 查看参数详情后调用 API
4. 将结果整理为易读格式回复

支持平台：TikTok、抖音、小红书、Instagram、YouTube、Twitter 等。
用中文回复。`,

        maxTurns: 20,
        model: "sonnet",

        // 5. 传递环境变量，供 Python 脚本使用
        env: {
          ...process.env,
          TIKHUB_TOKEN: process.env.TIKHUB_TOKEN,
        },
      },
    })[Symbol.asyncIterator]();
  }

  sendMessage(content: string) {
    this.queue.push(content);
  }

  async *getOutputStream() {
    while (true) {
      const { value, done } = await this.outputIterator.next();
      if (done) break;
      // 捕获 session_id 用于多轮对话 resume
      if (value?.type === 'system' && value?.subtype === 'init') {
        this.sdkSessionId = value.session_id;
      }
      yield value;
    }
  }

  getSessionId() { return this.sdkSessionId; }
  close() { this.queue.close(); }
}
```

### 5.2 WebSocket 服务 (`server/index.ts`)

```typescript
import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { AgentSession } from "./agent-client.js";

interface Session {
  id: string;
  agent: AgentSession;
  subscribers: Set<WebSocket>;
  isProcessing: boolean;
}

const sessions = new Map<string, Session>();

function getOrCreateSession(chatId: string): Session {
  let session = sessions.get(chatId);
  if (!session) {
    session = { id: chatId, agent: new AgentSession(), subscribers: new Set(), isProcessing: false };
    sessions.set(chatId, session);
    // 启动输出流监听
    startListening(session);
  }
  return session;
}

async function startListening(session: Session) {
  try {
    for await (const message of session.agent.getOutputStream()) {
      const wsMessage = formatMessage(message);
      if (wsMessage) {
        broadcast(session, wsMessage);
      }
    }
  } catch (error: any) {
    broadcast(session, { type: "error", error: error.message });
  }
}

function formatMessage(message: any) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") {
        return { type: "assistant_message", content: block.text };
      }
      if (block.type === "tool_use") {
        return { type: "tool_use", toolName: block.name, toolInput: block.input };
      }
    }
  }
  if (message.type === "result") {
    return { type: "result", success: message.subtype === "success", cost: message.total_cost_usd, duration: message.duration_ms };
  }
  return null;
}

function broadcast(session: Session, data: any) {
  const msg = JSON.stringify(data);
  for (const client of session.subscribers) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

// --- Server Setup ---
const app = express();
app.use(express.static("dist")); // 静态文件服务 (前端构建产物)

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === "subscribe") {
      const session = getOrCreateSession(msg.chatId);
      session.subscribers.add(ws);
    }

    if (msg.type === "chat") {
      const session = getOrCreateSession(msg.chatId);
      session.subscribers.add(ws);
      session.agent.sendMessage(msg.content);
    }
  });

  ws.on("close", () => {
    for (const session of sessions.values()) {
      session.subscribers.delete(ws);
    }
  });
});

server.listen(3001, () => {
  console.log("Server running at http://localhost:3001");
  console.log("WebSocket at ws://localhost:3001/ws");
});
```

### 5.3 前端 WebSocket Hook (`src/hooks/useWebSocket.ts`)

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage, WSMessage } from "../types";

export function useWebSocket(url: string) {
  const ws = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    ws.current = new WebSocket(url);

    ws.current.onopen = () => setIsConnected(true);
    ws.current.onclose = () => setIsConnected(false);

    ws.current.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);

      switch (data.type) {
        case "assistant_message":
          setIsThinking(false);
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.content,
            timestamp: Date.now(),
          }]);
          break;

        case "tool_use":
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: "system",
            content: `调用工具: ${data.toolName}`,
            toolCall: { name: data.toolName, input: data.toolInput, status: "running" },
            timestamp: Date.now(),
          }]);
          break;

        case "result":
          setIsThinking(false);
          break;
      }
    };

    return () => ws.current?.close();
  }, [url]);

  const sendMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(), role: "user", content, timestamp: Date.now(),
    }]);
    setIsThinking(true);
    ws.current?.send(JSON.stringify({ type: "chat", chatId: "default", content }));
  }, []);

  return { messages, sendMessage, isConnected, isThinking };
}
```

### 5.4 Skill 加载机制说明

Skill 系统的工作原理（**无需编写任何胶水代码**）：

```
SDK 启动
  → settingSources: ["project"]
  → 扫描 .claude/skills/ 目录
  → 发现 tikhub-api-helper/SKILL.md
  → 读取 SKILL.md 的 name + description
  → 注册为可用 Skill

用户发送消息: "帮我查一下TikTok用户 xxx"
  → Claude 判断需要使用 tikhub-api-helper Skill
  → 触发 Skill 工具
  → 加载完整 SKILL.md 内容作为上下文
  → Claude 根据 SKILL.md 中的指令：
      1. 调用 Bash: python api_searcher.py "tiktok user profile"
      2. 调用 Bash: python api_searcher.py detail:tiktok_web_fetch_user_profile_get
      3. 调用 Bash: python api_client.py GET /api/v1/tiktok/web/fetch_user_profile "sec_user_id=xxx"
  → 解析结果并格式化回复
```

---

## 六、WebSocket 通信协议

### 客户端 → 服务端

```json
{ "type": "subscribe", "chatId": "default" }
{ "type": "chat", "chatId": "default", "content": "帮我搜索抖音上关于美食的热门视频" }
```

### 服务端 → 客户端

```json
{ "type": "assistant_message", "content": "好的，我来帮你搜索抖音上关于美食的热门视频。" }
{ "type": "tool_use", "toolName": "Skill", "toolInput": { "skill": "tikhub-api-helper" } }
{ "type": "tool_use", "toolName": "Bash", "toolInput": { "command": "python .claude/skills/tikhub-api-helper/api_searcher.py \"抖音视频搜索\"" } }
{ "type": "tool_use", "toolName": "Bash", "toolInput": { "command": "python .claude/skills/tikhub-api-helper/api_client.py GET /api/v1/douyin/web/fetch_search_video \"keyword=美食&count=10\"" } }
{ "type": "assistant_message", "content": "找到了 10 个美食相关的热门视频：\n\n1. 【标题1】 - 作者: xxx | 点赞: 12.5万\n..." }
{ "type": "result", "success": true, "cost": 0.003, "duration": 8500 }
```

---

## 七、典型交互流程

```
用户: "帮我搜索抖音上关于美食的热门视频"

AI 内部流程 (通过 Skill 自主决策):
  1. [Skill: tikhub-api-helper 被触发]
  2. [Bash] python api_searcher.py "抖音视频搜索"
     → 找到: /api/v1/douyin/web/fetch_search_video
  3. [Bash] python api_searcher.py detail:douyin_web_fetch_search_video_get
     → 获取参数: keyword(必填), offset, count
  4. [Bash] python api_client.py GET /api/v1/douyin/web/fetch_search_video
           "keyword=美食&count=10"
     → 返回视频列表 JSON

AI 回复: "找到了 10 个美食相关的热门视频：

  1. 【标题1】 - 作者: xxx | 点赞: 12.5万
  2. 【标题2】 - 作者: yyy | 点赞: 8.3万
  ...

需要查看某个视频的详细信息吗？"
```

---

## 八、环境变量配置

```env
# Claude API (必须)
ANTHROPIC_API_KEY=sk-ant-xxx

# TikHub API Token (必须, 供 api_client.py 使用)
TIKHUB_TOKEN=your_tikhub_bearer_token

# 服务配置
PORT=3001
NODE_ENV=development
```

---

## 九、开发步骤

### Phase 1: 项目初始化 + Skill 配置 (Day 1)
1. 初始化 Node.js 项目，安装 `@anthropic-ai/claude-agent-sdk` + `express` + `ws`
2. 将 `tikhub-api-helper/` 复制到 `.claude/skills/tikhub-api-helper/`
3. 创建 `.env` 配置文件
4. 验证 Skill 加载：编写最小 `query()` 调用测试

### Phase 2: 后端服务 (Day 1-2)
5. 实现 `MessageQueue` (流式输入)
6. 实现 `AgentSession` (Agent Client)
7. 实现 Express + WebSocket 服务端
8. 端到端测试：WebSocket → Agent → Skill → TikHub API → 回复

### Phase 3: 前端开发 (Day 2-3)
9. 搭建 React + Vite + Tailwind 项目
10. 实现聊天 UI 组件
11. 实现 WebSocket 连接和消息状态管理
12. 实现工具/Skill 调用卡片展示

### Phase 4: 优化与部署 (Day 3-4)
13. 流式渲染优化 (partial message streaming)
14. 错误处理和重试机制
15. 成本控制 (`maxBudgetUsd`)
16. 前端构建 + 静态文件服务整合

---

## 十、关键技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| TikHub 集成方式 | **Skill 系统** | tikhub-api-helper 已有 SKILL.md，零胶水代码 |
| Skill 触发机制 | `settingSources: ["project"]` + `"Skill"` in allowedTools | SDK 自动从 `.claude/skills/` 发现 |
| Python 执行 | Agent 通过 Bash 工具调用 | Skill 内部指令已定义为 Bash 命令 |
| Agent 模式 | `query()` + MessageQueue | 流式输入输出，适合 WebSocket |
| 会话管理 | SDK session_id + resume | 内置多轮对话能力 |
| 模型 | Sonnet | 平衡成本和效果 |

---

## 十一、风险与应对

| 风险 | 影响 | 应对方案 |
|------|------|----------|
| Skill 未被触发 | Claude 忽略 Skill | 优化 systemPrompt，明确提示使用 tikhub-api-helper skill |
| TikHub API 限流 (10 QPS) | 请求被拒 | systemPrompt 提醒 Agent 控制调用频率 |
| Claude API 成本 | 超预算 | `maxBudgetUsd` + `maxTurns` 限制 |
| Python 脚本执行失败 | 工具调用错误 | Bash 超时设置 + 错误回退提示 |
| WebSocket 断连 | 会话丢失 | 前端自动重连 + 后端 session 保留 |

---

## 十二、依赖清单

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "express": "^4.21.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^4.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

**Python 依赖**：无（tikhub-api-helper 仅使用 Python 标准库）

---

## 十三、未来扩展

- **多 Skill 支持**：轻松添加更多 `.claude/skills/` 下的 Skill（如数据分析、PDF 处理等）
- **用户认证**：OAuth 多用户，各自使用自己的 TikHub Token
- **历史记录**：对话持久化到 SQLite
- **多模型切换**：前端切换 Opus / Sonnet / Haiku
- **Docker 部署**：一键容器化
