# Claude Agent SDK — Architecture Patterns

## Table of Contents

1. [WebSocket Chat Application](#websocket-chat-application)
2. [Multi-Agent Research System](#multi-agent-research-system)
3. [AIClient Wrapper Pattern](#aiclient-wrapper-pattern)
4. [Interactive Branding Assistant (canUseTool + AskUserQuestion)](#interactive-branding-assistant)
5. [Resume Generator (WebSearch + File Output)](#resume-generator)
6. [Session Persistence & Resume](#session-persistence--resume)
7. [V1 Resume-Based Multi-Turn (Email Agent Session)](#v1-resume-based-multi-turn)
8. [Agent-Generated Code with Hot Reload](#agent-generated-code-with-hot-reload)
9. [MCP Tools with File-Based Output](#mcp-tools-with-file-based-output)
10. [File Guard Rails via Hooks](#file-guard-rails-via-hooks)
11. [Tool Tracking & Logging](#tool-tracking--logging)
12. [Python Multi-Turn CLI with Subagent Tracking](#python-multi-turn-cli-with-subagent-tracking)

---

## WebSocket Chat Application

Complete pattern for a chat UI with real-time streaming via WebSocket.

### Server: ai-client.ts

Encapsulates SDK query with a message queue for multi-turn streaming input:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

type UserMessage = {
  type: "user";
  message: { role: "user"; content: string };
};

class MessageQueue {
  private messages: UserMessage[] = [];
  private waiting: ((msg: UserMessage) => void) | null = null;
  private closed = false;

  push(content: string) {
    const msg: UserMessage = {
      type: "user",
      message: { role: "user", content },
    };
    if (this.waiting) {
      this.waiting(msg);
      this.waiting = null;
    } else {
      this.messages.push(msg);
    }
  }

  async *[Symbol.asyncIterator]() {
    while (!this.closed) {
      if (this.messages.length > 0) yield this.messages.shift()!;
      else yield await new Promise<UserMessage>((r) => { this.waiting = r; });
    }
  }

  close() { this.closed = true; }
}

export class AgentSession {
  private queue = new MessageQueue();
  private outputIterator: AsyncIterator<any>;

  constructor() {
    this.outputIterator = query({
      prompt: this.queue as any,
      options: {
        maxTurns: 100,
        model: "opus",
        allowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch"],
        systemPrompt: "You are a helpful AI assistant.",
      },
    })[Symbol.asyncIterator]();
  }

  sendMessage(content: string) { this.queue.push(content); }

  async *getOutputStream() {
    while (true) {
      const { value, done } = await this.outputIterator.next();
      if (done) break;
      yield value;
    }
  }

  close() { this.queue.close(); }
}
```

### Server: session.ts

Manages WebSocket clients and broadcasts agent messages:

```ts
export class Session {
  private subscribers: Set<WSClient> = new Set();
  private agentSession: AgentSession;
  private isListening = false;

  constructor(chatId: string) {
    this.agentSession = new AgentSession();
  }

  sendMessage(content: string) {
    // Store and broadcast user message
    this.broadcast({ type: "user_message", content });
    this.agentSession.sendMessage(content);
    if (!this.isListening) this.startListening();
  }

  private async startListening() {
    this.isListening = true;
    try {
      for await (const message of this.agentSession.getOutputStream()) {
        this.handleSDKMessage(message);
      }
    } catch (error) {
      this.broadcastError((error as Error).message);
    }
  }

  private handleSDKMessage(message: any) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          this.broadcast({ type: "assistant_message", content: block.text });
        } else if (block.type === "tool_use") {
          this.broadcast({ type: "tool_use", toolName: block.name, toolInput: block.input });
        }
      }
    } else if (message.type === "result") {
      this.broadcast({
        type: "result",
        success: message.subtype === "success",
        cost: message.total_cost_usd,
      });
    }
  }

  subscribe(client: WSClient) { this.subscribers.add(client); }
  unsubscribe(client: WSClient) { this.subscribers.delete(client); }
  private broadcast(msg: any) {
    const str = JSON.stringify(msg);
    for (const client of this.subscribers) {
      if (client.readyState === client.OPEN) client.send(str);
    }
  }
}
```

Key insight: Start the query immediately with the queue as prompt. Push messages from WebSocket handler. The agent reads from the queue as an async iterable.

---

## Multi-Agent Research System

Lead agent coordinates specialized subagents via Task tool. Python pattern.

### Agent Definition

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AgentDefinition, HookMatcher

agents = {
    "researcher": AgentDefinition(
        description=(
            "Use this agent when you need to gather research information. "
            "The researcher uses web search to find relevant information and "
            "writes research findings to files/research_notes/."
        ),
        tools=["WebSearch", "Write"],
        prompt=researcher_prompt,
        model="haiku"
    ),
    "data-analyst": AgentDefinition(
        description=(
            "Use this agent AFTER researchers have completed their work to "
            "generate charts and data analysis. Reads from files/research_notes/."
        ),
        tools=["Glob", "Read", "Bash", "Write"],
        prompt=data_analyst_prompt,
        model="haiku"
    ),
    "report-writer": AgentDefinition(
        description=(
            "Use this agent to create formal PDF reports from research notes "
            "and data analysis. Does NOT conduct web searches."
        ),
        tools=["Skill", "Write", "Glob", "Read", "Bash"],
        prompt=report_writer_prompt,
        model="haiku"
    ),
}
```

### Orchestrator

```python
options = ClaudeAgentOptions(
    permission_mode="bypassPermissions",
    setting_sources=["project"],
    system_prompt=lead_agent_prompt,
    allowed_tools=["Task"],  # Only Task tool needed — it delegates to subagents
    agents=agents,
    hooks=hooks,
    model="haiku"
)

async with ClaudeSDKClient(options=options) as client:
    await client.query(prompt=user_input)
    async for msg in client.receive_response():
        if type(msg).__name__ == 'AssistantMessage':
            process_assistant_message(msg, tracker, transcript)
```

Key insights:
- Lead agent only needs `Task` tool — it delegates everything to subagents
- Subagent descriptions tell the lead agent WHEN to use each one
- Each subagent has its own prompt and restricted tool set
- Use `setting_sources=["project"]` to load skills from `.claude/` directory
- Track tool calls via hooks for monitoring and debugging

---

## AIClient Wrapper Pattern

Encapsulate SDK options in a reusable class with defaults and per-query overrides.

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { customServer } from "./custom-tools";

export interface AIQueryOptions {
  maxTurns?: number;
  cwd?: string;
  model?: string;
  allowedTools?: string[];
  appendSystemPrompt?: string;
  mcpServers?: any;
  hooks?: any;
  resume?: string;
  settingSources?: string[];
}

export class AIClient {
  private defaultOptions: AIQueryOptions;

  constructor(options?: Partial<AIQueryOptions>) {
    this.defaultOptions = {
      maxTurns: 100,
      cwd: path.join(process.cwd(), 'agent'),
      model: "opus",
      allowedTools: ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write", "WebSearch", "WebFetch"],
      settingSources: ['local', 'project'],
      mcpServers: { "email": customServer },
      hooks: { /* guard rails */ },
      ...options
    };
  }

  // Streaming query — yields messages one by one
  async *queryStream(
    prompt: string | AsyncIterable<any>,
    options?: Partial<AIQueryOptions>
  ): AsyncIterable<any> {
    const merged = { ...this.defaultOptions, ...options };
    for await (const message of query({ prompt, options: merged })) {
      yield message;
    }
  }

  // Single-shot query — returns all messages + cost
  async querySingle(prompt: string, options?: Partial<AIQueryOptions>) {
    const messages: any[] = [];
    let totalCost = 0;
    let duration = 0;

    for await (const message of this.queryStream(prompt, options)) {
      messages.push(message);
      if (message.type === "result" && message.subtype === "success") {
        totalCost = message.total_cost_usd;
        duration = message.duration_ms;
      }
    }
    return { messages, cost: totalCost, duration };
  }
}
```

---

## Interactive Branding Assistant

Uses `canUseTool` to route `AskUserQuestion` through WebSocket for HTML previews.

```ts
for await (const msg of query({
  prompt,
  options: {
    model: "sonnet",
    systemPrompt: "You are a branding assistant...",
    permissionMode: "plan",          // Makes Claude ask clarifying questions
    tools: ["AskUserQuestion"],       // Only allow this tool
    toolConfig: { askUserQuestion: { previewFormat: "html" } },  // HTML previews
    canUseTool: async (toolName, input) => {
      // Let infrastructure tools pass through
      if (toolName === "ToolSearch" || toolName === "ExitPlanMode") {
        return { behavior: "allow", updatedInput: input };
      }
      if (toolName !== "AskUserQuestion") {
        return { behavior: "deny", message: "Use AskUserQuestion instead." };
      }

      // Route questions to browser via WebSocket, wait for answer
      const questions = input.questions;
      const answers: Record<string, string> = {};
      for (const q of questions) {
        const label = await new Promise<string>((resolve) => {
          pending.set(id, { ws, resolve });
          ws.send(JSON.stringify({ type: "question", id, question: q }));
        });
        answers[q.question] = label;
      }

      return { behavior: "allow", updatedInput: { questions, answers } };
    },
  }
})) {
  // Stream messages to browser
  if (msg.type === "assistant") { /* forward text/tool_use to client */ }
  if (msg.type === "result") { /* done */ }
}
```

Key insights:
- `canUseTool` can block until user responds (returns Promise)
- `toolConfig.askUserQuestion.previewFormat: "html"` enables rich option previews
- `permissionMode: "plan"` makes Claude ask before acting
- Infrastructure tools (ToolSearch, ExitPlanMode) bypass custom handling

---

## Resume Generator

Simple one-shot pattern with web search and file generation.

```ts
const q = query({
  prompt: `Research "${personName}" and create a professional 1-page resume as a .docx file.`,
  options: {
    maxTurns: 30,
    cwd: process.cwd(),
    model: 'sonnet',
    allowedTools: ['Skill', 'WebSearch', 'WebFetch', 'Bash', 'Write', 'Read', 'Glob'],
    settingSources: ['project'],
    systemPrompt: `You are a professional resume writer. Research a person and create a 1-page .docx resume.
WORKFLOW:
1. WebSearch for the person's background
2. Create a .docx file using the docx library
OUTPUT: Script at agent/custom_scripts/generate_resume.js, resume at agent/custom_scripts/resume.docx`,
  },
});

for await (const msg of q) {
  if (msg.type === 'assistant' && msg.message) {
    for (const block of msg.message.content) {
      if (block.type === 'text') console.log(block.text);
      if (block.type === 'tool_use' && block.name === 'WebSearch') {
        console.log(`Searching: "${block.input.query}"`);
      }
    }
  }
}
```

---

## Session Persistence & Resume

Save session ID and continue later:

```ts
// V1 pattern
let sessionId: string;

for await (const msg of query({ prompt: 'Hello', options: { /* ... */ } })) {
  if (msg.type === 'result' && msg.subtype === 'success') {
    sessionId = msg.session_id;
  }
}

// Later, resume
for await (const msg of query({
  prompt: 'Follow up question',
  options: { resume: sessionId, /* ... */ }
})) { /* ... */ }

// V2 pattern
let sessionId: string;
{
  await using session = unstable_v2_createSession({ model: 'sonnet' });
  await session.send('Remember: my favorite color is blue');
  for await (const msg of session.stream()) {
    if (msg.type === 'system' && msg.subtype === 'init') sessionId = msg.session_id;
  }
}
// Later
{
  await using session = unstable_v2_resumeSession(sessionId, { model: 'sonnet' });
  await session.send('What is my favorite color?');
  for await (const msg of session.stream()) { /* Claude remembers */ }
}
```

---

## File Guard Rails via Hooks

Prevent agent from writing scripts outside a designated directory:

```ts
hooks: {
  PreToolUse: [{
    matcher: "Write|Edit|MultiEdit",
    hooks: [async (input): Promise<HookJSONOutput> => {
      const filePath = input.tool_input.file_path || '';
      const ext = path.extname(filePath).toLowerCase();

      if (['.js', '.ts'].includes(ext)) {
        const safeDir = path.join(process.cwd(), 'agent', 'custom_scripts');
        if (!filePath.startsWith(safeDir)) {
          return {
            decision: 'block',
            stopReason: `Scripts must be in ${safeDir}`,
            continue: false
          };
        }
      }
      return { continue: true };
    }]
  }]
}
```

---

## Tool Tracking & Logging

Python pattern for tracking all tool calls across lead agent and subagents:

```python
from claude_agent_sdk import HookMatcher

class SubagentTracker:
    def __init__(self, transcript_writer, session_dir):
        self.transcript = transcript_writer
        self.session_dir = session_dir
        self.calls_file = open(session_dir / 'tool_calls.jsonl', 'a')

    async def pre_tool_use_hook(self, input_data):
        tool_name = input_data.get('tool_name', 'unknown')
        tool_input = input_data.get('tool_input', {})
        self.calls_file.write(json.dumps({
            'event': 'pre',
            'tool': tool_name,
            'input': tool_input,
            'timestamp': datetime.now().isoformat()
        }) + '\n')

    async def post_tool_use_hook(self, input_data):
        tool_name = input_data.get('tool_name', 'unknown')
        self.calls_file.write(json.dumps({
            'event': 'post',
            'tool': tool_name,
            'timestamp': datetime.now().isoformat()
        }) + '\n')

    def close(self):
        self.calls_file.close()

# Usage
tracker = SubagentTracker(transcript, session_dir)
hooks = {
    'PreToolUse': [HookMatcher(matcher=None, hooks=[tracker.pre_tool_use_hook])],
    'PostToolUse': [HookMatcher(matcher=None, hooks=[tracker.post_tool_use_hook])]
}
```

---

## V1 Resume-Based Multi-Turn

Email-agent pattern: each user message is a separate `query()` call, but context persists via `resume`. This is simpler than the streaming input queue for WebSocket servers where messages arrive asynchronously.

```ts
import { AIClient } from "./ai-client";

export class Session {
  private sdkSessionId: string | null = null;
  private aiClient = new AIClient();

  async addUserMessage(content: string): Promise<void> {
    const options = this.sdkSessionId
      ? { resume: this.sdkSessionId }   // Continue existing conversation
      : {};                              // First message — new conversation

    for await (const message of this.aiClient.queryStream(content, options)) {
      this.broadcastToSubscribers(message);

      // Capture session ID from system/init for resume
      if (message.type === 'system' && message.subtype === 'init') {
        this.sdkSessionId = message.session_id;
      }

      if (message.type === 'result') {
        // Ready for next user message
      }
    }
  }

  // Reset conversation (user starts fresh)
  endConversation() {
    this.sdkSessionId = null;
  }
}
```

Key insight: Unlike the streaming input queue (one long-lived query), this approach creates a new `query()` per user message but passes `resume: sessionId` to maintain context. Simpler error handling and query lifecycle management.

When to use vs streaming input:
- **Resume pattern**: Messages arrive asynchronously (WebSocket), need clean query lifecycle per message
- **Queue pattern**: Need continuous agent availability, real-time streaming, one persistent connection

---

## Agent-Generated Code with Hot Reload

Email-agent pattern: the agent writes TypeScript files at runtime, which are hot-reloaded and executed by the application. This lets the agent dynamically extend the app's capabilities.

### Architecture

```
Agent writes files ──> custom_scripts/actions/*.ts
                 ──> custom_scripts/listeners/*.ts
                 ──> custom_scripts/ui-states/*.ts
                              |
                    App watches directory (fs.watch)
                              |
                    Hot-reload via dynamic import()
                              |
                    New capabilities available immediately
```

### The hook guard rail

Ensure the agent can only write scripts to the designated directory:

```ts
hooks: {
  PreToolUse: [{
    matcher: "Write|Edit|MultiEdit",
    hooks: [async (input): Promise<HookJSONOutput> => {
      const filePath = input.tool_input.file_path || '';
      const ext = path.extname(filePath).toLowerCase();
      if (['.js', '.ts'].includes(ext)) {
        const customScriptsPath = path.join(process.cwd(), 'agent', 'custom_scripts');
        if (!filePath.startsWith(customScriptsPath)) {
          return {
            decision: 'block',
            stopReason: `Script files must be in ${customScriptsPath}`,
            continue: false
          };
        }
      }
      return { continue: true };
    }]
  }]
}
```

### Hot-reload manager

```ts
export class ActionsManager {
  private actionsDir = join(process.cwd(), "agent/custom_scripts/actions");
  private templates: Map<string, { config: any; handler: Function }> = new Map();

  async loadAllTemplates() {
    const files = await readdir(this.actionsDir);
    for (const file of files) {
      if (file.endsWith(".ts") && !file.startsWith("_")) {
        await this.loadTemplate(file);
      }
    }
  }

  private async loadTemplate(filename: string) {
    const filePath = join(this.actionsDir, filename);
    // Cache busting for hot reload
    const module = await import(`${filePath}?t=${Date.now()}`);
    if (module.config?.id && typeof module.handler === "function") {
      this.templates.set(module.config.id, {
        config: module.config,
        handler: module.handler
      });
    }
  }

  async watchTemplates(onChange: (templates: any[]) => void) {
    const watcher = watch(this.actionsDir);
    for await (const event of watcher) {
      if (event.filename?.endsWith(".ts")) {
        const templates = await this.loadAllTemplates();
        onChange(templates);
      }
    }
  }
}
```

### How the agent creates scripts

The agent uses the `Skill` tool (loaded via `settingSources: ['project']`) which provides templates and guidance. The system prompt instructs:

```
When the user wants to create reusable actions, use the action-creator skill.
Actions should be user-specific TypeScript files with:
- config: { id, name, description, parameterSchema }
- handler: (params, context) => ActionResult
```

This pattern enables a powerful feedback loop:
1. User requests a new capability ("notify me about urgent emails from my boss")
2. Agent writes a listener TypeScript file via the Write tool
3. File watcher detects the new file
4. System hot-loads it via dynamic import
5. New listener/action is immediately available

---

## MCP Tools with File-Based Output

Email-agent pattern: when tool output is large, write results to a file and return the path instead of inline content.

```ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as fs from "fs";

export const customServer = createSdkMcpServer({
  name: "email",
  version: "1.0.0",
  tools: [
    tool(
      "search_inbox",
      "Search emails using Gmail query syntax",
      { gmailQuery: z.string().describe("Gmail query string") },
      async (args) => {
        const results = await emailAPI.searchEmails({ gmailQuery: args.gmailQuery, limit: 30 });

        // Write full results to timestamped log file
        const logsDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFilePath = path.join(logsDir, `email-search-${timestamp}.json`);

        fs.writeFileSync(logFilePath, JSON.stringify({
          query: args.gmailQuery,
          totalResults: results.length,
          emails: results
        }, null, 2));

        // Return path instead of inline data
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              totalResults: results.length,
              logFilePath,
              message: `Full results written to ${logFilePath}`
            }, null, 2)
          }]
        };
      }
    ),
  ]
});
```

Key insight: The agent can then use `Read` and `Grep` tools to analyze the log file at its own pace, rather than having all data stuffed into the tool response. This avoids token limits and lets the agent use file search tools for analysis.

---

## Python Multi-Turn CLI with Subagent Tracking

Complete pattern from research-agent: multi-turn CLI with `ClaudeSDKClient`, subagent detection, and tool tracking hooks.

### Subagent Tracker via Hooks

```python
import json
from datetime import datetime
from claude_agent_sdk import HookMatcher

class SubagentTracker:
    def __init__(self, transcript_writer, session_dir):
        self.transcript = transcript_writer
        self.session_dir = session_dir
        self.calls_file = open(session_dir / 'tool_calls.jsonl', 'a')

    async def pre_tool_use_hook(self, hook_input, tool_use_id, context):
        tool_name = hook_input.get('tool_name', 'unknown')
        tool_input = hook_input.get('tool_input', {})
        self.calls_file.write(json.dumps({
            'event': 'pre',
            'tool': tool_name,
            'input': tool_input,
            'tool_use_id': tool_use_id,
            'timestamp': datetime.now().isoformat()
        }) + '\n')
        # Register subagent spawn if Task tool
        if tool_name == 'Task':
            self.register_subagent_spawn(tool_use_id, tool_input)
        return {'continue_': True}

    async def post_tool_use_hook(self, hook_input, tool_use_id, context):
        tool_name = hook_input.get('tool_name', 'unknown')
        self.calls_file.write(json.dumps({
            'event': 'post',
            'tool': tool_name,
            'tool_use_id': tool_use_id,
            'timestamp': datetime.now().isoformat()
        }) + '\n')
        return {'continue_': True}

    def register_subagent_spawn(self, parent_tool_use_id, task_input):
        subagent_type = task_input.get('subagent_type', 'unknown')
        # Track which subagent is running under which parent
        self.set_current_context(parent_tool_use_id, subagent_type)

    def set_current_context(self, parent_tool_use_id, subagent_type):
        pass  # Track context for nested subagent detection

    def close(self):
        self.calls_file.close()
```

### Message Stream Parsing for Task Detection

```python
def process_assistant_message(msg, tracker, transcript):
    for block in msg.content:
        if type(block).__name__ == 'TextBlock':
            print(block.text, end="")
            transcript.write(block.text)
        elif type(block).__name__ == 'ToolUseBlock':
            if block.name == 'Task':
                subagent = block.input.get('subagent_type', 'unknown')
                description = block.input.get('description', '')
                print(f"\n[Subagent: {subagent} — {description}]")
```

### Full Orchestrator

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AgentDefinition, HookMatcher

agents = {
    "researcher": AgentDefinition(
        description="Gathers research using web search. Writes findings to files.",
        tools=["WebSearch", "Write"],
        prompt="You are a research specialist...",
        model="haiku"
    ),
    "data-analyst": AgentDefinition(
        description="Generates charts and analysis from research notes.",
        tools=["Glob", "Read", "Bash", "Write"],
        prompt="You are a data analyst...",
        model="haiku"
    ),
}

tracker = SubagentTracker(transcript, session_dir)
hooks = {
    'PreToolUse': [HookMatcher(matcher=None, hooks=[tracker.pre_tool_use_hook])],
    'PostToolUse': [HookMatcher(matcher=None, hooks=[tracker.post_tool_use_hook])]
}

options = ClaudeAgentOptions(
    permission_mode="bypassPermissions",
    setting_sources=["project"],
    system_prompt=lead_agent_prompt,
    allowed_tools=["Task"],
    agents=agents,
    hooks=hooks,
    model="haiku"
)

async with ClaudeSDKClient(options=options) as client:
    await client.query(prompt=user_input)
    async for msg in client.receive_response():
        if type(msg).__name__ == 'AssistantMessage':
            process_assistant_message(msg, tracker, transcript)
        if type(msg).__name__ == 'ResultMessage':
            print(f"\nCost: ${msg.total_cost_usd:.4f}")
```

Key insights:
- Lead agent only needs `allowed_tools=["Task"]` — all work delegated to subagents
- Python hooks receive `(hook_input, tool_use_id, context)` and must return `{'continue_': True}`
- Detect Task tool calls in message stream via `block.name == 'Task'` and extract `subagent_type` from `block.input`
- Track subagent nesting via `tool_use_id` matching against `parent_tool_use_id` on nested messages
