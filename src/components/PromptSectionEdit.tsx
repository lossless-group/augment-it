import React from 'react';
import { useStore } from '../store';
import type { PromptSection as PromptSectionType } from '../types';
import { MDXEditor } from './MDXEditor';

interface PromptSectionEditProps {
  section: PromptSectionType;
  templateId: string;
  onCancel: () => void;
  onSave: () => void;
}

export const PromptSectionEdit: React.FC<PromptSectionEditProps> = ({
  section,
  templateId,
  onCancel,
  onSave
}) => {
  const { selectedTemplate, updatePromptTemplate } = useStore();

  const handleSave = async (content: string) => {
    if (!selectedTemplate) {
      throw new Error('No template selected');
    }

    try {
      // Create the updated template with the new content
      const updatedTemplate = {
        ...selectedTemplate,
        // Update mdxContent if this is the main section
        mdxContent: content,
        // Update the specific section's content
        sections: selectedTemplate.sections.map(s => 
          s.id === section.id 
            ? { ...s, content }
            : s
        )
      };

      // Persist the changes
      await updatePromptTemplate(updatedTemplate);
      onSave();
    } catch (error) {
      console.error('Error saving section:', error);
      throw error;
    }
  };

  return (
    <MDXEditor
      content={section.content}
      title={section.title}
      onSave={handleSave}
      onCancel={onCancel}
    />
  );
};