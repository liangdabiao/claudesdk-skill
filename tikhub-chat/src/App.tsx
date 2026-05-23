import { useWebSocket } from "./hooks/useWebSocket";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";

export default function App() {
  const { messages, sendMessage, isConnected, isThinking } = useWebSocket();

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl">💬</span>
          <div>
            <h1 className="text-base font-semibold text-gray-900">TikHub AI Chat</h1>
            <p className="text-xs text-gray-500">社交媒体数据助手</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-400"
            }`}
          />
          <span className="text-xs text-gray-500">
            {isConnected ? "已连接" : "未连接"}
          </span>
        </div>
      </header>

      {/* Messages */}
      <MessageList messages={messages} isThinking={isThinking} />

      {/* Input */}
      <MessageInput onSend={sendMessage} disabled={!isConnected || isThinking} />
    </div>
  );
}
