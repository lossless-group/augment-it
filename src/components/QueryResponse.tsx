import React from 'react';
import { Edit } from 'lucide-react';
import type { QueryResponse as QueryResponseType } from '../types';
import { RequestEditor } from './RequestEditor';
import { ResponseObjectContextWrapper } from './ResponseObjectContextWrapper';
import { useStore } from '../store';

interface QueryResponseProps {
  response: QueryResponseType;
}

export const QueryResponse: React.FC<QueryResponseProps> = ({ response }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const { updateRequestTemplate, selectedTemplate } = useStore();

  const section = selectedTemplate?.sections.find(
    s => s.id === response.promptSectionId
  );

  const handleSaveTemplate = async (content: string, isJavaScript: boolean) => {
    await updateRequestTemplate(response.modelId, content, isJavaScript);
    setIsEditing(false);
  };

  return (
    <>
      <div className="space-y-2">
        {response.status === 'error' && (
          <div className="flex justify-end">
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 hover:bg-blue-100 rounded text-blue-600"
              title="Edit request template"
            >
              <Edit className="h-4 w-4" />
            </button>
          </div>
        )}

        <ResponseObjectContextWrapper
          response={response}
          section={section}
        />
      </div>

      {isEditing && (
        <RequestEditor
          content={response.requestTemplate || '{}'}
          modelId={response.modelId}
          initialIsJavaScript={response.isJavaScript || false}
          onSave={handleSaveTemplate}
          onClose={() => setIsEditing(false)}
        />
      )}
    </>
  );
};