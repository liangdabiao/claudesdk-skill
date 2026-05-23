---
name: claude-agent-sdk
description: Claude Agent SDK framework guide for building AI-powered applications. Provides comprehensive API knowledge, architecture patterns, and code examples for both TypeScript and Python. Use when: (1) building projects with @anthropic-ai/claude-agent-sdk, (2) creating AI agents with tool use, hooks, subagents, or MCP servers, (3) implementing multi-turn conversations, streaming responses, or session management, (4) configuring permission modes, custom tools, or agent orchestration, (5) debugging or extending existing Claude Agent SDK code, (6) user mentions "agent sdk", "claude agent", "claude-agent-sdk", or "sdk query".
---

# Claude Agent SDK

Build AI-powered applications that leverage Claude's agentic capabilities: tool use, multi-turn conversations, file operations, web search, and custom tool integration.

## Architecture

The SDK wraps Claude Code CLI as a subprocess. Your app sends prompts, the agent reasons and uses tools autonomously, streams back messages (text, tool calls, results). You control permissions, tools, hooks, and subagents.

```
Your App  ──query()──>  Claude Agent (subprocess)
   ^                           |
   |    <──stream messages──── |
   |         (text, tool_use,
   |          results, etc.)
```

## Quick Start

### TypeScript

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const message of query({
  prompt: 'Analyze the code in src/',
  options: {
    maxTurns: 30,
    model: 'sonnet',
    cwd: process.cwd(),
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
  }
})) {
  if (message.type === 'assistant' && message.message) {
    for (const block of message.message.content) {
      if (block.type === 'text') console.log(block.text);
      if (block.type === 'tool_use') console.log(`Tool: ${block.name}`);
    }
  }
  if (message.type === 'result' && message.subtype === 'success') {
    console.log('Done:', message.result);
    console.log('Cost: $' + message.total_cost_usd);
  }
}
```

### Python

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions
from claude_agent_sdk.messages import AssistantMessage, ResultMessage, TextBlock

options = ClaudeAgentOptions(
    max_turns=30,
    model="sonnet",
    cwd=".",
    allowed_tools=["Read", "Glob", "Grep", "Bash"]
)

# Multi-turn: client retains context within the async with block
async with ClaudeSDKClient(options=options) as client:
    while True:
        user_input = input("You: ")
        if user_input.lower() in ("exit", "quit"):
            break
        await client.query(prompt=user_input)
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        print(block.text, end="")
            if isinstance(msg, ResultMessage):
                print(f"\nCost: ${msg.total_cost_usd:.4f}")
```

**Python message class names**: `AssistantMessage`, `ResultMessage`, `UserMessage`, `SystemMessage`.
**Content block types**: `TextBlock`, `ToolUseBlock`, `ThinkingBlock`.

### Install

```bash
# TypeScript
npm install @anthropic-ai/claude-agent-sdk

# Python
pip install claude-agent-sdk
```

Requires `ANTHROPIC_API_KEY` env var or CLI auth (`claude login`).

## Core APIs

### Two API Styles

| API | Use Case | TS Import | Python Import |
|-----|----------|-----------|---------------|
| **V1 `query()`** | One-shot or generator-based streaming | `import { query } from '@anthropic-ai/claude-agent-sdk'` | `from claude_agent_sdk import query, ClaudeAgentOptions` |
| **V2 Session** | Multi-turn with stateful session | `unstable_v2_createSession` / `unstable_v2_resumeSession` / `unstable_v2_prompt` | N/A (TS only) |

### V1 query() — Generator Pattern

Single prompt, yields messages as async generator. Best for one-shot tasks or when you control the full pipeline.

```ts
const q = query({ prompt: string | AsyncIterable, options: QueryOptions });
for await (const message of q) { /* handle message */ }
```

### Four Multi-Turn Strategies

**Strategy 1: V2 Session API** — Best for TS chat apps. See V2 section below.

**Strategy 2: V1 AsyncIterable (queue)** — Single long-lived query, feed messages via async queue. See Streaming Input section below.

**Strategy 3: V1 `resume` option** — Each user message is a new `query()` call, pass `session_id` from the previous result. The agent retains full context across calls.

