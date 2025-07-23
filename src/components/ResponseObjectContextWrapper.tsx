import React from 'react';
import { Clock, Bot, ArrowUpRight, Save } from 'lucide-react';
import { QueryResponse, PromptSection } from '../types';
import { ResponseObjectReviewer } from './ResponseObjectReviewer';
import { ResponseObjectHighlighter } from './ResponseObjectHighlighter';
import { aiModelIcons } from '../assets/icons';
import { useStore } from '../store';

interface ResponseObjectContextWrapperProps {
  response: QueryResponse;
  section?: PromptSection;
}

export const ResponseObjectContextWrapper: React.FC<ResponseObjectContextWrapperProps> = ({
  response,
  section
}) => {
  const { profile } = useStore();
  const modelIcon = aiModelIcons[response.modelId];
  const [isHighlighted, setIsHighlighted] = React.useState(false);
  const [highlights, setHighlights] = React.useState<Array<{ start: number; end: number; color: string }>>([]);

  const handleSectionClick = () => {
    if (section) {
      const sectionElement = document.getElementById(`section-${section.id}`);
      if (sectionElement) {
        sectionElement.scrollIntoView({ behavior: 'smooth' });
        sectionElement.classList.add('bg-blue-50');
        setTimeout(() => {
          sectionElement.classList.remove('bg-blue-50');
        }, 1000);
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100">
            {profile?.avatar_url || profile?.custom_avatar_path ? (
              <img
                src={profile.custom_avatar_path
                  ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${profile.custom_avatar_path}`
                  : profile.avatar_url!}
                alt={profile.display_name || 'User avatar'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                <Bot className="w-4 h-4" />
              </div>
            )}
          </div>

          {section && (
            <button
              onClick={handleSectionClick}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors group"
            >
              <span className="font-medium truncate max-w-[200px] sm:max-w-[300px] md:max-w-[400px]">
                {section.title}
              </span>
              <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            {modelIcon && (
              <img
                src={modelIcon.url}
                alt={modelIcon.name}
                className="w-4 h-4 object-contain"
              />
            )}
            <span>{modelIcon?.name || response.modelId}</span>
          </div>

          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <time dateTime={response.timestamp}>
              {new Date(response.timestamp).toLocaleTimeString()}
            </time>
          </div>
        </div>
      </div>

      <div className="p-4">
        {isHighlighted ? (
          <ResponseObjectHighlighter
            content={response.content}
            highlights={highlights}
            onHighlight={setHighlights}
            responseId={response.id}
            modelId={response.modelId}
            sectionId={section?.id}
            sectionTitle={section?.title}
          />
        ) : (
          <ResponseObjectReviewer 
            content={response.content} 
            status={response.status}
          />
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-sm">
        <div className="text-gray-500">
          {response.status === 'completed' && (
            <>Response generated in {new Date(response.timestamp).toLocaleString()}</>
          )}
        </div>
        {response.status === 'completed' && (
          <button
            onClick={() => setIsHighlighted(!isHighlighted)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            <Save className="w-4 h-4" />
            {isHighlighted ? 'Save Highlights' : 'Highlight Response'}
          </button>
        )}
      </div>
    </div>
  );
};