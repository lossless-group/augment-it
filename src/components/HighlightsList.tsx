import React from 'react';
import { Bot } from 'lucide-react';
import { useStore } from '../store';
import { RecordHighlightsWrapper } from './RecordHighlightsWrapper';

interface GroupedHighlights {
  [recordId: string]: {
    recordName: string;
    highlights: Array<{
      id: string;
      response_id: string;
      content: string;
      highlights: Array<{ start: number; end: number; color: string }>;
      section_title?: string;
      section_id?: string;
      model_id: string;
      created_at: string;
      record_id: string;
      record_name: string;
    }>;
  };
}

export const HighlightsList: React.FC = () => {
  const { highlights, deleteHighlight, deleteHighlightGroup, loadHighlights } = useStore();

  // Load highlights when component mounts
  React.useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  // Group highlights by record
  const groupedHighlights = React.useMemo(() => {
    return highlights.reduce((acc, highlight) => {
      if (!acc[highlight.record_id]) {
        acc[highlight.record_id] = {
          recordName: highlight.record_name,
          highlights: []
        };
      }
      acc[highlight.record_id].highlights.push(highlight);
      return acc;
    }, {} as GroupedHighlights);
  }, [highlights]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold">Highlights</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 min-h-full">
          {Object.keys(groupedHighlights).length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Bot className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>No highlights yet</p>
                <p className="text-sm">Save and highlight responses to see them here</p>
              </div>
            </div>
          ) : (
            Object.entries(groupedHighlights).map(([recordId, { recordName, highlights }]) => (
              <RecordHighlightsWrapper
                key={recordId}
                recordId={recordId}
                recordName={recordName}
                highlights={highlights}
                onDeleteHighlight={deleteHighlight}
                onDeleteGroup={deleteHighlightGroup}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};