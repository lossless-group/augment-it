import React from 'react';
import { Database, ChevronDown, ChevronRight } from 'lucide-react';
import { HighlightsContextWrapper } from './HighlightsContextWrapper';

interface HighlightData {
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
}

interface GroupedHighlights {
  [sectionTitle: string]: HighlightData[];
}

interface RecordHighlightsWrapperProps {
  recordId: string;
  recordName: string;
  highlights: HighlightData[];
  onDeleteHighlight: (highlightId: string) => Promise<void>;
  onDeleteGroup: (recordId: string, sectionTitle: string) => Promise<void>;
}

export const RecordHighlightsWrapper: React.FC<RecordHighlightsWrapperProps> = ({
  recordId,
  recordName,
  highlights,
  onDeleteHighlight,
  onDeleteGroup
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true);

  // Group highlights by section title
  const groupedHighlights = React.useMemo(() => {
    return highlights.reduce((acc, highlight) => {
      const sectionTitle = highlight.section_title || 'Uncategorized';
      if (!acc[sectionTitle]) {
        acc[sectionTitle] = [];
      }
      acc[sectionTitle].push(highlight);
      return acc;
    }, {} as GroupedHighlights);
  }, [highlights]);

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-gray-400" />
          <span className="font-medium text-gray-700">{recordName}</span>
          <span className="text-sm text-gray-500">
            ({Object.keys(groupedHighlights).length} prompt{Object.keys(groupedHighlights).length !== 1 ? 's' : ''})
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="divide-y">
          {Object.entries(groupedHighlights).map(([sectionTitle, sectionHighlights]) => (
            <div key={`${recordId}-${sectionTitle}`} className="p-4">
              <HighlightsContextWrapper
                recordId={recordId}
                recordName={recordName}
                sectionTitle={sectionTitle}
                highlights={sectionHighlights}
                onDeleteHighlight={onDeleteHighlight}
                onDeleteGroup={() => onDeleteGroup(recordId, sectionTitle)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};