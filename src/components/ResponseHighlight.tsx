import React from 'react';

interface ResponseHighlightProps {
  content: string;
  highlight: {
    start: number;
    end: number;
    color: string;
  };
  modelId: string;
  timestamp: string;
}

export const ResponseHighlight: React.FC<ResponseHighlightProps> = ({
  content,
  highlight,
  modelId,
  timestamp
}) => {
  // Extract the highlighted text
  const highlightedText = content.slice(highlight.start, highlight.end);

  return (
    <div className="relative pl-6">
      <div 
        className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
        style={{ backgroundColor: highlight.color }}
      />
      <div 
        className="p-4 rounded-lg"
        style={{ backgroundColor: `${highlight.color}20` }}
      >
        <blockquote className="text-gray-800 italic">
          "{highlightedText}"
        </blockquote>
        <div className="mt-2 text-sm text-gray-500">
          Generated with {modelId} at {new Date(timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
};