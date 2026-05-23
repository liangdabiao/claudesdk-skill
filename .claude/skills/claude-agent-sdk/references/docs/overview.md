Documentation Index

Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt

Use this file to discover all available pages before exploring further.

Starting June 15, 2026, Agent SDK and claude -p usage on subscription plans will draw from a new monthly Agent SDK credit, separate from your interactive usage limits. See Use the Claude Agent SDK with your Claude plan for details.
Build AI agents that autonomously read files, run commands, search the web, edit code, and more. The Agent SDK gives you the same tools, agent loop, and context management that power Claude Code, programmable in Python and TypeScript.
Python
TypeScript
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions


async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"]),
    ):
        print(message)  # Claude reads the file, finds the bug, edits it


asyncio.run(main())

The Agent SDK includes built-in tools for reading files, running commands, and editing code, so your agent can start working immediately without you implementing tool execution. Dive into the quickstart or explore real agents built with the SDK:
Quickstart
Build a bug-fixing agent in minutes
Example agents
Email assistant, research agent, and more
​
Get started
1

Install the SDK

TypeScript
Python
npm install @anthropic-ai/claude-agent-sdk

The TypeScript SDK bundles a native Claude Code binary for your platform as an optional dependency, so you don’t need to install Claude Code separately.
2

Set your API key

Get an API key from the Console, then set it as an environment variable:
export ANTHROPIC_API_KEY=your-api-key

The SDK also supports authentication via third-party API providers:
Amazon Bedrock: set CLAUDE_CODE_USE_BEDROCK=1 environment variable and configure AWS credentials
Claude Platform on AWS: set CLAUDE_CODE_USE_ANTHROPIC_AWS=1 and ANTHROPIC_AWS_WORKSPACE_ID, then configure AWS credentials
Google Vertex AI: set CLAUDE_CODE_USE_VERTEX=1 environment variable and configure Google Cloud credentials
Microsoft Azure: set CLAUDE_CODE_USE_FOUNDRY=1 environment variable and configure Azure credentials
See the setup guides for Bedrock, Claude Platform on AWS, Vertex AI, or Azure AI Foundry for details.
Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead.
3

Run your first agent

This example creates an agent that lists files in your current directory using built-in tools.
Python
TypeScript
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions


async def main():
    async for message in query(
        prompt="What files are in this directory?",
        options=ClaudeAgentOptions(allowed_tools=["Bash", "Glob"]),
    ):
        if hasattr(message, "result"):
            print(message.result)


asyncio.run(main())

Ready to build? Follow the Quickstart to create an agent that finds and fixes bugs in minutes.
​
Capabilities
Everything that makes Claude Code powerful is available in the SDK:
Built-in tools
Hooks
Subagents
MCP
Permissions
Sessions
Your agent can read files, run commands, and search codebases out of the box. Key tools include:
Tool	What it does
Read	Read any file in the working directory
Write	Create new files
Edit	Make precise edits to existing files
Bash	Run terminal commands, scripts, git operations
Monitor	Watch a background script and react to each output line as an event
Glob	Find files by pattern (**/*.ts, src/**/*.py)
Grep	Search file contents with regex
WebSearch	Search the web for current information
WebFetch	Fetch and parse web page content
AskUserQuestion	Ask the user clarifying questions with multiple choice options
This example creates an agent that searches your codebase for TODO comments:
Python
TypeScript
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions


async def main():
    async for message in query(
        prompt="Find all TODO comments and create a summary",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Glob", "Grep"]),
    ):
        if hasattr(message, "result"):
            print(message.result)


asyncio.run(main())

​
Claude Code features
The SDK also supports Claude Code’s filesystem-based configuration. With default options the SDK loads these from .claude/ in your working directory and ~/.claude/. To restrict which sources load, set setting_sources (Python) or settingSources (TypeScript) in your options.
Feature	Description	Location
Skills	Specialized capabilities defined in Markdown	.claude/skills/*/SKILL.md
Slash commands	Custom commands for common tasks	.claude/commands/*.md
Memory	Project context and instructions	CLAUDE.md or .claude/CLAUDE.md
Plugins	Extend with custom commands, agents, and MCP servers	Programmatic via plugins option
​
Compare the Agent SDK to other Claude tools
The Claude Platform offers multiple ways to build with Claude. Here’s how the Agent SDK fits in:
Agent SDK vs Client SDK
Agent SDK vs Claude Code CLI
Agent SDK vs Managed Agents
The Anthropic Client SDK gives you direct API access: you send prompts and implement tool execution yourself. The Agent SDK gives you Claude with built-in tool execution.
With the Client SDK, you implement a tool loop. With the Agent SDK, Claude handles it:
Python
TypeScript
# Client SDK: You implement the tool loop
response = client.messages.create(...)
while response.stop_reason == "tool_use":
    result = your_tool_executor(response.tool_use)
    response = client.messages.create(tool_result=result, **params)

# Agent SDK: Claude handles tools autonomously
async for message in query(prompt="Fix the bug in auth.py"):
    print(message)

​
Changelog
View the full changelog for SDK updates, bug fixes, and new features:
TypeScript SDK: view CHANGELOG.md
Python SDK: view CHANGELOG.md
​
Reporting bugs
If you encounter bugs or issues with the Agent SDK:
TypeScript SDK: report issues on GitHub
Python SDK: report issues on GitHub
​
Branding guidelines
For partners integrating the Claude Agent SDK, use of Claude branding is optional. When referencing Claude in your product:
Allowed:
“Claude Agent” (preferred for dropdown menus)
“Claude” (when within a menu already labeled “Agents”)
” Powered by Claude” (if you have an existing agent name)
Not permitted:
“Claude Code” or “Claude Code Agent”
Claude Code-branded ASCII art or visual elements that mimic Claude Code
Your product should maintain its own branding and not appear to be Claude Code or any Anthropic product. For questions about branding compliance, contact the Anthropic sales team.
​
License and terms
Use of the Claude Agent SDK is governed by Anthropic’s Commercial Terms of Service, including when you use it to power products and services that you make available to your own customers and end users, except to the extent a specific component or dependency is covered by a different license as indicated in that component’s LICENSE file.
​
Next steps
Quickstart
Build an agent that finds and fixes bugs in minutes
Example agents
Email assistant, research agent, and more
TypeScript SDK
Full TypeScript API reference and examples
Python SDK
Full Python API reference and examples