```ts
let sdkSessionId: string | null = null;

// First message — no resume
for await (const msg of query({ prompt: 'Hello', options: { model: 'sonnet' } })) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    sdkSessionId = msg.session_id;  // Capture from system/init message
  }
  if (msg.type === 'result' && msg.subtype === 'success') {
    sdkSessionId = msg.session_id;  // Also available in result
  }
}

// Second message — resume with captured session ID
for await (const msg of query({
  prompt: 'Follow up question',
  options: { resume: sdkSessionId!, model: 'sonnet' }
})) { /* agent remembers previous turn */ }

// Reset conversation (start fresh)
sdkSessionId = null;  // Next query starts a new conversation
```

Session ID sources: `system/init` message's `session_id`, or `result` message's `session_id`.

**Strategy 4: Python `ClaudeSDKClient` context manager** — Client retains conversation state within the `async with` block. Multi-turn without manual session management.

```python
from claude_agent_sdk.messages import AssistantMessage, TextBlock

async with ClaudeSDKClient(options=options) as client:
    while True:
        user_input = input("You: ")
        if user_input.lower() in ("exit", "quit"): break
        await client.query(prompt=user_input)
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock):
                        print(block.text, end="")
```

### V2 Session — send/stream Pattern

Separate send and stream operations. Best for interactive multi-turn conversations (chat apps, WebSocket servers).

```ts
import { unstable_v2_createSession, unstable_v2_resumeSession, unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk';

// Basic session
await using session = unstable_v2_createSession({ model: 'sonnet' });
await session.send('Hello!');
for await (const msg of session.stream()) {
  if (msg.type === 'assistant') { /* handle */ }
}

// Multi-turn — session retains context
await session.send('Follow up question');
for await (const msg of session.stream()) { /* handle */ }

// One-shot convenience
const result = await unstable_v2_prompt('Quick question', { model: 'sonnet' });
if (result.subtype === 'success') console.log(result.result, result.total_cost_usd);

// Resume a session later
await using resumed = unstable_v2_resumeSession(sessionId, { model: 'sonnet' });
```

### V1 Streaming Input Pattern (Multi-turn via AsyncIterable)

For multi-turn conversations without V2, pass an async generator or queue as prompt:

```ts
// Message queue for interactive use
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

const queue = new MessageQueue();
const outputIterator = query({
  prompt: queue,
  options: { model: 'sonnet', maxTurns: 100 }
})[Symbol.asyncIterator]();

// Push messages from anywhere (WebSocket handler, etc.)
queue.push("Hello!");
const { value, done } = await outputIterator.next();
```

## Message Types

All APIs yield the same message types:

| type | When | Key Fields |
|------|------|------------|
| `system` (init) | Session starts | `session_id` — **save this for resume** |
| `assistant` | Claude responds | `message.content[]` — array of content blocks |
| `user` | Tool result fed back to model | Echo of tool results |
| `result` | Query completes | `subtype` (`success`/`error`), `result`, `total_cost_usd`, `duration_ms`, `session_id` |

### Content blocks (in `assistant` messages):

```ts
// Text output
{ type: 'text', text: 'Hello!' }

// Tool call — Claude wants to use a tool
{ type: 'tool_use', id: 'toolu_xxx', name: 'Read', input: { file_path: '/path' } }

// Thinking (if enabled)
{ type: 'thinking', thinking: '...' }

// Tool result — output from a tool execution (also appears in assistant content)
{ type: 'tool_result', tool_use_id: 'toolu_xxx', content: '...', is_error: boolean }
```

### SDK Type Imports

```ts
import type { SDKMessage, SDKUserMessage, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
```

## Built-in Tools

| Category | Tools |
|----------|-------|
| File ops | `Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit` |
| Search | `Glob`, `Grep`, `LS` |
| Execution | `Bash`, `BashOutput`, `KillBash` |
| Web | `WebSearch`, `WebFetch` |
| Planning | `Task` (subagents), `ExitPlanMode`, `AskUserQuestion`, `TodoWrite` |
| Utility | `Skill` |

Control access via `allowedTools` (whitelist) or `disallowedTools` (blacklist).

