# Claude Agent SDK — Full API Reference

## Table of Contents

1. [TypeScript: query() Options](#typescript-query-options)
2. [TypeScript: V2 Session API](#typescript-v2-session-api)
3. [Python: ClaudeAgentOptions](#python-claudeagentoptions)
4. [Message Types (shared)](#message-types)
5. [Tool Definition API](#tool-definition-api)
6. [Hook Callback Signatures](#hook-callback-signatures)
7. [AgentDefinition](#agentdefinition)
8. [Permission Callback](#permission-callback)
9. [MCP Server Config](#mcp-server-config)

---

## TypeScript: query() Options

```ts
import { query } from '@anthropic-ai/claude-agent-sdk';

query({ prompt, options })
```

### prompt

| Type | Description |
|------|-------------|
| `string` | Single user message |
| `AsyncIterable<UserMessage>` | Streaming input for multi-turn |
| `null` | When resuming a session (use `resume` option) |

UserMessage shape for async iterable:
```ts
{ type: 'user', message: { role: 'user', content: string } }
```

### options object

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `abortController` | `AbortController` | `new AbortController()` | Cancel operations |
| `additionalDirectories` | `string[]` | `[]` | Extra directories agent can access |
| `agents` | `Record<string, AgentDefinition>` | `undefined` | Subagent definitions |
| `allowDangerouslySkipPermissions` | `boolean` | `false` | Required with `permissionMode: 'bypassPermissions'` |
| `allowedTools` | `string[]` | all tools | Tool whitelist |
| `betas` | `SdkBeta[]` | `[]` | Beta features (e.g., `['context-1m-2025-08-07']`) |
| `canUseTool` | `(toolName: string, input: any) => Promise<CanUseToolResult>` | `undefined` | Runtime permission callback |
| `continue` | `boolean` | `false` | Continue most recent conversation |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `disallowedTools` | `string[]` | `[]` | Tool blacklist |
| `enableFileCheckpointing` | `boolean` | `false` | Track file changes for rewind |
| `env` | `Dict<string>` | `process.env` | Environment variables |
| `executable` | `'bun' \| 'deno' \| 'node'` | auto-detected | JavaScript runtime |
| `executableArgs` | `string[]` | `[]` | Args for runtime |
| `extraArgs` | `Record<string, string \| null>` | `{}` | Extra CLI arguments |
| `fallbackModel` | `string` | `undefined` | Fallback model |
| `forkSession` | `boolean` | `false` | Fork session on resume |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | `{}` | Event hooks |
| `includePartialMessages` | `boolean` | `false` | Include partial message events |
| `maxBudgetUsd` | `number` | `undefined` | Budget cap in USD |
| `maxThinkingTokens` | `number` | `undefined` | Max thinking tokens |
| `maxTurns` | `number` | `undefined` | Max reasoning loops |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | MCP server configs |
| `model` | `string` | CLI default | Model name or shortcut (`'opus'`, `'sonnet'`, `'haiku'`) |
| `outputFormat` | `{ type: 'json_schema', schema: JSONSchema }` | `undefined` | Structured output schema |
| `pathToClaudeCodeExecutable` | `string` | built-in | Override CLI path |
| `permissionMode` | `PermissionMode` | `'default'` | Permission strategy |
| `permissionPromptToolName` | `string` | `undefined` | MCP tool for permission prompts |
| `plugins` | `SdkPluginConfig[]` | `[]` | Custom plugins |
| `resume` | `string` | `undefined` | Session ID to resume |
| `resumeSessionAt` | `string` | `undefined` | Resume at specific message UUID |
| `sandbox` | `SandboxSettings` | `undefined` | Sandbox configuration |
| `settingSources` | `SettingSource[]` | `[]` | Settings sources: `'local'`, `'project'`, `'user'` |
| `stderr` | `(data: string) => void` | `undefined` | Stderr callback |
| `strictMcpConfig` | `boolean` | `false` | Strict MCP validation |
| `systemPrompt` | `string \| { type: 'preset', preset: 'claude_code', append?: string }` | `undefined` | System prompt |
| `tools` | `string[] \| { type: 'preset', preset: 'claude_code' }` | `undefined` | Override available tools |

---

## TypeScript: V2 Session API

```ts
import { unstable_v2_createSession, unstable_v2_resumeSession, unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk';
```

### unstable_v2_createSession(options)

Creates a new session. Returns an object with `send()` and `stream()` methods. Supports `await using` for automatic cleanup.

```ts
await using session = unstable_v2_createSession({ model: 'sonnet' });
```

Options: `{ model: string, ...same as query options }`

### session.send(message: string)

Send a user message. Non-blocking. Call `stream()` after to read response.

### session.stream()

Returns `AsyncIterable<Message>`. Yields messages for the current turn.

### unstable_v2_prompt(prompt: string, options?)

One-shot convenience. Returns a `ResultMessage` directly.

```ts
const result = await unstable_v2_prompt('Hello', { model: 'sonnet' });
// result.subtype === 'success' | 'error'
// result.result — text content
// result.total_cost_usd — cost
```

### unstable_v2_resumeSession(sessionId: string, options?)

Resume a previously created session. Session ID comes from `system/init` message or `result` message.

```ts
await using session = unstable_v2_resumeSession(sessionId, { model: 'sonnet' });
```

---

## Python: ClaudeAgentOptions

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AgentDefinition, HookMatcher
```

| Field | Type | Description |
|-------|------|-------------|
| `allowed_tools` | `list[str]` | Tool whitelist |
| `system_prompt` | `str \| SystemPromptPreset \| None` | System prompt or preset |
| `mcp_servers` | `dict[str, McpServerConfig] \| str \| Path` | MCP servers or config path |
| `permission_mode` | `PermissionMode \| None` | Permission strategy |
| `continue_conversation` | `bool` | Continue recent conversation |
| `resume` | `str \| None` | Session ID to resume |
| `max_turns` | `int \| None` | Max reasoning loops |
| `disallowed_tools` | `list[str]` | Tool blacklist |
| `enable_file_checkpointing` | `bool` | File change tracking |
| `model` | `str \| None` | Model name |
| `output_format` | `OutputFormat \| None` | Structured output |
| `cwd` | `str \| Path \| None` | Working directory |
| `settings` | `str \| None` | Additional settings |
| `add_dirs` | `list[str \| Path]` | Additional directories |
| `env` | `dict[str, str]` | Environment variables |
| `hooks` | `dict[HookEvent, list[HookMatcher]]` | Event hooks |
| `user` | `str \| None` | User identifier |
| `include_partial_messages` | `bool` | Partial messages |
| `fork_session` | `bool` | Fork on resume |
| `agents` | `dict[str, AgentDefinition] \| None` | Subagent definitions |
| `setting_sources` | `list[SettingSource] \| None` | Settings sources |

### ClaudeSDKClient usage

```python
async with ClaudeSDKClient(options=options) as client:
    await client.query(prompt="Your prompt")
    async for msg in client.receive_response():
        # Handle messages
        pass
```

---

## Message Types

### System Init Message

```ts
{
  type: 'system',
  subtype: 'init',
  session_id: string,
  // ... other init data
}
```

### Assistant Message

```ts
{
  type: 'assistant',
  message: {
    role: 'assistant',
    content: ContentBlock[]
  }
}
```

ContentBlock variants:
```ts
{ type: 'text', text: string }
{ type: 'tool_use', id: string, name: string, input: Record<string, any> }
{ type: 'thinking', thinking: string }
```

### User Message (tool result echo)

```ts
{
  type: 'user',
  message: {
    role: 'user',
    content: ContentBlock[]
  },
  uuid?: string  // checkpoint UUID
}
```

### Result Message

```ts
{
  type: 'result',
  subtype: 'success' | 'error',
  result: string,           // Final text output
  total_cost_usd: number,   // Total cost
  duration_ms: number,      // Duration
  session_id: string,       // For resume
  num_turns: number          // Turns used
}
```

### Subagent context

Messages within a subagent have `parent_tool_use_id` field. Use this to distinguish lead agent vs subagent messages.

---

## Tool Definition API

### TypeScript

```ts
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const server = createSdkMcpServer({
  name: 'server-name',
  version: '1.0.0',
  tools: [
    tool(
      'tool_name',                                    // name
      'Description of what the tool does',            // description
      { param1: z.string().describe('Param desc') },  // Zod schema
      async (args) => {                               // handler
        // args has typed fields from schema
        return {
          content: [{ type: 'text', text: 'Result' }]
        };
      }
    ),
  ]
});
```

Tool return shape:
```ts
{
  content: [
    { type: 'text', text: string } |
    { type: 'image', data: string, mimeType: string } |
    { type: 'resource', resource: { uri: string, text: string } }
  ]
}
```

### Tool name convention

Custom tools are referenced as `mcp__<server-name>__<tool-name>` in `allowedTools`.

---

## Hook Callback Signatures

### TypeScript

```ts
type HookEvent = 'PreToolUse' | 'PostToolUse';

type HookCallbackMatcher = {
  matcher: string;  // regex for tool names, null/undefined for all
  hooks: ((input: HookInput) => Promise<HookJSONOutput>)[];
};

type HookInput = {
  tool_name: string;
  tool_input: Record<string, any>;
  tool_output?: any;  // PostToolUse only
};

type HookJSONOutput =
  | { continue: true }
  | { decision: 'block', stopReason: string, continue: false };
```

### Python

```python
from claude_agent_sdk import HookMatcher

HookMatcher(
    matcher=None,  # None matches all tools, or regex string
    hooks=[callback_function]
)

# callback signature: async def hook(hook_input, tool_use_id, context)
# hook_input is a dict with 'tool_name', 'tool_input', 'tool_output'
# return {'continue_': True} to allow (note trailing underscore)
# raise to block
```

---

## AgentDefinition

### TypeScript

```ts
agents: {
  "agent-name": {
    description: string;  // When to use this agent (lead agent reads this)
    prompt: string;       // System prompt for the subagent
    tools: string[];      // Tools available to subagent
    model?: string;       // Optional model override
  }
}
```

### Python

```python
from claude_agent_sdk import AgentDefinition

AgentDefinition(
    description="When to use this agent",
    prompt="System prompt",
    tools=["WebSearch", "Write"],
    model="haiku"  # optional
)
```

---

## Permission Callback

### canUseTool (TypeScript)

```ts
canUseTool: async (toolName: string, input: any) => {
  return {
    behavior: 'allow' | 'deny',
    updatedInput?: any,      // Modified input (behavior: allow)
    message?: string          // Deny reason (behavior: deny)
  };
}
```

### canUseTool (Python)

```python
def can_use_tool(tool_name: str, input_params: dict) -> dict:
    return {
        "behavior": "allow",  # or "deny"
        "updatedInput": input_params,
        "message": "Optional deny reason"
    }
```

---

## MCP Server Config

### In-process MCP server (createSdkMcpServer)

Pass the server object directly:
```ts
mcpServers: { "name": serverObject }
```

### External MCP server (command-based)

```ts
mcpServers: {
  "name": {
    command: string,         // Executable to run
    args: string[],          // Arguments
    env?: Record<string, string>  // Environment
  }
}
```

### Python external server

```python
mcp_servers={
    "name": {
        "command": "python",
        "args": ["-m", "my_mcp_server"],
        "env": {"KEY": "value"}
    }
}
```
