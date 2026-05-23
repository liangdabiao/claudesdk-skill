# claudesdk-skill

探索 Claude Agent SDK 能力的实验项目。通过 Skill 系统让 AI 理解 SDK 文档，进而自主构建了一个 TikHub 社交媒体数据对话助手。

本项目展示了利用skill: ` .claude/skills/claude-agent-sdk` 建立新的 claude-agent-sdk 项目`tikhub-chat`， `tikhub-chat`项目是基于 https://github.com/liangdabiao/tikhub_api_skill  tikhub skill 封装成 webapp 社交媒体数据对话助手。

---


## 解决问题：怎样利用skill 一键建立 skill 转 webapp ?

在claude code/ codex 中： 

❯ 复制本项目的 skill: ` .claude/skills/claude-agent-sdk` 到你的新建文件夹。

❯ ask AI:::利用 claude-agent-sdk 建立一个 能够chat对话的 webapp, 而对接的功能参考skill： tikhub-api-helper/
  ,请你先深度研究出一个技术方案，写在文档给我检查.

### 最后进行端对端测试：  
（注意：要有充分的调试log，让AI能够得到反馈信息）

❯ ask AI:::你需要检查，端对端测试，检查调试log，流程和功能是否完成和正常，agent探索的路径是否正常，探索的文件应该是 skill内部的文件，例如里面的api文档等等


![](./图片1.png)
![](./图片2.png)

### harness 原则：

- 理解： 给了全面的文档和案例代码 ，在我开发的 skill: claude-agent-sdk skill
- 约束： 提示语要求 claude-agent-sdk， 和python或者typescript
- 验证： 要求ai端对端进行测试，充分利用了playwright 和 调试log，自己测试自己发现问题自己想办法解决。

### 使用步骤：

1， 把你的skills 放在根目录

2， 把我的 sdk skill 放进你的codex/claude code

3， 命令ai ： 利用 claude-agent-sdk 建立一个 能够chat对话的 webapp,
而对接和利用的skills功能参考： 你的skills/
,请你先深度研究出一个技术方案，技术方案要以skills技术为核心。写在文档给我检查

4， ❯ 检查了，很好，就是这样。 而 .env我也给你了，请你一步一步认真完成工作

5, 端到端测试， 注意检查agent有没有利用好 skill技术

6， 自己测试一下，那么就完成了！ [任何skill转为对外开放agent]

## 项目背景

### 起因

Claude Agent SDK 是 Anthropic 推出的用于构建 AI Agent 应用的框架。为了让 AI 理解这个 SDK 的能力和用法，我们利用 SDK 自身的 **Skill 系统** 来实现"AI 自学 SDK"：

```
.claude/skills/claude-agent-sdk/    ← AI 阅读这份文档来理解 SDK
├── SKILL.md                         SDK 核心概念、API、代码示例
├── references/                      补充参考文档
└── scripts/                         辅助脚本
```

AI（Claude Code）在对话中自动发现这个 Skill，读取 `SKILL.md` 中的 SDK 文档，理解了 `query()`、`settingSources`、`allowedTools`、`MessageQueue` 等 API，然后基于这些知识设计了技术方案并实现了 `tikhub-chat/` 项目。

### 开发过程

```
1. 准备知识源
   .claude/skills/claude-agent-sdk/SKILL.md  →  AI 理解 SDK 能力

2. 准备业务能力
   tikhub-chat/.claude/skills/tikhub-api-helper/  →  AI 获得调用 TikHub API 的能力
   ├── SKILL.md              API 使用指南
   ├── api_searcher.py       搜索 API 端点
   ├── api_client.py         发起 API 请求
   └── openapi.json          完整 API 规格

3. AI 自主设计方案
   → 研读 SDK 文档 → 输出 TECHNICAL_PROPOSAL.md

4. 逐步实现
   → 后端 (Express + WebSocket + SDK)
   → 前端 (React + Vite + Tailwind)
   → 集成测试 → 调试 → 完成
```

---

## 核心原理：Skill 系统

整个项目的关键在于理解 Claude Agent SDK 的 **Skill 机制**：

### 什么是 Skill？