## Custom Tools (MCP Servers)

Define type-safe custom tools with Zod schemas. Tools are exposed as MCP servers.

```ts
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const myServer = createSdkMcpServer({
  name: "my-tools",
  version: "1.0.0",
  tools: [
    tool(
      "get_weather",                           // tool name
      "Get weather for a city",                // description
      { city: z.string().describe("City name") }, // input schema
      async (args) => {                        // handler
        return {
          content: [{ type: "text", text: `Weather in ${args.city}: sunny` }]
        };
      }
    ),
  ]
});

// Use in query — tool name becomes mcp__my-tools__get_weather
const q = query({
  prompt: 'What is the weather?',
  options: {
    mcpServers: { "my-tools": myServer },
    allowedTools: ['mcp__my-tools__get_weather'],
  }
});
```

### External MCP Servers (command-based)

```ts
mcpServers: {
  "filesystem": {
    command: "npx",
    args: ["@modelcontextprotocol/server-filesystem"],
    env: { ALLOWED_PATHS: "/Users/me/projects" }
  }
}
// Tool names: mcp__filesystem__list_files, etc.
```

## Hooks

Intercept tool execution for validation, logging, or guardrails.

### PreToolUse — Block or allow before execution

```ts
hooks: {
  PreToolUse: [{
    matcher: "Write|Edit|MultiEdit",  // regex matching tool names
    hooks: [async (input): Promise<HookJSONOutput> => {
      const filePath = input.tool_input.file_path || '';
      const ext = path.extname(filePath).toLowerCase();

      // Block writing scripts outside designated directory
      if (['.js', '.ts'].includes(ext) && !filePath.startsWith(safeDir)) {
        return {
          decision: 'block',
          stopReason: `Scripts must be in ${safeDir}`,
          continue: false
        };
      }
      return { continue: true };
    }]
  }]
}
```

### PostToolUse — Log or react after execution

```python
from claude_agent_sdk import HookMatcher

hooks = {
    'PreToolUse': [HookMatcher(matcher=None, hooks=[tracker.pre_tool_use_hook])],
    'PostToolUse': [HookMatcher(matcher=None, hooks=[tracker.post_tool_use_hook])]
}
```

Hook callback receives: `{ tool_name, tool_input, tool_output? }`.
Hook returns TS: `{ continue: true }` or `{ decision: 'block', stopReason: '...', continue: false }`.
Python: callback signature is `async def hook(hook_input, tool_use_id, context)` — returns `{'continue_': True}` to allow (note the trailing underscore since `continue` is a Python keyword), or raises to block.

## Subagents

Define specialized agents that the lead agent can invoke via the `Task` tool. Two definition styles:

### Style 1: Programmatic (in code)

```ts
// TypeScript
const q = query({
  prompt: 'Research quantum computing',
  options: {
    allowedTools: ['Task'],
    agents: {
      "researcher": {
        description: "Gathers research information using web search. Writes findings to files.",
        prompt: "You are a research specialist...",
        tools: ["WebSearch", "Write"],
      }
    }
  }
});
```

```python
# Python
from claude_agent_sdk import AgentDefinition

agents = {
    "researcher": AgentDefinition(
        description="Gathers research information using web search.",
        prompt="You are a research specialist...",
        tools=["WebSearch", "Write"],
        model="haiku"
    )
}

options = ClaudeAgentOptions(
    allowed_tools=["Task"],
    agents=agents,
    system_prompt=lead_agent_prompt
)
```

### Style 2: File-based (`.claude/agents/` directory)

Create `.claude/agents/<agent-name>.md` in the `cwd` directory. The agent is auto-loaded when `settingSources` includes `'project'` or `'local'`:

```markdown
---
name: inbox-searcher
description: "Email inbox search specialist, takes in context and a search goal."
tools: Read, Bash, Glob, Grep, mcp__email__search_inbox, mcp__email__read_emails
---

# Email Search Specialist Instructions

You are an email search specialist that finds relevant emails through iterative searching...
```

**Key**: The agent gets the `tools` listed in frontmatter, and the markdown body becomes its system prompt. The lead agent discovers it via `settingSources` + `Task` tool — no programmatic `agents` config needed.

