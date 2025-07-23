import React from 'react';
import { useStore } from '../store';
import { QueryResponse } from './QueryResponse';

export const QueryResponseList: React.FC = () => {
  const { queryResponses, selectedTemplate } = useStore();

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-semibold">AI Responses</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 min-h-full">
          {queryResponses.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <p>No responses yet</p>
              <p className="text-sm">Generate content using the AI models</p>
            </div>
          ) : (
            queryResponses.map((response) => {
              const section = selectedTemplate?.sections.find(
                s => s.id === response.promptSectionId
              );

              return (
                <QueryResponse
                  key={response.id}
                  response={response}
                  sectionTitle={section?.title}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};