// Email Agent Session Management Example
// 基于 email-agent 项目的会话管理实现

import { Database } from "bun:sqlite";
import * as path from "path";
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// 简化的消息队列类
class MessageQueue<T> {
  private queue: T[] = [];
  private waiting: ((item: T) => void) | null = null;

  push(item: T) {
    if (this.waiting) {
      this.waiting(item);
      this.waiting = null;
    } else {
      this.queue.push(item);
    }
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else {
        yield await new Promise<T>(r => this.waiting = r);
      }
    }
  }
}

// 会话类管理单个 Claude 对话
export class EmailAgentSession {
  public readonly id: string;
  private messageQueue: MessageQueue<SDKUserMessage>;
  private queryPromise: Promise<void> | null = null;
  private subscribers: Set<any> = new Set();
  private db: Database;
  private messageCount = 0;
  private sdkSessionId: string | null = null;

  constructor(id: string, db: Database) {
    this.id = id;
    this.db = db;
    this.messageQueue = new MessageQueue();
  }

  // 处理单个用户消息
  async addUserMessage(content: string): Promise<void> {
    if (this.queryPromise) {
      await this.queryPromise;
    }

    this.messageCount++;
    console.log(`Processing message ${this.messageCount} in session ${this.id}`);

    this.queryPromise = (async () => {
      try {
        // 使用 resume 进行多轮对话，第一次消息继续
        const options = this.sdkSessionId
          ? { resume: this.sdkSessionId }
          : {};

        for await (const message of query({
          prompt: content,
          options: {
            ...options,
            model: 'sonnet',
            maxTurns: 50,
            cwd: path.join(process.cwd(), 'agent'),
            allowedTools: ['Read', 'Write', 'Edit', 'WebSearch', 'WebFetch']
          }
        })) {
          this.broadcastToSubscribers(message);

          // 捕获 SDK 会话 ID 用于多轮对话
          if (message.type === 'system' && message.subtype === 'init') {
            this.sdkSessionId = message.session_id;
            console.log(`Captured SDK session ID: ${this.sdkSessionId}`);
          }

          // 检查对话是否以结果结束
          if (message.type === 'result') {
            console.log('Result received, ready for next user message');
          }
        }
      } catch (error) {
        console.error(`Error in session ${this.id}:`, error);
      } finally {
        this.queryPromise = null;
      }
    })();

    await this.queryPromise;
  }

  // 订阅 WebSocket 客户端到这个会话
  subscribe(client: any) {
    this.subscribers.add(client);
  }

  // 取消订阅 WebSocket 客户端
  unsubscribe(client: any) {
    this.subscribers.delete(client);
  }

  // 向所有订阅者广播消息
  private broadcastToSubscribers(message: SDKMessage) {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error broadcasting to subscriber:', error);
      }
    }
  }
}

// 使用示例
export async function demoEmailAgentSession() {
  // 创建内存数据库
  const db = new Database(':memory:');
  
  // 创建会话
  const session = new EmailAgentSession('demo-session', db);
  
  // 添加一个简单的订阅者
  session.subscribe({
    send: (msg: string) => console.log('Received message:', JSON.parse(msg))
  });
  
  // 发送测试消息
  await session.addUserMessage('Hello, can you help me organize my email?');
  
  db.close();
}

// 运行示例
if (require.main === module) {
  demoEmailAgentSession().catch(console.error);
}
