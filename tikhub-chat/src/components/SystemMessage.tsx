interface Props {
  content: string;
}

export function SystemMessage({ content }: Props) {
  return (
    <div className="flex justify-center mb-3">
      <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
        {content}
      </div>
    </div>
  );
}
