import React from 'react';
import type { PromptSection as PromptSectionType } from '../types';
import { PromptSectionPreview } from './PromptSectionPreview';
import { PromptSectionEdit } from './PromptSectionEdit';
import { useStore } from '../store';

interface PromptSectionProps {
  section: PromptSectionType;
  templateId: string;
}

export const PromptSection: React.FC<PromptSectionProps> = ({ section, templateId }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const selectedTemplate = useStore(state => state.selectedTemplate);

  // Get the current section from the selected template
  const currentSection = selectedTemplate?.sections.find(s => s.id === section.id);

  // If we have a current section from the template, use it, otherwise fall back to the prop
  const sectionToRender = currentSection || section;

  return (
    <div id={`section-${section.id}`}>
      {isEditing ? (
        <PromptSectionEdit
          section={sectionToRender}
          templateId={templateId}
          onCancel={() => setIsEditing(false)}
          onSave={() => setIsEditing(false)}
        />
      ) : (
        <PromptSectionPreview
          section={sectionToRender}
          templateId={templateId}
          onEdit={() => setIsEditing(true)}
        />
      )}
    </div>
  );
};