Skill 是放置在 `.claude/skills/` 目录下的 `SKILL.md` 文件。SDK 通过 `settingSources: ["project"]` 配置自动扫描并加载这些文件。AI 在对话中会根据用户需求自主决定是否使用某个 Skill。

### Skill 不等于 MCP Tool

| | Custom MCP Tool | Skill |
|---|---|---|
| **定义方式** | 编写 TypeScript 代码注册 tool | 写一个 `SKILL.md` 文件 |
| **调用方式** | `mcp__server__tool_name` | AI 读 SKILL.md → 用 Bash/Read 等内置工具执行 |
| **灵活性** | 固定接口，参数预定义 | AI 自主探索，决定如何使用 |
| **维护成本** | 需同步维护代码和底层脚本 | 只维护 SKILL.md 和底层脚本 |
| **适用场景** | 确定性操作 | 开放式、需要 AI 判断的任务 |

### 本项目如何使用 Skill

```
用户: "小红书今天热门"
  ↓
AI 判断需要调用 TikHub API
  ↓
触发 tikhub-api-helper Skill
  ↓
AI 读取 SKILL.md，理解工作流程
  ↓
AI 自主决定执行:
  1. Bash: python api_searcher.py "小红书"     → 搜索端点
  2. Bash: python api_searcher.py detail:xxx   → 查看参数
  3. Bash: python api_client.py POST /api/...  → 调用 API
  4. 整理结果，中文回复用户
```

AI 不是机械地调用预定义接口，而是像一个真实的开发者一样：阅读文档 → 搜索方案 → 尝试调用 → 遇到问题调试 → 最终解决。

---

## 项目结构

```
claudesdk-skill/
├── .claude/skills/
│   └── claude-agent-sdk/         # SDK 知识源（让 AI 理解 SDK）
│       ├── SKILL.md
│       ├── references/
│       └── scripts/
│
├── tikhub-chat/                   # 主项目：TikHub AI Chat Webapp
│   ├── .claude/skills/
│   │   └── tikhub-api-helper/    # 业务 Skill（让 AI 能操作 TikHub API）
│   │       ├── SKILL.md
│   │       ├── api_searcher.py
│   │       ├── api_client.py
│   │       └── openapi.json
│   │
│   ├── server/                    # 后端
│   │   ├── index.ts              # Express + WebSocket 服务
│   │   ├── agent-client.ts       # SDK 核心配置（Skill 加载、工具授权）
│   │   ├── message-queue.ts      # 异步消息队列（流式输入）
│   │   └── logger.ts             # 文件日志系统
│   │
│   ├── src/                       # 前端 (React + Vite + Tailwind)
│   │   ├── App.tsx
│   │   ├── components/           # 聊天 UI 组件
│   │   ├── hooks/useWebSocket.ts # WebSocket 连接管理
│   │   └── types.ts
│   │
│   ├── logs/                      # 运行日志（自动生成）
│   ├── .env                       # 环境变量
│   ├── README.md                  # 项目详细文档
│   └── TECHNICAL_PROPOSAL.md     # 技术方案（AI 生成）
│
└── README.md                      # ← 本文件
```

---

## tikhub-chat 使用方法

### 前置要求

- Node.js 20+
- Python 3.x（标准库即可）
- Claude Code CLI（SDK 依赖，`claude --version` 检查）
- 有效的 Anthropic API Key 或兼容接口

### 快速开始

```bash
cd tikhub-chat
npm install

# 配置环境变量
# 编辑 .env，填入：
#   ANTHROPIC_API_KEY=xxx        # AI 模型 API Key
#   ANTHROPIC_BASE_URL=           # 可选，第三方兼容接口地址
#   MODEL=sonnet                 # 模型名称
#   TIKHUB_TOKEN=xxx             # TikHub API Token

# 启动
npm run dev
```

访问 http://localhost:5173 ，用自然语言提问即可。

### 可用命令

```bash
npm run dev          # 开发模式（前后端同时启动）
npm run dev:server   # 仅后端
npm run dev:client   # 仅前端
npm run build        # 构建
```

### 示例对话

