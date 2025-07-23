import React from 'react';
import { Check, X } from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

interface MDXEditorProps {
  content: string;
  title: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}

export const MDXEditor: React.FC<MDXEditorProps> = ({
  content,
  title,
  onSave,
  onCancel
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const editorViewRef = React.useRef<EditorView | null>(null);
  const contentRef = React.useRef(content);
  const successTimeoutRef = React.useRef<number>();

  React.useEffect(() => {
    if (editorRef.current && !editorViewRef.current) {
      const view = new EditorView({
        doc: content,
        extensions: [
          basicSetup,
          markdown(),
          oneDark,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              contentRef.current = update.state.doc.toString();
              // Hide success message when content changes
              setShowSuccess(false);
            }
          }),
        ],
        parent: editorRef.current
      });
      editorViewRef.current = view;
    }

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, [content]);

  const handleSave = async () => {
    if (contentRef.current.trim() === '') {
      alert('Content cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(contentRef.current);
      setShowSuccess(true);
      // Hide success message after 3 seconds
      successTimeoutRef.current = window.setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving content:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    contentRef.current = content;
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: content
        }
      });
    }
    onCancel();
  };

  return (
    <div className="border rounded-lg shadow-sm bg-white">
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            {showSuccess && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="w-4 h-4" />
                Changes saved successfully
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-1 px-3 py-1.5 text-white ${
                isSaving 
                  ? 'bg-green-400 cursor-not-allowed' 
                  : 'bg-green-500 hover:bg-green-600'
              } rounded-lg disabled:opacity-50`}
              disabled={isSaving}
            >
              <Check className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        <div ref={editorRef} className="h-96 border rounded-lg overflow-hidden" />
      </div>
    </div>
  );
};