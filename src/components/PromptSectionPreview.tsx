import React from 'react';
import { Send, Edit2 } from 'lucide-react';
import { useStore } from '../store';
import type { PromptSection as PromptSectionType } from '../types';
import { QueryOptionsIconSet } from './QueryOptionsIconSet';

interface PromptSectionPreviewProps {
  section: PromptSectionType;
  templateId: string;
  onEdit: () => void;
}

export const PromptSectionPreview: React.FC<PromptSectionPreviewProps> = ({
  section,
  templateId,
  onEdit
}) => {
  const [selectedModelId, setSelectedModelId] = React.useState<string | null>(null);
  const { selectedRecord, selectedTemplate, generateAIResponse } = useStore();
  const [content, setContent] = React.useState<string>('');

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
  };

  const handleGenerate = async () => {
    if (!selectedModelId) {
      alert('Please select an AI model first');
      return;
    }

    const interpolatedContent = interpolateContent(
      selectedTemplate?.mdxContent || section.content
    );

    await generateAIResponse(section.id, selectedModelId, interpolatedContent, section.title);
  };

  const interpolateContent = (content: string) => {
    if (!selectedRecord) return content;

    let interpolated = content;
    const regex = /\{\{([\w.]+)\}\}/g;
    const matches = [...content.matchAll(regex)];

    matches.sort((a, b) => b[0].length - a[0].length);

    for (const match of matches) {
      const [fullMatch, path] = match;
      if (path.startsWith('record.')) {
        const property = path.replace('record.', '');
        const value = selectedRecord[property];
        if (value !== undefined) {
          const replaceRegex = new RegExp(fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          interpolated = interpolated.replace(replaceRegex, String(value));
        }
      }
    }

    return interpolated;
  };

  React.useEffect(() => {
    const processContent = async () => {
      const contentToProcess = selectedTemplate?.mdxContent || section.content;

      if (!contentToProcess) {
        setContent('');
        return;
      }

      try {
        const interpolatedContent = interpolateContent(contentToProcess);
        setContent(interpolatedContent);
      } catch (error) {
        console.error('Error processing content:', error);
        setContent('Error processing content');
      }
    };

    processContent();
  }, [section, selectedTemplate, selectedRecord]);

  const renderContent = () => {
    if (!content) {
      return <div className="text-gray-500">No content to display</div>;
    }

    return content.split('\n').map((line, index) => {
      if (line.startsWith('#')) {
        const match = line.match(/^(#{1,6})\s(.+)$/);
        if (match) {
          const [, hashes, content] = match;
          const level = hashes.length;
          const className = {
            1: 'text-3xl font-bold mb-6',
            2: 'text-2xl font-bold mb-5',
            3: 'text-xl font-bold mb-4',
            4: 'text-lg font-bold mb-3',
            5: 'text-base font-bold mb-2',
            6: 'text-sm font-bold mb-2'
          }[level];

          const Tag = `h${level}` as keyof JSX.IntrinsicElements;
          return <Tag key={index} className={className}>{content}</Tag>;
        }
      }

      if (line.startsWith('- ')) {
        return (
          <ul key={index} className="list-disc pl-5 mb-1">
            <li className="mb-1">{line.slice(2)}</li>
          </ul>
        );
      }

      if (line.match(/^\d+\.\s/)) {
        return (
          <ol key={index} className="list-decimal pl-5 mb-1">
            <li className="mb-1">{line.replace(/^\d+\.\s/, '')}</li>
          </ol>
        );
      }

      if (line.startsWith('> ')) {
        return (
          <blockquote key={index} className="border-l-4 border-gray-200 pl-4 my-4 italic">
            {line.slice(2)}
          </blockquote>
        );
      }

      if (line.match(/^[\-*_]{3,}$/)) {
        return <hr key={index} className="my-6 border-t border-gray-200" />;
      }

      if (line.trim() === '') {
        return <div key={index} className="h-4" />;
      }

      return <p key={index} className="mb-4 leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="border rounded-lg shadow-sm bg-white">
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">{section.title}</h3>
          <div className="flex items-center gap-4">
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
            <QueryOptionsIconSet onSelectModel={handleModelSelect} />
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                selectedModelId
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              onClick={handleGenerate}
              disabled={!selectedModelId}
            >
              <Send className="h-4 w-4" />
              Generate
            </button>
          </div>
        </div>
        <div className="prose prose-sm max-w-none">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};