| 你说 | AI 做什么 |
|------|----------|
| "TikHub 支持哪些平台" | 搜索 API tags，列出 55 个平台 |
| "搜索 TikTok 上游戏的视频" | 搜索 API → 调用 search_video |
| "抖音美食热门视频" | 搜索 API → 调用抖音搜索 |
| "小红书今天热门" | 搜索 API → 调用首页推荐 |

---

## 调试指南

### 查看日志

所有 AI 行为记录在 `tikhub-chat/logs/chat-YYYY-MM-DD.log`：

```
[02:24:28][ToolCall] Bash {"command":"python api_searcher.py \"xiaohongshu\"","description":"..."}
[02:25:04][ToolCall] Bash {"command":"python api_client.py POST /api/v1/xiaohongshu/web/get_home_recommend '{}'","timeout":30000}
[02:25:55][AI] 找到了！小红书有获取首页推荐的 API...
[02:26:44][Result] error_max_turns cost: 0.65 duration: 261649ms
```

每条日志包含：AI 回复、工具调用（含完整参数和命令）、执行结果、费用。

### 健康检查

```bash
curl http://localhost:3001/api/health
```

返回模型配置、API Key 状态、会话数等信息。


---

## 技术栈

| 组件 | 技术 |
|------|------|
| AI 框架 | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| 后端 | Express.js + WebSocket (ws) |
| 前端 | React 18 + Vite + Tailwind CSS |
| Skill - 知识 | claude-agent-sdk (SDK 文档) |
| Skill - 业务 | tikhub-api-helper (Python, 零依赖) |
| API | TikHub API (40+ 社交媒体平台) |

---

### 常见问题

**AI 不回复**：检查 `.env` 中 API Key 是否有效，看 `logs/` 中是否有 SDK 错误。

**Skill 未触发**：确认 `.claude/skills/tikhub-api-helper/SKILL.md` 存在，且 `settingSources: ["project"]` 已配置。

**Token 认证失败**：Agent 会自主尝试调试（读源码、换域名、检查环境变量）。如果反复失败，需更换有效的 TikHub Token。

