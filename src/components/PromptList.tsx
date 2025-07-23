import React from 'react';
import { Plus, FileText, X, Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { PromptTemplate } from '../types';
import { MDXEditor } from './MDXEditor';

export const PromptList: React.FC = () => {
  const { promptTemplates, selectedTemplate, setSelectedTemplate, addPromptTemplate, updatePromptTemplate, deletePromptTemplate } = useStore();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);
  const [templateToDelete, setTemplateToDelete] = React.useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = React.useState<PromptTemplate | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');

  const handleOpenModal = (template?: PromptTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setTitle(template.title);
      setDescription(template.description);
    } else {
      setEditingTemplate(null);
      setTitle('');
      setDescription('');
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    setTitle('');
    setDescription('');
  };

  const handleSaveTemplate = async (mdxContent: string) => {
    if (!title.trim() || !description.trim() || !mdxContent.trim()) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const templateData: PromptTemplate = {
        id: editingTemplate?.id || crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        mdxContent: mdxContent.trim(),
        sections: [
          {
            id: editingTemplate?.sections[0]?.id || crypto.randomUUID(),
            title: 'Main Content',
            content: mdxContent.trim(),
          }
        ]
      };

      if (editingTemplate) {
        await updatePromptTemplate(templateData);
      } else {
        await addPromptTemplate(templateData);
      }

      handleCloseModal();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template. Please try again.');
    }
  };

  const handleDeleteClick = (templateId: string) => {
    setTemplateToDelete(templateId);
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!templateToDelete) return;

    try {
      await deletePromptTemplate(templateToDelete);
      setIsConfirmDeleteOpen(false);
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error deleting template. Please try again.');
    }
  };

  return (
    <div className="w-72 border-r border-gray-200 h-screen overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Prompt Templates</h2>
        <button
          className="p-2 hover:bg-gray-100 rounded-full"
          onClick={() => handleOpenModal()}
        >
          <Plus className="h-5 w-5 text-gray-600" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {promptTemplates.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>No prompt templates yet</p>
            <p className="text-sm">Create one to get started</p>
          </div>
        ) : (
          promptTemplates.map((template) => (
            <div
              key={template.id}
              className={`p-4 hover:bg-gray-50 ${
                selectedTemplate?.id === template.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div 
                  className="flex-1 cursor-pointer"
                  onClick={() => setSelectedTemplate(template)}
                >
                  <h3 className="font-medium text-gray-900">{template.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {template.description}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleOpenModal(template)}
                    className="p-1 hover:bg-blue-100 rounded text-blue-600"
                    title="Edit template"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(template.id)}
                    className="p-1 hover:bg-red-100 rounded text-red-600"
                    title="Delete template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[800px] max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-medium">
                {editingTemplate ? 'Edit Prompt Template' : 'Create New Prompt Template'}
              </h4>
              <button
                className="p-2 hover:bg-gray-100 rounded-full"
                onClick={handleCloseModal}
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter template title"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter template description"
                />
              </div>

              <MDXEditor
                content={editingTemplate?.mdxContent || ''}
                title="Markdown Content"
                onSave={handleSaveTemplate}
                onCancel={handleCloseModal}
              />
            </div>
          </div>
        </div>
      )}

      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h4 className="text-lg font-medium mb-4">Delete Template</h4>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this template? This action cannot be undone.
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
    </div>
  );
};