# TikHub AI Chat

基于 Claude Agent SDK 的社交媒体数据对话助手。用户通过自然语言与 AI 对话，AI 自动调用 TikHub API 获取 TikTok、抖音、小红书、Instagram 等平台的数据。

## 架构

```
React (Vite)  ←──WebSocket──→  Express + Claude Agent SDK  ──Skill──→  TikHub API
  :5173              :3001              ↓                              api.tikhub.io
                                       .claude/skills/
                                       tikhub-api-helper/
```

**核心机制**：Claude Agent SDK 的 Skill 系统自动发现 `.claude/skills/tikhub-api-helper/`，AI 读取 `SKILL.md` 指令后通过 Bash 工具执行 Python 脚本，完成 API 搜索与调用。

## 前置要求

- [Node.js](https://nodejs.org/) 20+
- [Python](https://www.python.org/) 3.x（标准库即可，无需 pip 安装）
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)（SDK 依赖）

```bash
# 确认环境
node -v          # >= 20
python --version # >= 3.x
claude --version # 已安装
```

## 快速开始

### 1. 安装依赖

```bash
cd tikhub-chat
npm install
```

### 2. 配置环境变量

复制并编辑 `.env` 文件：

```bash
cp .env.example .env
```

```env
# AI 模型 API（支持 Anthropic 官方或兼容接口）
ANTHROPIC_API_KEY=sk-ant-xxx              # Anthropic 官方
ANTHROPIC_BASE_URL=                        # 留空则使用官方地址
MODEL=sonnet                               # 模型名称

# 第三方兼容接口示例（二选一，不要同时配置）
# ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
# MODEL=deepseek-v4-flash

# TikHub API Token（从 https://www.tikhub.io 获取）
TIKHUB_TOKEN=your_token_here

# 服务端口
PORT=3001
```

> **注意**：如果使用第三方 API 接口，需确保其兼容 Anthropic Messages API 格式（含 tool use 支持）。

### 3. 启动

```bash
# 开发模式（前后端同时启动）
npm run dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001
- WebSocket：ws://localhost:3001/ws

## 使用方式

打开 http://localhost:5173 ，在输入框中用自然语言提问：

| 示例提问 | AI 会做什么 |
|----------|------------|
| "列出 TikHub 支持哪些平台" | 执行 `api_searcher.py tags` |
| "搜索 TikTok 用户 xxx 的资料" | 搜索 API → 调用 `fetch_user_profile` |
| "抖音上美食热门视频有哪些" | 搜索 API → 调用 `fetch_search_video` |
| "查一下小红书某个帖子的评论" | 搜索 API → 调用评论接口 |

AI 内部流程：理解意图 → 搜索合适 API → 查看参数 → 调用 API → 整理结果回复。

## 项目结构

```
tikhub-chat/
├── .claude/skills/
│   └── tikhub-api-helper/     # TikHub Skill（SDK 自动发现）
│       ├── SKILL.md            # Skill 定义与指令
│       ├── api_searcher.py     # API 端点搜索
│       ├── api_client.py       # API HTTP 调用
│       └── openapi.json        # TikHub OpenAPI 规格
│
├── server/                     # 后端
│   ├── index.ts                # Express + WebSocket 入口
│   ├── agent-client.ts         # Claude Agent SDK 配置
│   └── message-queue.ts        # 异步消息队列
│
├── src/                        # 前端（React + Vite + Tailwind）
│   ├── App.tsx                 # 主应用
│   ├── components/             # UI 组件
│   │   ├── AssistantMessage.tsx
│   │   ├── UserMessage.tsx
│   │   ├── ToolCallCard.tsx    # 工具调用状态卡片
│   │   ├── MessageList.tsx
│   │   └── MessageInput.tsx
│   ├── hooks/
│   │   └── useWebSocket.ts     # WebSocket 连接管理
│   └── types.ts
│
├── .env                        # 环境变量
├── vite.config.ts              # Vite 配置（含 WebSocket 代理）
└── package.json
```

## 关键配置说明

### agent-client.ts — SDK 核心配置

```typescript
query({
  prompt: this.queue,           // 异步消息队列（流式输入）
  options: {
    settingSources: ["project"],  // ← 加载 .claude/skills/ 下的 Skill
    allowedTools: ["Skill", "Bash", "Read"],  // ← Skill 触发 + Bash 执行脚本
    model: process.env.MODEL,
    env: { ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, TIKHUB_TOKEN },
  }
})
```

- `settingSources: ["project"]` — 扫描 `.claude/skills/` 发现 Skill
- `allowedTools: ["Skill"]` — 启用 Skill 调用能力
- `allowedTools: ["Bash"]` — Skill 内部需执行 Python 命令

### vite.config.ts — 开发代理

```typescript
server: {
  proxy: {
    "/ws": { target: "ws://localhost:3001", ws: true },
    "/api": { target: "http://localhost:3001" },
  }
}
```

前端通过 Vite 代理连接后端 WebSocket，避免跨域问题。

## 支持的 TikHub 平台

共 55 个 API 分类，涵盖：

| 平台 | API 数量 |
|------|---------|
| TikTok | 58+ |
| 抖音 | 76+ |
| 小红书 | 26+ |
| Instagram | 26+ |
| YouTube | 16+ |
| Twitter | 13+ |
| Reddit | 23+ |
| B站 | 24+ |
| 微博 | 33+ |
| 快手 | 20+ |

完整列表运行 `python .claude/skills/tikhub-api-helper/api_searcher.py tags` 查看。

## 其他命令

```bash
npm run dev          # 开发模式（前后端同时启动）
npm run dev:server   # 仅启动后端
npm run dev:client   # 仅启动前端
npm run build        # 构建前后端
npm run start        # 生产模式运行
```

## 常见问题

**WebSocket 连接失败**
- 确认后端已启动：`curl http://localhost:3001/api/sessions`
- 确认端口 3001 未被占用

**AI 没有回复**
- 检查 `.env` 中 `ANTHROPIC_API_KEY` 是否有效
- 检查 `ANTHROPIC_BASE_URL` 和 `MODEL` 是否匹配
- 查看后端控制台日志

**Skill 未被触发**
- 确认 `.claude/skills/tikhub-api-helper/SKILL.md` 存在
- 确认 `settingSources: ["project"]` 已配置
- 确认 `allowedTools` 包含 `"Skill"` 和 `"Bash"`

**Python 脚本报错**
- 确认 `python` 命令可用
- TikHub Token 是否有效
- 网络是否可访问 `api.tikhub.io`

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Tailwind CSS |
| 构建 | Vite 6 |
| 后端 | Express + ws (WebSocket) |
| AI | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| Skill | tikhub-api-helper (Python, 零依赖) |



## 感谢和参考
https://linux.do/  感谢佬友，

https://github.com/liangdabiao/claudesdk-skill  AI生成claude-agent-sdk 项目