---
  开发 tikhub-chat 过程中遇到的所有问题

  1. 环境变量被系统覆盖

  现象：.env 写了 ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic，但 SDK 实际用的是
  https://api.siliconflow.cn/，API Key 也不同。

  根因：系统环境变量（用户全局设置的 ANTHROPIC_*）优先级高于 .env 文件。dotenv.config()
  默认不覆盖已有的 env var。

  解决：dotenv.config({ override: true }) 强制 .env 优先。

  建议写入 SKILL：
  ## Common Gotchas - 环境变量覆盖
  当系统已设置 ANTHROPIC_API_KEY、ANTHROPIC_BASE_URL 等环境变量时，dotenv 默认不会覆盖。
  如果项目使用 .env 文件管理配置，必须使用 dotenv.config({ override: true })。
  否则 SDK 会使用系统环境变量而非 .env 中的值，导致连接到错误的 API 端点。

  ---
  2. React 18 StrictMode 导致重复 WebSocket 连接

  现象：前端显示每条 AI 消息出现两次。服务端日志显示 4 个客户端订阅了同一 session。

  根因：React 18 的 <StrictMode> 在开发模式下会双重挂载组件，useEffect 执行两次，创建两个
  WebSocket 连接。

  解决：用 mountedRef 守卫防止重复连接，cleanup 时正确关闭旧连接。

  建议写入 SKILL：
  ## WebSocket 聊天应用模式 - React StrictMode 问题
  React 18 StrictMode 在开发模式双重挂载组件，导致 WebSocket 连接重复。
  解决模式：
  1. 使用 mountedRef 守卫：mountedRef.current = true 在 useEffect 中设置
  2. connect() 先关闭旧连接再建新连接
  3. cleanup 函数中 mountedRef.current = false 并关闭 ws
  4. ws.onclose 中检查 mountedRef 再决定重连

  ---
  3. SDK env 选项未传播到 Bash 子进程

  现象：Agent 通过 Bash 执行 echo $TIKHUB_TOKEN 显示 NOT SET，尽管 env 选项已传入。

  根因：SDK 的 env 选项传给了 Claude Code CLI 进程，但 CLI 在创建 Bash
  子进程时不一定完整传播所有环境变量。

  解决：api_client.py 内置 DEFAULT_TOKEN 作为 fallback。对于必须的环境变量，让底层脚本有自己的
  fallback 机制。

  建议写入 SKILL：
  ## 环境变量传播 - env 选项的限制
  SDK options.env 传给 Claude Code CLI 进程，但 CLI 创建的 Bash 子进程可能无法访问所有变量。
  关键环境变量（API Token 等）不要仅依赖 env 传播，应在底层脚本中提供 fallback 机制。
  可通过 SKILL.md 指导 AI 读取 .env 文件或在命令中显式传递变量。

  ---
  4. Permission Mode 选择

  现象：使用 permissionMode: "acceptEdits" 时，Agent 执行 Bash 命令会卡住等待权限确认。

  根因：acceptEdits 只自动批准文件编辑，Bash 命令仍需确认。Webapp 场景下没有交互式终端来确认。

  解决：Webapp/服务端场景使用 permissionMode: "bypassPermissions"。

  建议写入 SKILL：
  ## Permission Mode - 服务端/Webapp 场景
  构建无人值守的 Web 服务时，使用 permissionMode: "bypassPermissions"。
  其他模式（default, acceptEdits）需要交互式终端确认权限，会导致 Agent 挂起。
  注意：bypassPermissions 意味着 Agent 可执行任意 Bash 命令，需通过 allowedTools 限制工具范围。

  ---
  5. SDK 懒初始化 — 不要在构造函数中启动 query()

  现象：构造函数中 this.outputIterator = query(...) 导致 iterator 在消息到达前就创建，但
  getOutputStream() 还没被调用，消息堆积在 queue 中没人消费。

  根因：query() 创建后立即开始从 prompt（MessageQueue）读取。如果没有消费者（for await
  循环），产出就丢失了。

  解决：懒初始化模式 — ensureStarted() 在第一次 sendMessage() 时才调用 query()。

  建议写入 SKILL：
  ## 懒初始化模式 - WebSocket 聊天应用
  不要在构造函数中调用 query()。使用懒初始化：
  1. constructor 只创建 MessageQueue
  2. ensureStarted() 在第一次 sendMessage() 时调用
  3. 先 sendMessage() 确保 outputIterator 已初始化
  4. 再 startListening() 消费 outputIterator
  顺序：sendMessage → ensureStarted → outputIterator 创建 → startListening → 消费输出

  ---
  6. maxTurns 需要足够大

  现象：Agent 在复杂查询（如"小红书今天热门"）中耗尽了 20-30 轮：搜索 API → 查看详情 → 调用 API
   → 认证失败 → 调试 → 重试 → 用 WebSearch 备选。

  根因：Skill 驱动的任务每一步都是一轮（assistant + tool +
  user(result)）。调试和错误恢复消耗大量轮次。

  解决：复杂任务 maxTurns 设为 50+。简单任务可 10-20。

  建议写入 SKILL：
  ## maxTurns 设置建议
  Skill 驱动的任务消耗轮次较多：
  - 简单查询（列出平台 tags）：5-10 轮
  - 单次 API 调用（搜索+查参+调用）：10-15 轮
  - 需要调试的任务（API 认证失败、参数错误）：30-50 轮
  - 复杂任务建议 maxTurns: 50，同时设 maxBudgetUsd 控制成本

  ---
  7. systemPrompt 不应该写死路径和工作流

  现象：第一次方案在 systemPrompt 中硬编码了脚本路径和工具使用指令，反而限制了 AI
  的探索能力，导致 AI 调用了 health/check 而不是真正的小红书 API。

  根因：Skill 系统的设计意图是让 AI 自主阅读 SKILL.md、探索文件、决定工作流。systemPrompt
  过于具体反而干扰了 AI 的判断。

  解决：systemPrompt 保持极简，只说明角色和目标，让 Skill 系统和 AI 自主决定怎么做。

  建议写入 SKILL：
  ## systemPrompt 与 Skill 系统的配合
  使用 Skill 时，systemPrompt 应保持简洁，只定义角色和目标。不要在 systemPrompt 中：
  - 写死文件路径（Skill 内部已有定义）
  - 指定具体工具调用流程（AI 会读 SKILL.md 自行决定）
  - 限制 AI 的探索方式（disallowedTools 会阻止必要的探索）
  正确做法：简短的 systemPrompt + 完善的 SKILL.md

  ---
  8. 不应该限制 AI 的探索工具

  现象：最初设置 disallowedTools: ["Glob", "Grep"]，导致 AI 无法搜索 openapi.json 中的 API
  详情，只能盲目尝试。

  根因：AI 需要 Glob/Grep 来读取大型 JSON 文件、搜索代码模式，这是 Skill 探索过程的一部分。

  解决：allowedTools 给出合理范围（Skill, Bash, Read, Write, Glob, Grep），不要额外禁止。

  ---
  9. 第三方 API 兼容性

  现象：使用 DeepSeek/SiliconFlow 的 Anthropic 兼容接口时，第一次测试 API 挂起无响应。

  根因：系统环境变量覆盖导致连接到了错误的 API 端点（SiliconFlow 而非 DeepSeek），Token
  不匹配。

  解决：修复 env override 后正常工作。但需注意第三方 API 必须支持 Anthropic Messages API
  的完整格式（含 tool use）。

  建议写入 SKILL：
  ## 第三方 API 兼容性
  SDK 支持 Anthropic 兼容接口（如 DeepSeek），通过 ANTHROPIC_BASE_URL 配置。
  要求：第三方 API 必须完全兼容 Anthropic Messages API 格式，包括：
  - tool_use / tool_result 消息格式
  - system prompt 格式
  - streaming 响应格式
  不兼容的 API 会导致 SDK 子进程挂起或崩溃。

  ---
  10. 前端 WebSocket URL 与 Vite 代理

  现象：前端直连 ws://localhost:3001/ws，但应该通过 Vite 代理（5173）。

  根因：Vite dev server 配置了 /ws 代理到 3001，前端应该连接到当前页面 host。

  解决：${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws

  建议写入 SKILL：
  ## Vite 开发环境 WebSocket 配置
  前端 WebSocket URL 应使用 window.location.host（而非硬编码后端端口）：
  - ws URL: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
  - Vite 配置 proxy: { "/ws": { target: "ws://localhost:3001", ws: true } }
  这样前端通过 Vite 代理连接后端，避免跨域和直连问题。

  ---
  11. 文件日志系统

  现象：Webapp 运行时 stdout 不容易查看，需要文件日志来调试。

  解决：所有 SDK 消息、工具调用（含完整 JSON）、AI 回复、错误信息写入
  logs/chat-YYYY-MM-DD.log。

  建议写入 SKILL：
  ## 文件日志 — Webapp 调试必备
  构建 Web 应用时，stdout 日志不可靠。必须实现文件日志：
  - 记录所有 ToolCall（含完整 command 和 input JSON）
  - 记录 AI 回复文本
  - 记录 Result（成本、耗时）
  - 记录 SDK stderr 输出
  日志格式：[HH:MM:SS][Tag] content

  ---
  12. MessageQueue close() 需要解除阻塞

  现象：close() 设置 this.closed = true 但不解除正在等待的 iterator，导致永久挂起。

  解决：close() 时如果有等待中的 promise，push 一个 sentinel 值来解除阻塞。

  建议写入 SKILL：已有 MessageQueue 代码示例，补充 close 的 sentinel 逻辑。

  ---
  13. Vite index.html 位置

  现象：vite build 报错 Could not resolve entry module "index.html"。

  根因：index.html 放在 public/ 目录下，Vite 要求在项目根目录。

  解决：将 index.html 移到项目根目录。

  ---
  14. stderr 回调是关键调试信息

  现象：SDK 子进程错误只输出到 stderr，不配置回调就看不到。

  解决：始终配置 stderr: (data) => { ... } 选项。

  ---
  15. Subscribe 时不应启动监听

  现象：subscribe 消息到达时创建 session 并 startListening，但没有 chat 消息触发
  ensureStarted，导致 getOutputStream() 进入空转循环（每 50ms 检查 outputIterator，每 2s
  打日志）。

  解决：subscribe 只注册订阅者，startListening 延迟到第一条 chat 消息时触发。

  ---


### 特别感谢：

https://linux.do  佬友支持，
https://liang.348349.xyz/  更多agent项目