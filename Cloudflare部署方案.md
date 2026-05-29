# *-chat 项目 Cloudflare 部署方案

## 核心发现

经过深入调研，发现了 3 个关键事实改变了局面：

1. **`@anthropic-ai/sdk`（API 客户端）官方支持 Cloudflare Workers** — 不需要 child_process
2. **Cloudflare 官方提供了 `agents` SDK** — 基于 Durable Objects 的 AI Agent 框架，内置多步工具调用循环
3. **JS 图表库可在 Workers 生成图表** — D3.js、Vega、Satori 等无需 DOM

这意味着：**完全可以在 Cloudflare 上运行，但需要重构后端架构。**

---

## 方案一：Cloudflare Agents SDK（推荐）

**改动量：大 | 原生度：高 | 可行性：✅ 已验证**

Cloudflare 官方提供了 `agents` SDK，核心类 `AIChatAgent` 基于 Durable Objects，内置：
- 多步 Agent 循环（tool use loop）
- WebSocket 长连接管理（Hibernation API）
- 流式响应（streaming）
- 会话持久化

### 架构

```
┌──────────────────────────────────────────────┐
│         Cloudflare Pages + Workers            │
│                                               │
│  Pages:  React SPA (Vite 构建)               │
│                                               │
│  Worker:                                      │
│  ┌──────────────────────────────────────┐    │
│  │  AIChatAgent (Durable Object)        │    │
│  │  ├─ WebSocket 连接管理               │    │
│  │  ├─ Anthropic API 直调 (streaming)   │    │
│  │  ├─ 工具循环 (max 10 steps)          │    │
│  │  ├─ Tools (JS 实现):                 │    │
│  │  │  ├─ search_stock → baostock API   │    │
│  │  │  ├─ get_financial_data → fetch()  │    │
│  │  │  ├─ generate_chart → Satori/D3    │    │
│  │  │  ├─ web_search → fetch()          │    │
│  │  │  └─ read/write → KV/R2            │    │
│  │  └─ 会话状态持久化                    │    │
│  └──────────────────────────────────────┘    │
│                                               │
│  Storage:                                     │
│  ├─ R2: 图表文件 (PNG/SVG)                   │
│  ├─ KV: 会话历史、缓存                        │
│  └─ D1: 可选，结构化数据存储                   │
└──────────────────────────────────────────────┘
```

### 核心代码示例

```typescript
// wrangler.toml
// [durable_objects]
// bindings = [{ name = "CHAT_AGENT", class_name = "FinancialChartAgent" }]

import { AIChatAgent } from "agents/ai-chat";
import { streamText, tool } from "ai";
import { z } from "zod";

export class FinancialChartAgent extends AIChatAgent {
  async onChatMessage() {
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      messages: await convertToModelMessages(this.messages),
      system: `你是 FinancialChartChat，AI 财经图表助手...`,
      tools: {
        search_stock: tool({
          description: "搜索A股上市公司",
          parameters: z.object({ keyword: z.string() }),
          execute: async ({ keyword }) => {
            // 调用自建 API 或 baostock HTTP 接口
            const res = await fetch(
              `https://baostock-api.your-domain.com/search?q=${keyword}`
            );
            return res.json();
          },
        }),
        generate_chart: tool({
          description: "生成财经图表",
          parameters: z.object({
            type: z.enum(["revenue_profit", "margin", "trend", "peer"]),
            data: z.any(),
            title: z.string(),
          }),
          execute: async ({ type, data, title }) => {
            // 用 Satori + resvg-wasm 生成图表图片
            const svg = await renderChart(type, data, title);
            const png = await svgToPng(svg);
            // 存入 R2
            const key = `charts/${Date.now()}.png`;
            await env.R2.put(key, png);
            return { chart_url: `/charts/${key}` };
          },
        }),
        web_search: tool({
          description: "搜索网络信息",
          parameters: z.object({ query: z.string() }),
          execute: async ({ query }) => {
            const res = await fetch(
              `https://api.your-search-service.com/search?q=${query}`
            );
            return res.json();
          },
        }),
      },
      stopWhen: stepCountIs(10),
    });
    return result.toUIMessageStreamResponse();
  }
}
```

### 改造清单

| 组件 | 当前 | 改为 | 改动量 |
|------|------|------|--------|
| Express 服务器 | Express + ws | AIChatAgent (Durable Object) | **重写** |
| SDK | claude-agent-sdk | `@anthropic-ai/sdk` + `agents/ai-chat` | **替换** |
| WebSocket | ws 库 | Cloudflare 原生 WebSocketPair | **重写** |
| 工具执行 | Bash/Python 子进程 | JS 函数 + fetch() | **重写** |
| 文件存储 | fs 本地磁盘 | R2 对象存储 | **替换** |
| 图表生成 | Python matplotlib | Satori + D3.js（Worker 内） | **重写** |
| 数据获取 | baostock Python | 自建 API 或 baostock HTTP | **新搭** |
| 前端 | React SPA | React SPA（几乎不变） | **小** |

### 图表生成替代方案

**Python matplotlib → JS 边缘渲染**

推荐使用 **Satori + resvg-wasm**（Vercel 开源，专为 Edge 设计）：

```typescript
import satori from "satori";
import { Resvg } from "@resvg/resvg-wasm";

