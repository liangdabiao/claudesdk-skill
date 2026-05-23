Documentation Index

Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt

Use this file to discover all available pages before exploring further.

​
Overview
The Claude Agent SDK supports two distinct input modes for interacting with agents:
Streaming Input Mode (Default & Recommended) - A persistent, interactive session
Single Message Input - One-shot queries that use session state and resuming
This guide explains the differences, benefits, and use cases for each mode to help you choose the right approach for your application.
​
Streaming Input Mode (Recommended)
Streaming input mode is the preferred way to use the Claude Agent SDK. It provides full access to the agent’s capabilities and enables rich, interactive experiences.
It allows the agent to operate as a long lived process that takes in user input, handles interruptions, surfaces permission requests, and handles session management.
​
How It Works
Environment/
File System
Tools/Hooks
Claude Agent
Your Application
Environment/
File System
Tools/Hooks
Claude Agent
Your Application
Session stays alive
Persistent file system
state maintained
Initialize with AsyncGenerator
Yield Message 1
Execute tools
Read files
File contents
Write/Edit files
Success/Error
Stream partial response
Stream more content...
Complete Message 1
Yield Message 2 + Image
Process image & execute
Access filesystem
Operation results
Stream response 2
Queue Message 3
Interrupt/Cancel
Handle interruption
​
Benefits
Image Uploads
Attach images directly to messages for visual analysis and understanding
Queued Messages
Send multiple messages that process sequentially, with ability to interrupt
Tool Integration
Full access to all tools and custom MCP servers during the session
Hooks Support
Use lifecycle hooks to customize behavior at various points
Real-time Feedback
See responses as they’re generated, not just final results
Context Persistence
Maintain conversation context across multiple turns naturally
​
Implementation Example
TypeScript
Python
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "fs/promises";

async function* generateMessages(): AsyncGenerator<SDKUserMessage> {
  // First message
  yield {
    type: "user",
    message: {
      role: "user",
      content: "Analyze this codebase for security issues"
    },
    parent_tool_use_id: null
  };

  // Wait for conditions or user input
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Follow-up with image
  yield {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "text",
          text: "Review this architecture diagram"
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: await readFile("diagram.png", "base64")
          }
        }
      ]
    },
    parent_tool_use_id: null
  };
}

// Process streaming responses
for await (const message of query({
  prompt: generateMessages(),
  options: {
    maxTurns: 10,
    allowedTools: ["Read", "Grep"]
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}

​
Single Message Input
Single message input is simpler but more limited.
​
When to Use Single Message Input
Use single message input when:
You need a one-shot response
You do not need image attachments, hooks, etc.
You need to operate in a stateless environment, such as a lambda function
​
Limitations
Single message input mode does not support:
Direct image attachments in messages
Dynamic message queueing
Real-time interruption
Hook integration
Natural multi-turn conversations
​
Implementation Example
TypeScript
Python
import { query } from "@anthropic-ai/claude-agent-sdk";

// Simple one-shot query
for await (const message of query({
  prompt: "Explain the authentication flow",
  options: {
    maxTurns: 1,
    allowedTools: ["Read", "Grep"]
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}

// Continue conversation with session management
for await (const message of query({
  prompt: "Now explain the authorization process",
  options: {
    continue: true,
    maxTurns: 1
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