### settingSources — Loading Skills & Agents from `.claude/` Directory

```ts
settingSources: ['local', 'project', 'user']
```

| Source | Loads From | What It Enables |
|--------|-----------|-----------------|
| `'project'` | `<cwd>/.claude/` | CLAUDE.md, skills (`skills/`), agents (`agents/`) |
| `'local'` | `<cwd>/.claude/` (same as project in most cases) | Same as project |
| `'user'` | User's global `~/.claude/` | User-level settings |

**Defaults to `[]` (empty).** Without setting it, the agent won't see CLAUDE.md, skills, or file-based subagents. Most apps should set `settingSources: ['project']` at minimum.

### Task Tool Input Schema

When the lead agent calls the `Task` tool, the input contains:

```ts
{
  subagent_type: string;   // Name of the subagent (e.g., "researcher")
  description: string;     // Short description of the task
  prompt: string;          // Full instructions for the subagent
}
```

Use this to detect and log subagent activity when parsing message streams.

### Multi-Agent Architecture Principles

1. **Lead-agent-only-Task**: The lead agent's `allowedTools` should be `['Task']` — it delegates ALL work to subagents rather than doing work directly.
2. **Subagent descriptions are critical**: The lead agent decides WHICH subagent to use based on the `description` field. Make descriptions specific about WHEN to use each agent.
3. **Subagents can use `Skill` tool**: If `settingSources` is configured, subagents inherit access to skills via the `Skill` tool.
4. **Parallel spawning**: The lead agent can invoke multiple `Task` tools in a single response to run subagents in parallel.

### Detecting Subagent Activity

Check `parent_tool_use_id` field on messages, or look for `tool_use` blocks with `name: "Task"`.

```ts
for await (const message of q) {
  // Detect subagent invocation
  for (const block of message.message?.content ?? []) {
    if (block.type === 'tool_use' && block.name === 'Task') {
      console.log(`Subagent invoked: ${block.input.subagent_type}`);
    }
  }
  // Messages from within subagent have parent_tool_use_id
  if (message.parent_tool_use_id) {
    console.log('Running inside subagent');
  }
}
```

## Permissions

### Permission Modes

| Mode | Behavior |
|------|----------|
| `'default'` | Standard permission prompts |
| `'plan'` | Claude asks clarifying questions before acting |
| `'bypassPermissions'` | Skip all permission checks (use `allowDangerouslySkipPermissions: true` in TS) |
| `'acceptEdits'` | Auto-accept file edits |

### canUseTool — Programmatic Permission Control

```ts
canUseTool: async (toolName: string, input: any) => {
  // Allow infrastructure tools
  if (toolName === 'ToolSearch' || toolName === 'ExitPlanMode') {
    return { behavior: 'allow', updatedInput: input };
  }
  // Deny unwanted tools
  if (toolName !== 'AskUserQuestion') {
    return { behavior: 'deny', message: 'Use AskUserQuestion instead.' };
  }
  // Custom logic (e.g., prompt user via WebSocket, then return)
  const userChoice = await waitForUserResponse(input);
  return { behavior: 'allow', updatedInput: { ...input, answers: userChoice } };
}
```

Permission evaluation order: PreToolUse Hook -> Deny Rules -> Allow Rules -> Ask Rules -> Permission Mode -> canUseTool -> PostToolUse Hook.

## Structured Outputs

Force the agent to return JSON matching a schema:

```ts
options: {
  outputFormat: {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        confidence: { type: 'number' }
      },
      required: ['summary', 'confidence']
    }
  }
}
```

