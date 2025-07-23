import React, { useState, useEffect } from 'react';
import { RecordList } from './RecordList';
import { PromptList } from './PromptList';
import { PromptSection } from './PromptSection';
import { QueryResponseList } from './QueryResponseList';
import { HighlightsList } from './HighlightsList';
import { useStore } from '../store';

interface MainLayoutProps {
  onOpenDataModel: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ onOpenDataModel }) => {
  const { selectedRecord, selectedTemplate } = useStore();
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [loadedColumns, setLoadedColumns] = useState<string[]>([]);

  // Column configuration
  const columns = [
    { id: 'records', component: <RecordList onOpenDataModel={onOpenDataModel} /> },
    { id: 'prompts', component: <PromptList /> },
    { id: 'content', component: (
      <div className="h-full overflow-y-auto">
        {selectedRecord && selectedTemplate ? (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">{selectedTemplate.title}</h2>
              <p className="text-gray-600">{selectedTemplate.description}</p>
            </div>
            <div className="space-y-6">
              {selectedTemplate.sections.map((section) => (
                <PromptSection
                  key={section.id}
                  section={section}
                  templateId={selectedTemplate.id}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <p>Select a record and prompt template to get started</p>
          </div>
        )}
      </div>
    ) },
    { id: 'responses', component: <QueryResponseList /> },
    { id: 'highlights', component: <HighlightsList /> }
  ];

  // Load columns sequentially
  useEffect(() => {
    const loadColumns = async () => {
      for (const column of columns) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for visual effect
        setLoadedColumns(prev => [...prev, column.id]);
      }
    };
    loadColumns();
  }, []);

  // Column width management
  const getColumnWidth = (columnId: string) => {
    const baseStyles = 'transition-all duration-300 ease-in-out';
    const minWidth = 'min-w-[6%]';
    const maxWidth = hoveredColumn === columnId ? 'w-[60%]' : '';
    const collapsedWidth = hoveredColumn && hoveredColumn !== columnId ? 'w-[6%]' : 'w-[20%]';
    const contentColumn = columnId === 'content' ? 'flex-1' : '';

    return `${baseStyles} ${minWidth} ${maxWidth} ${collapsedWidth} ${contentColumn}`.trim();
  };

  // Column styles
  const getColumnStyles = (columnId: string) => {
    const isLoaded = loadedColumns.includes(columnId);
    const baseStyles = `
      h-screen
      overflow-hidden
      border-l
      shadow-[-1px_0_3px_rgba(0,0,0,0.1)]
      bg-white
      relative
      ${getColumnWidth(columnId)}
    `.trim();

    const transitionStyles = isLoaded
      ? 'opacity-100 transform translate-x-0'
      : 'opacity-0 transform -translate-x-full';

    return `${baseStyles} ${transitionStyles}`;
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {columns.map(({ id, component }) => (
        <div
          key={id}
          className={getColumnStyles(id)}
          onMouseEnter={() => setHoveredColumn(id)}
          onMouseLeave={() => setHoveredColumn(null)}
        >
          <div className="h-full w-full overflow-hidden">
            {component}
          </div>
        </div>
      ))}
    </div>
  );
};