// 用 JSX 描述图表（类似 React 组件）
const svg = await satori(
  <div style={{ display: "flex", flexDirection: "column", width: 800, height: 400 }}>
    <div style={{ fontSize: 24, fontWeight: "bold" }}>贵州茅台 营收与净利润</div>
    {/* 柱状图组件 */}
    <BarChart data={chartData} />
  </div>,
  { width: 800, height: 400, fonts: [...] }
);

// SVG → PNG
const png = new Resvg(svg, { fitTo: { mode: "width", value: 800 } })
  .render().asPng();
```

### 额外需要搭建的服务

| 服务 | 用途 | 部署位置 |
|------|------|---------|
| baostock HTTP API | 代理 baostock 数据请求 | 任意 VPS（小规格即可） |
| 搜索 API | 替代 WebSearch 工具 | Cloudflare AI Gateway 或外部 |

---

## 方案二：前端上 Cloudflare + 后端保留 VPS

**改动量：小 | 原生度：低 | 可行性：✅ 立即可行**

最简方案：前端静态文件上 Pages，后端原封不动保留在 VPS。

### 架构

```
┌─────────────────────────────┐
│    Cloudflare Pages (CDN)    │
│    React SPA 静态托管         │
│    自动 HTTPS + 全球加速      │
└──────────┬──────────────────┘
           │ API + WebSocket
           ▼
┌─────────────────────────────┐
│    VPS (原有后端)             │
│    Express + ws + SDK       │
│    Python runtime           │
│    零代码改动                 │
└─────────────────────────────┘
```

### 改动清单

| 项目 | 改动 |
|------|------|
| 前端 | API/WebSocket 地址改为 VPS 域名，CORS 配置 |
| Vite 配置 | proxy 改为远程地址 |
| 后端 | 添加 CORS 中间件，零其他改动 |
| Cloudflare | Pages 项目 + DNS 配置 |

### 代码改动（约 10 行）

```typescript
// src/hooks/useWebSocket.ts - 仅改一行
const ws = new WebSocket(`wss://api.your-domain.com/ws`);
// 替代原来的相对路径

// server/index.ts - 添加 CORS（3行）
import cors from "cors";
app.use(cors({ origin: "https://your-pages.dev" }));
```

### 优点

- 改动极小，30 分钟可完成
- 前端获得 CDN 加速 + DDoS 防护
- 后端完全不受限

### 缺点

- 仍需 VPS
- WebSocket 跨域增加 ~20ms 延迟

---

## 方案三：Workers 代理 + 外部计算

**改动量：中 | 原生度：中 | 可行性：✅**

Worker 作为 API 网关，WebSocket 管理、鉴权在 Cloudflare 完成，重计算（SDK、Python）发到外部 VPS。

### 架构

```
┌────────────────────────────────────┐
│      Cloudflare                    │
│  Pages: React SPA                  │
│  Worker:                           │
│    ├─ 静态资源 (ASSETS)            │
│    ├─ /api/* → 转发到 VPS          │
│    └─ /ws → Durable Object → VPS  │
│  Durable Object:                   │
│    ├─ WebSocket 连接管理            │
│    └─ 转发到 VPS WebSocket         │
└──────────┬─────────────────────────┘
           │ fetch / WebSocket
           ▼
┌────────────────────────────────────┐
│      VPS (计算节点)                 │
│    Express + claude-agent-sdk      │
│    Python runtime                  │
│    无需公网域名（Worker 回源）       │
└────────────────────────────────────┘
```

### 改动清单

| 组件 | 改动 |
|------|------|
| 新建 Worker | Hono/itty-router API 代理 |
| 新建 Durable Object | WebSocket 转发 |
| 前端 | API 地址改为 Worker 域名 |
| 后端 | 添加 CORS，几乎不改 |

---

## 方案对比

| 维度 | 方案一：Agents SDK | 方案二：前端上 CF | 方案三：Worker 代理 |
|------|-------------------|-----------------|-------------------|
| **改动量** | 大（后端重写） | 小（~10行） | 中（新建 Worker） |
| **是否需要 VPS** | 需要小型 API（baostock） | 需要 | 需要 |
| **Cloudflare 原生度** | 高 | 低 | 中 |
| **扩展性** | 好（自动扩缩） | 差（受限于 VPS） | 中 |
| **成本** | 低（免费额度大） | 低（Pages 免费） | 低 |
| **开发周期** | 2-3 周 | 30 分钟 | 2-3 天 |
| **适合场景** | 长期产品化 | 快速上线 | 折中方案 |

---

## 推荐

- **短期（立即可用）**：方案二 — 前端上 Pages，后端不动，30 分钟搞定
- **中期（产品化）**：方案一 — 用 Cloudflare Agents SDK 重写后端，彻底去 VPS
- **金融图表特殊处理**：Python matplotlib 替换为 Satori + D3.js，baostock 数据获取改为自建轻量 HTTP API

方案一和方案二可以渐进式推进：先方案二上线，再逐步迁移到方案一。
