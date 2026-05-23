export interface ToolCall {
  name: string;
  input: unknown;
  status: "running" | "done";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCall?: ToolCall;
  timestamp: number;
}

export interface WSMessage {
  type: string;
  content?: string;
  toolName?: string;
  toolInput?: unknown;
  success?: boolean;
  cost?: number;
  duration?: number;
  error?: string;
  chatId?: string;
}
