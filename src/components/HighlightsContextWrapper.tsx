import React from 'react';
import { Clock, Bot, ArrowUpRight, Trash2, Database } from 'lucide-react';
import { aiModelIcons } from '../assets/icons';
import { useStore } from '../store';

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

interface HighlightsContextWrapperProps {
  recordId: string;
  recordName: string;
  sectionTitle: string;
  highlights: HighlightData[];
  onDeleteHighlight: (highlightId: string) => Promise<void>;
  onDeleteGroup: () => Promise<void>;
}

export const HighlightsContextWrapper: React.FC<HighlightsContextWrapperProps> = ({
  recordId,
  recordName,
  sectionTitle,
  highlights,
  onDeleteHighlight,
  onDeleteGroup
}) => {
  const { profile } = useStore();
  const modelIcon = highlights[0] ? aiModelIcons[highlights[0].model_id] : null;
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);
  const [highlightToDelete, setHighlightToDelete] = React.useState<string | null>(null);
  const [isConfirmGroupDeleteOpen, setIsConfirmGroupDeleteOpen] = React.useState(false);

  const handleSectionClick = () => {
    if (highlights[0]?.section_id) {
      const sectionElement = document.getElementById(`section-${highlights[0].section_id}`);
      if (sectionElement) {
        sectionElement.scrollIntoView({ behavior: 'smooth' });
        sectionElement.classList.add('bg-blue-50');
        setTimeout(() => {
          sectionElement.classList.remove('bg-blue-50');
        }, 1000);
      }
    }
  };

  const handleDeleteClick = (highlightId: string) => {
    setHighlightToDelete(highlightId);
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (highlightToDelete) {
      await onDeleteHighlight(highlightToDelete);
      setIsConfirmDeleteOpen(false);
      setHighlightToDelete(null);
    }
  };

  const handleGroupDeleteClick = () => {
    setIsConfirmGroupDeleteOpen(true);
  };

  const handleConfirmGroupDelete = async () => {
    await onDeleteGroup();
    setIsConfirmGroupDeleteOpen(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
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

            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">{recordName}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {modelIcon && (
                <div className="flex items-center gap-2">
                  <img
                    src={modelIcon.url}
                    alt={modelIcon.name}
                    className="w-4 h-4 object-contain"
                  />
                  <span>{modelIcon.name}</span>
                </div>
              )}

              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <time dateTime={highlights[0]?.created_at}>
                  {new Date(highlights[0]?.created_at || '').toLocaleTimeString()}
                </time>
              </div>
            </div>

            <button
              onClick={handleGroupDeleteClick}
              className="p-1 hover:bg-red-100 rounded text-red-600 transition-colors"
              title="Delete all highlights in this section"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button
          onClick={handleSectionClick}
          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors group"
        >
          <span className="font-medium truncate max-w-[200px] sm:max-w-[300px] md:max-w-[400px]">
            {sectionTitle}
          </span>
          <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {highlights.map((highlight) => (
          <div key={highlight.id} className="space-y-4">
            {highlight.highlights.map((h, index) => (
              <div key={`${highlight.id}-${index}`} className="relative pl-6 group">
                <div 
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                  style={{ backgroundColor: h.color }}
                />
                <div 
                  className="p-4 rounded-lg relative"
                  style={{ backgroundColor: `${h.color}20` }}
                >
                  <button
                    onClick={() => handleDeleteClick(highlight.id)}
                    className="absolute top-2 right-2 p-1 hover:bg-red-100 rounded text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete highlight"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <blockquote className="text-gray-800 italic pr-8">
                    "{highlight.content.slice(h.start, h.end)}"
                  </blockquote>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Confirm Delete Modal */}
      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h4 className="text-lg font-medium mb-4">Delete Highlight</h4>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this highlight? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                onClick={() => setIsConfirmDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Group Delete Modal */}
      {isConfirmGroupDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h4 className="text-lg font-medium mb-4">Delete All Highlights</h4>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete all highlights in this section? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                onClick={() => setIsConfirmGroupDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                onClick={handleConfirmGroupDelete}
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};