## Key Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `model` | `string` | Model: `'opus'`, `'sonnet'`, `'haiku'`, or full model ID |
| `maxTurns` | `number` | Max agent reasoning loops |
| `cwd` | `string` | Working directory for agent file operations |
| `systemPrompt` | `string \| { type: 'preset', preset: 'claude_code', append?: string }` | System instructions |
| `allowedTools` | `string[]` | Tool whitelist |
| `mcpServers` | `Record<string, McpServerConfig>` | Custom/external MCP servers |
| `hooks` | `Record<HookEvent, HookMatcher[]>` | Tool execution hooks |
| `permissionMode` | `string` | Permission strategy |
| `canUseTool` | `function` | Runtime permission callback |
| `agents` | `Record<string, AgentDefinition>` | Subagent definitions |
| `settingSources` | `string[]` | Load skills/settings from: `'local'`, `'project'`, `'user'` |
| `resume` | `string` | Session ID to resume |
| `forkSession` | `boolean` | Fork instead of continue when resuming |
| `maxBudgetUsd` | `number` | Budget cap |
| `outputFormat` | `object` | JSON schema for structured output |
| `enableFileCheckpointing` | `boolean` | Track file changes for rewind |
| `executable` | `'bun' \| 'deno' \| 'node'` | Runtime to use |
| `env` | `Record<string, string>` | Environment variables |

## Custom Slash Commands (`.claude/commands/`)

Create `.claude/commands/<name>.md` in the `cwd` directory. Users invoke them as `/<name>` (or programmatically via the `Skill` tool).

```markdown
---
description: "Research a topic and generate a comprehensive report"
argument-hint: "<topic-to-research>"
---

Research the following topic thoroughly and create a report: $ARGUMENTS
```

**Key**: `description` appears in the command list, `argument-hint` shows placeholder text, and `$ARGUMENTS` is replaced with the user's input. Requires `settingSources: ['project']` to load.

## 实际应用案例

以下是使用 Claude Agent SDK 构建的完整应用程序案例，展示了不同的使用场景和最佳实践：

### 📧 邮件代理 (Email Agent)
一个功能完整的 IMAP 邮件助手应用，具备以下特性：
- 显示收件箱
- 执行智能搜索查找邮件
- 提供 AI 驱动的邮件协助
- 支持自定义操作（如归档、转发等）
- 实时监听器机制
- 用户界面组件渲染
- 数据库持久化

**技术亮点**：
- WebSocket 双向通信
- 自定义 MCP 工具
- 子代理架构
- 实时 UI 状态同步

**适用场景**：需要与外部 API 集成、实时交互、自定义用户界面的复杂应用

**示例代码**：[scripts/email-agent-session.ts](scripts/email-agent-session.ts)

**完整项目**：[../../email-agent](../../email-agent)

### 🔬 研究代理 (Research Agent)
一个多代理研究系统，协调专门的子代理进行主题研究并生成综合报告：
- 将研究请求分解为子主题
- 并行生成研究员代理进行网络搜索
- 将发现综合成详细报告
- 展示详细的子代理活动跟踪
- 支持多种研究命令（/research, /fact-check, /market-trends 等）

**技术亮点**：
- 多代理协调与任务分配
- 并行代理执行
- 文件基子代理定义
- 自定义技能实现

**适用场景**：信息收集、报告生成、市场分析等需要多步骤、多源信息整合的任务

**示例代码**：[scripts/research-agent-example.ts](scripts/research-agent-example.ts)

**完整项目**：[../../research-agent](../../research-agent)

### 📊 Excel 演示 (Excel Demo)
展示如何使用 Claude 处理电子表格和 Excel 文件的应用：
- 集成 Excel 文件操作工具
- 聊天界面交互
- 实时思考显示
- 待办事项列表自动检测
- 工具使用可视化

**技术亮点**：
- 自定义技能集成
- Electron 桌面应用架构
- 预加载脚本通信
- 组件化 UI 设计

**适用场景**：文档处理、数据分析、自动化办公工具

**完整项目**：[../../excel-demo](../../excel-demo)

### 👋 Hello World (入门示例)
简单的入门示例，帮助您理解 Claude Agent SDK 的基本概念：
- 最简洁的查询 API 使用
- 消息流处理基础
- 配置选项示例

**技术亮点**：
- 最小化依赖
- 清晰的代码结构
- 完整的基础功能展示

**适用场景**：学习 SDK 基础、快速原型开发

**示例代码**：[scripts/hello-world.ts](scripts/hello-world.ts)

**完整项目**：[../../hello-world](../../hello-world)

