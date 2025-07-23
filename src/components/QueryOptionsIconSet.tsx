import React from 'react';
import { Plus, Bot, Settings, Brain, Sparkles, MessageSquare } from 'lucide-react';
import { aiModelIcons } from '../assets/icons';
import { EditQueryOptions } from './EditQueryOptions';

interface QueryOptionsIconSetProps {
  onSelectModel: (modelId: string) => void;
}

export const QueryOptionsIconSet: React.FC<QueryOptionsIconSetProps> = ({ onSelectModel }) => {
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const models = Object.values(aiModelIcons);

  // Function to get fallback icon based on model ID
  const getFallbackIcon = (modelId: string) => {
    switch (modelId) {
      case 'perplexity':
        return <Brain className="w-5 h-5" />;
      case 'claude':
        return <Sparkles className="w-5 h-5" />;
      case 'gpt4':
        return <MessageSquare className="w-5 h-5" />;
      default:
        return <Bot className="w-5 h-5" />;
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border border-blue-200 rounded-lg p-2 relative">
        <button
          onClick={() => setIsEditOpen(true)}
          className="absolute -top-2 -left-2 p-1 bg-white hover:bg-gray-50 rounded-full border border-blue-200 text-blue-500 hover:text-blue-600 transition-colors"
          title="Configure AI Models"
        >
          <Settings className="w-4 h-4" />
        </button>

        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => onSelectModel(model.id)}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors group relative"
            title={model.name}
          >
            <div className="w-5 h-5 flex items-center justify-center">
              {model.url ? (
                <img 
                  src={model.url} 
                  alt={model.name}
                  className="w-5 h-5 object-contain opacity-70 group-hover:opacity-100"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement?.appendChild(
                      (() => {
                        const div = document.createElement('div');
                        div.className = 'text-gray-500 group-hover:text-gray-700';
                        div.appendChild(getFallbackIcon(model.id).type());
                        return div;
                      })()
                    );
                  }}
                />
              ) : (
                <div className="text-gray-500 group-hover:text-gray-700">
                  {getFallbackIcon(model.id)}
                </div>
              )}
            </div>
          </button>
        ))}
        <button
          className="p-1.5 hover:bg-blue-50 rounded-full text-blue-500 hover:text-blue-600 transition-colors"
          title="Add custom model"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <EditQueryOptions
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />
    </>
  );
};