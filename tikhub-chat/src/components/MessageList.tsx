import { useRef, useEffect } from "react";
import type { ChatMessage } from "../types";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolCallCard } from "./ToolCallCard";
import { SystemMessage } from "./SystemMessage";

interface Props {
  messages: ChatMessage[];
  isThinking: boolean;
}

export function MessageList({ messages, isThinking }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <p className="text-4xl mb-4">💬</p>
            <p className="text-lg font-medium">TikHub AI Chat</p>
            <p className="text-sm mt-2">
              输入你的问题，例如：
            </p>
            <p className="text-sm text-gray-500 mt-1">
              "帮我搜索 TikTok 上关于游戏的视频"
            </p>
            <p className="text-sm text-gray-500">
              "查一下抖音热门美食视频"
            </p>
          </div>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.toolCall) {
          return <ToolCallCard key={msg.id} toolCall={msg.toolCall} />;
        }

        if (msg.role === "user") {
          return <UserMessage key={msg.id} content={msg.content} />;
        }

        if (msg.role === "assistant") {
          return <AssistantMessage key={msg.id} content={msg.content} />;
        }

        if (msg.role === "system" && msg.content) {
          return <SystemMessage key={msg.id} content={msg.content} />;
        }

        return null;
      })}

      {isThinking && (
        <div className="flex justify-start mb-4">
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