### 🔄 Hello World V2 (V2 会话 API 示例)
V2 Session API (`unstable_v2_*`) 的示例：
- 分离 `send()`/`stream()` 而非单个 `query()` 生成器
- 多轮对话模式
- 会话持久化模式

**技术亮点**：
- 最新 API 展示
- 状态管理模式
- 会话恢复机制

**适用场景**：需要更灵活会话控制的应用

**示例代码**：[scripts/hello-world-v2.ts](scripts/hello-world-v2.ts)

**完整项目**：[../../hello-world-v2](../../hello-world-v2)

### 🎨 AskUserQuestion 预览 (AskUserQuestion Previews)
一个品牌助手，将 AskUserQuestion 选项渲染为视觉 HTML 预览卡片而非纯文本标签：
- 选择加入 `previewFormat: "html"`，使每个选项包含样式化的 HTML 模型
- 通过 WebSocket 将 SDK 的 `canUseTool` 回调中的问题往返到浏览器
- 演示计划模式，引导 Claude 在行动前提出澄清问题

**技术亮点**：
- 自定义 AskUserQuestion 样式
- WebSocket 实时通信
- 计划模式使用

**适用场景**：需要丰富用户交互体验的应用

**完整项目**：[../../ask-user-question-previews](../../ask-user-question-previews)

### 💬 简单聊天应用 (Simple Chat App)
一个基于 React + Express 的聊天 UI，由 SDK 支持，展示完整的 WebSocket 对话循环和流式响应

**技术亮点**：
- 完整的前后端架构
- 流式响应处理
- WebSocket 连接管理

**适用场景**：构建聊天机器人、客服系统等对话类应用

**完整项目**：[../../simple-chat-app](../../simple-chat-app)

### 📄 简历生成器 (Resume Generator)
通过网络搜索一个人的名字（LinkedIn、GitHub、新闻）并整合发现，生成一页的 `.docx` 简历

**技术亮点**：
- Web 搜索和信息整合
- 文档生成
- 多源信息验证

**适用场景**：内容生成、报告撰写、文档自动化等应用

**完整项目**：[../../resume-generator](../../resume-generator)

## Detailed References

- **Full API Reference**: See [references/api-reference.md](references/api-reference.md) — complete option types, message shapes, hook signatures
- **Architecture Patterns**: See [references/patterns.md](references/patterns.md) — WebSocket chat, session management, multi-agent orchestration, streaming input, agent-generated code with hot reload

## Official Documentation (Full Text)

When you need deeper details beyond this skill, consult the official docs in [references/docs/](references/docs/):

### Getting Started
- [Overview](references/docs/overview.md) — What the Agent SDK is, capabilities, comparison with other Claude tools
- [Quickstart](references/docs/quickstart.md) — Build a bug-fixing agent in minutes

### Core Concepts
- [How the agent loop works](references/docs/agent-loop.md) — Message flow, tool execution cycle, turn limits
- [Use Claude Code features](references/docs/claude-code-features.md) — Skills, commands, memory, plugins in the SDK
- [Work with sessions](references/docs/sessions.md) — Session lifecycle, resume, fork
- [Persist sessions to external storage](references/docs/session-storage.md) — Save/restore sessions to database or file

### Input and Output
- [Streaming Input](references/docs/streaming-input.md) — Multi-turn via async iterable / message queue
- [Handle approvals and user input](references/docs/user-input.md) — canUseTool, AskUserQuestion, permission prompts
- [Stream responses in real-time](references/docs/streaming-output.md) — Real-time message streaming, partial messages
- [Get structured output from agents](references/docs/structured-outputs.md) — Force JSON output with schemas

### Extend with Tools
- [Give Claude custom tools](references/docs/custom-tools.md) — Define tools with Zod schemas, MCP servers
- [Connect to external tools with MCP](references/docs/mcp.md) — External MCP server config (command-based)
- [Scale to many tools with tool search](references/docs/tool-search.md) — Dynamic tool loading for large tool sets
- [Subagents in the SDK](references/docs/subagents.md) — Programmatic and file-based subagent definitions

