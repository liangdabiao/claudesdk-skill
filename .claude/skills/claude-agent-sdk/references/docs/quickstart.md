Documentation Index

Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt

Use this file to discover all available pages before exploring further.

Use the Agent SDK to build an AI agent that reads your code, finds bugs, and fixes them, all without manual intervention.
What you’ll do:
Set up a project with the Agent SDK
Create a file with some buggy code
Run an agent that finds and fixes the bugs automatically
​
Prerequisites
Node.js 18+ or Python 3.10+
An Anthropic account (sign up here)
​
Setup
1

Create a project folder

Create a new directory for this quickstart:
mkdir my-agent && cd my-agent

For your own projects, you can run the SDK from any folder; it will have access to files in that directory and its subdirectories by default.
2

Install the SDK

Install the Agent SDK package for your language:
TypeScript
Python (uv)
Python (pip)
npm install @anthropic-ai/claude-agent-sdk

The TypeScript SDK bundles a native Claude Code binary for your platform as an optional dependency, so you don’t need to install Claude Code separately.
3

Set your API key

Get an API key from the Claude Console, then create a .env file in your project directory:
ANTHROPIC_API_KEY=your-api-key

The SDK also supports authentication via third-party API providers:
Amazon Bedrock: set CLAUDE_CODE_USE_BEDROCK=1 environment variable and configure AWS credentials
Claude Platform on AWS: set CLAUDE_CODE_USE_ANTHROPIC_AWS=1 and ANTHROPIC_AWS_WORKSPACE_ID, then configure AWS credentials
Google Vertex AI: set CLAUDE_CODE_USE_VERTEX=1 environment variable and configure Google Cloud credentials
Microsoft Azure: set CLAUDE_CODE_USE_FOUNDRY=1 environment variable and configure Azure credentials
See the setup guides for Bedrock, Claude Platform on AWS, Vertex AI, or Azure AI Foundry for details.
Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead.
​
Create a buggy file
This quickstart walks you through building an agent that can find and fix bugs in code. First, you need a file with some intentional bugs for the agent to fix. Create utils.py in the my-agent directory and paste the following code:
def calculate_average(numbers):
    total = 0
    for num in numbers:
        total += num
    return total / len(numbers)


def get_user_name(user):
    return user["name"].upper()

This code has two bugs:
calculate_average([]) crashes with division by zero
get_user_name(None) crashes with a TypeError
​
Build an agent that finds and fixes bugs
Create agent.py if you’re using the Python SDK, or agent.ts for TypeScript:
Python
TypeScript
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage


async def main():
    # Agentic loop: streams messages as Claude works
    async for message in query(
        prompt="Review utils.py for bugs that would cause crashes. Fix any issues you find.",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Edit", "Glob"],  # Tools Claude can use
            permission_mode="acceptEdits",  # Auto-approve file edits
        ),
    ):
        # Print human-readable output
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "text"):
                    print(block.text)  # Claude's reasoning
                elif hasattr(block, "name"):
                    print(f"Tool: {block.name}")  # Tool being called
        elif isinstance(message, ResultMessage):
            print(f"Done: {message.subtype}")  # Final result


asyncio.run(main())

This code has three main parts:
query: the main entry point that creates the agentic loop. It returns an async iterator, so you use async for to stream messages as Claude works. See the full API in the Python or TypeScript SDK reference.
prompt: what you want Claude to do. Claude figures out which tools to use based on the task.
options: configuration for the agent. This example uses allowedTools to pre-approve Read, Edit, and Glob, and permissionMode: "acceptEdits" to auto-approve file changes. Other options include systemPrompt, mcpServers, and more. See all options for Python or TypeScript.
The async for loop keeps running as Claude thinks, calls tools, observes results, and decides what to do next. Each iteration yields a message: Claude’s reasoning, a tool call, a tool result, or the final outcome. The SDK handles the orchestration (tool execution, context management, retries) so you just consume the stream. The loop ends when Claude finishes the task or hits an error.
The message handling inside the loop filters for human-readable output. Without filtering, you’d see raw message objects including system initialization and internal state, which is useful for debugging but noisy otherwise.
This example uses streaming to show progress in real-time. If you don’t need live output (e.g., for background jobs or CI pipelines), you can collect all messages at once. See Streaming vs. single-turn mode for details.
​
Run your agent
Your agent is ready. Run it with the following command:
Python
TypeScript
python3 agent.py

After running, check utils.py. You’ll see defensive code handling empty lists and null users. Your agent autonomously:
Read utils.py to understand the code
Analyzed the logic and identified edge cases that would crash
Edited the file to add proper error handling
This is what makes the Agent SDK different: Claude executes tools directly instead of asking you to implement them.
If you see “API key not found”, make sure you’ve set the ANTHROPIC_API_KEY environment variable in your .env file or shell environment. See the full troubleshooting guide for more help.
​
Try other prompts
Now that your agent is set up, try some different prompts:
"Add docstrings to all functions in utils.py"
"Add type hints to all functions in utils.py"
"Create a README.md documenting the functions in utils.py"
​
Customize your agent
You can modify your agent’s behavior by changing the options. Here are a few examples:
Add web search capability:
Python
TypeScript
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Edit", "Glob", "WebSearch"], permission_mode="acceptEdits"
)

Give Claude a custom system prompt:
Python
TypeScript
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Edit", "Glob"],
    permission_mode="acceptEdits",
    system_prompt="You are a senior Python developer. Always follow PEP 8 style guidelines.",
)

Run commands in the terminal:
Python
TypeScript
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Edit", "Glob", "Bash"], permission_mode="acceptEdits"
)

With Bash enabled, try: "Write unit tests for utils.py, run them, and fix any failures"
​
Key concepts
Tools control what your agent can do:
Tools	What the agent can do
Read, Glob, Grep	Read-only analysis
Read, Edit, Glob	Analyze and modify code
Read, Edit, Bash, Glob, Grep	Full automation
Permission modes control how much human oversight you want:
Mode	Behavior	Use case
acceptEdits	Auto-approves file edits and common filesystem commands, asks for other actions	Trusted development workflows
dontAsk	Denies anything not in allowedTools	Locked-down headless agents
auto (TypeScript only)	A model classifier approves or denies each tool call	Autonomous agents with safety guardrails
bypassPermissions	Runs every tool without prompts	Sandboxed CI, fully trusted environments
default	Requires a canUseTool callback to handle approval	Custom approval flows
The example above uses acceptEdits mode, which auto-approves file operations so the agent can run without interactive prompts. If you want to prompt users for approval, use default mode and provide a canUseTool callback that collects user input. For more control, see Permissions.
​
Troubleshooting
​
API error thinking.type.enabled is not supported for this model
Claude Opus 4.7 replaces thinking.type.enabled with thinking.type.adaptive. Older Agent SDK versions fail with the following API error when you select claude-opus-4-7:
API Error: 400 {"type":"invalid_request_error","message":"\"thinking.type.enabled\" is not supported for this model. Use \"thinking.type.adaptive\" and \"output_config.effort\" to control thinking behavior."}

Upgrade to Agent SDK v0.2.111 or later to use Opus 4.7.
​
Next steps
Now that you’ve created your first agent, learn how to extend its capabilities and tailor it to your use case:
Permissions: control what your agent can do and when it needs approval
Hooks: run custom code before or after tool calls
Sessions: build multi-turn agents that maintain context
MCP servers: connect to databases, browsers, APIs, and other external systems
Hosting: deploy agents to Docker, cloud, and CI/CD
Example agents: see complete examples: email assistant, research agent, and more
