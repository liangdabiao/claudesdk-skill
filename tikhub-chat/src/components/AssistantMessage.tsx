import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
}

export function AssistantMessage({ content }: Props) {
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="prose prose-sm max-w-none text-gray-800">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
