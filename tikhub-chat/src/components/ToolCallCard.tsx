import type { ToolCall } from "../types";

interface Props {
  toolCall: ToolCall;
}

function getToolLabel(name: string): string {
  if (name === "Skill") return "调用 Skill";
  if (name === "Bash") return "执行命令";
  if (name === "Read") return "读取文件";
  return name;
}

function getInputSummary(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return String(input ?? "");
  const obj = input as Record<string, unknown>;

  if (name === "Bash" && obj.command) {
    const cmd = String(obj.command);
    if (cmd.includes("api_searcher.py")) return `搜索 API: ${cmd.split(" ").slice(-1)[0] || ""}`;
    if (cmd.includes("api_client.py")) return `调用 API: ${cmd.substring(0, 80)}`;
    return cmd.substring(0, 100);
  }

  if (name === "Skill" && obj.skill) return `Skill: ${obj.skill}`;

  return JSON.stringify(input).substring(0, 120);
}

export function ToolCallCard({ toolCall }: Props) {
  const isRunning = toolCall.status === "running";

  return (
    <div className="flex justify-start mb-3">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
          isRunning
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-gray-50 border-gray-200 text-gray-600"
        }`}
      >
        {isRunning && (
          <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        )}
        <span className="font-medium">{getToolLabel(toolCall.name)}</span>
        <span className="opacity-70 truncate max-w-[300px]">
          {getInputSummary(toolCall.name, toolCall.input)}
        </span>
      </div>
    </div>
  );
}