### Customize Behavior
- [Modifying system prompts](references/docs/modifying-system-prompts.md) — System prompt presets, appending instructions
- [Slash Commands in the SDK](references/docs/slash-commands.md) — Custom commands via `.claude/commands/`
- [Agent Skills in the SDK](references/docs/skills.md) — Loading and using skills from `.claude/skills/`
- [Plugins in the SDK](references/docs/plugins.md) — Extend with custom commands, agents, MCP servers

### Control and Observability
- [Configure permissions](references/docs/permissions.md) — Permission modes, allow/deny rules
- [Intercept and control agent behavior with hooks](references/docs/hooks.md) — PreToolUse, PostToolUse hooks, matchers
- [Rewind file changes with checkpointing](references/docs/file-checkpointing.md) — File change tracking and rollback
- [Track cost and usage](references/docs/cost-tracking.md) — Cost monitoring, budget caps
- [Observability with OpenTelemetry](references/docs/observability.md) — OTEL integration for tracing/metrics
- [Todo Lists](references/docs/todo-tracking.md) — Task tracking within agent sessions

### Deployment
- [Hosting the Agent SDK](references/docs/hosting.md) — Production deployment considerations
- [Securely deploying AI agents](references/docs/secure-deployment.md) — Security best practices

### SDK References
- [TypeScript SDK](references/docs/typescript.md) — Full TypeScript API reference and examples
- [TypeScript V2 (removed)](references/docs/typescript-v2.md) — Legacy V2 API reference
- [Python SDK](references/docs/python.md) — Full Python API reference and examples
- [Migration Guide](references/docs/migration-guide.md) — Migrating between SDK versions

## Common Gotchas

1. **Tool names in allowedTools**: Custom MCP tools are prefixed: `mcp__<server-name>__<tool-name>`
2. **settingSources defaults to empty**: Must explicitly set `settingSources: ['project']` to load CLAUDE.md, skills, and file-based subagents
3. **Hooks matcher is regex**: Use `"Write|Edit"` pipe syntax, not glob patterns
4. **V2 API is unstable**: Import names start with `unstable_v2_` — API may change
5. **cwd matters**: Agent file operations (Read, Write, Bash) are relative to `cwd`. Point it at a working directory with `.claude/` for agents/skills
6. **AbortController**: Pass `abortController` option to support cancellation
7. **Stream input requires specific shape**: Async generators must yield `{ type: 'user', message: { role: 'user', content: '...' } }`
8. **session_id capture**: For V1 resume, capture from both `system/init` and `result` messages — both carry `session_id`
9. **File-based agents need settingSources**: `.claude/agents/` files only load when `settingSources` includes `'project'` or `'local'`
10. **Tool result blocks in assistant content**: Handle `block.type === 'tool_result'` alongside `text` and `tool_use` when iterating assistant content
11. **dotenv override — 环境变量被系统覆盖**: 当系统已设置 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL` 等环境变量时，`dotenv.config()` 默认不会覆盖 `.env` 文件的值。如果项目使用 `.env` 管理配置，必须使用 `dotenv.config({ override: true })`，否则 SDK 会使用系统环境变量，导致连接到错误的 API 端点。
12. **React StrictMode 导致重复 WebSocket 连接**: React 18 的 `<StrictMode>` 在开发模式下会双重挂载组件，`useEffect` 执行两次，创建两个 WebSocket 连接。解决模式：(1) 使用 `mountedRef` 守卫，`useEffect` 中设置 `mountedRef.current = true`；(2) `connect()` 先关闭旧连接再建新连接；(3) cleanup 函数中 `mountedRef.current = false` 并关闭 ws；(4) `ws.onclose` 中检查 `mountedRef` 再决定重连。
13. **SDK env 选项未完全传播到 Bash 子进程**: `options.env` 传给了 Claude Code CLI 进程，但 CLI 创建的 Bash 子进程可能无法访问所有变量。关键环境变量（API Token 等）不要仅依赖 env 传播，应在底层脚本中提供 fallback 机制（如硬编码 DEFAULT_TOKEN 或从 .env 文件读取）。
14. **Webapp 场景使用 bypassPermissions**: 构建无人值守的 Web 服务时，使用 `permissionMode: "bypassPermissions"`。其他模式（default, acceptEdits）需要交互式终端确认权限，会导致 Agent 挂起。注意：bypassPermissions 意味着 Agent 可执行任意 Bash 命令，需通过 `allowedTools` 限制工具范围。
15. **懒初始化模式 — 不要在构造函数中调用 query()**: 不要在构造函数中调用 `query()`，否则 iterator 在消费者（`for await` 循环）就绪前就开始产出消息，导致消息丢失。正确模式：(1) constructor 只创建 MessageQueue；(2) `ensureStarted()` 在第一次 `sendMessage()` 时调用；(3) `sendMessage()` 先调用 `ensureStarted()` 确保 outputIterator 已初始化；(4) `startListening()` 消费 outputIterator。顺序：sendMessage → ensureStarted → outputIterator 创建 → startListening → 消费输出。
16. **maxTurns 需要足够大**: Skill 驱动的任务消耗轮次较多：简单查询（列出平台 tags）5-10 轮；单次 API 调用（搜索+查参+调用）10-15 轮；需要调试的任务（API 认证失败、参数错误）30-50 轮。复杂任务建议 `maxTurns: 50`，同时设 `maxBudgetUsd` 控制成本。
17. **systemPrompt 与 Skill 系统的配合**: 使用 Skill 时，systemPrompt 应保持简洁，只定义角色和目标。不要在 systemPrompt 中：写死文件路径（Skill 内部已有定义）；指定具体工具调用流程（AI 会读 SKILL.md 自行决定）；限制 AI 的探索方式。正确做法：简短的 systemPrompt + 完善的 SKILL.md。
18. **不要限制 AI 的探索工具**: AI 需要 `Glob`、`Grep` 来读取大型文件、搜索代码模式，这是 Skill 探索过程的一部分。使用 `allowedTools` 给出合理范围（Skill, Bash, Read, Write, Glob, Grep），不要通过 `disallowedTools` 额外禁止这些基础工具。
19. **第三方 API 兼容性要求**: SDK 支持 Anthropic 兼容接口（如 DeepSeek），通过 `ANTHROPIC_BASE_URL` 配置。但第三方 API 必须完全兼容 Anthropic Messages API 格式，包括：tool_use / tool_result 消息格式、system prompt 格式、streaming 响应格式。不兼容的 API 会导致 SDK 子进程挂起或崩溃。
20. **Vite 开发环境 WebSocket 配置**: 前端 WebSocket URL 应使用 `window.location.host`（而非硬编码后端端口）：`` ws URL: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws` ``，Vite 配置 `proxy: { "/ws": { target: "ws://localhost:3001", ws: true } }`。这样前端通过 Vite 代理连接后端，避免跨域和直连问题。
21. **文件日志 — Webapp 调试必备**: 构建 Web 应用时，stdout 日志不可靠。必须实现文件日志：记录所有 ToolCall（含完整 command 和 input JSON）、记录 AI 回复文本、记录 Result（成本、耗时）、记录 SDK stderr 输出。日志格式：`[HH:MM:SS][Tag] content`。
22. **MessageQueue close() 需要解除阻塞**: `close()` 设置 `this.closed = true` 但不解除正在等待的 iterator，会导致永久挂起。解决：close() 时如果有等待中的 promise，push 一个 sentinel 值来解除阻塞：```typescript close() { this.closed = true; if (this.waiting) { this.waiting({ type: "user", message: { role: "user", content: "__close__" } }); this.waiting = null; } } ```。
23. **Vite index.html 位置**: `vite build` 报错 `Could not resolve entry module "index.html"` 时，检查 index.html 是否在项目根目录。Vite 要求 index.html 在项目根目录而非 public/ 目录下。
24. **stderr 回调是关键调试信息**: SDK 子进程错误只输出到 stderr，不配置 stderr 回调就看不到。始终配置 `stderr: (data: string) => { ... }` 选项来捕获 SDK 子进程的错误信息。
25. **Subscribe 不应启动监听**: WebSocket subscribe 消息到达时只注册订阅者，不要在此时 `startListening()`。监听应延迟到第一条 chat 消息时触发，否则 `getOutputStream()` 会进入空转循环（不断检查 outputIterator 是否就绪）。
