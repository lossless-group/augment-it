import React from 'react';
import { Check, X } from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, lintGutter } from '@codemirror/lint';
import { jsonParseLinter } from '@codemirror/lang-json';

interface RequestEditorProps {
  content: string;
  modelId: string;
  initialIsJavaScript: boolean;
  onSave: (content: string, isJavaScript: boolean) => Promise<void>;
  onClose: () => void;
}

export const RequestEditor: React.FC<RequestEditorProps> = ({
  content,
  modelId,
  initialIsJavaScript,
  onSave,
  onClose
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isJavaScript, setIsJavaScript] = React.useState(initialIsJavaScript);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const editorViewRef = React.useRef<EditorView | null>(null);
  const contentRef = React.useRef(content);

  const createEditor = React.useCallback((initialContent: string) => {
    if (!editorRef.current) return;

    // Destroy existing editor if it exists
    if (editorViewRef.current) {
      editorViewRef.current.destroy();
      editorViewRef.current = null;
    }

    let formattedContent = initialContent;
    if (!isJavaScript) {
      try {
        // Only try to format if it's JSON
        formattedContent = JSON.stringify(JSON.parse(initialContent), null, 2);
      } catch {
        // If parsing fails, use the content as is
        formattedContent = initialContent;
      }
    }

    const view = new EditorView({
      doc: formattedContent,
      extensions: [
        basicSetup,
        isJavaScript ? javascript() : json(),
        oneDark,
        lintGutter(),
        isJavaScript ? [] : linter(jsonParseLinter()),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            contentRef.current = update.state.doc.toString();
          }
        }),
      ],
      parent: editorRef.current
    });
    editorViewRef.current = view;
  }, [isJavaScript]);

  // Initial editor setup
  React.useEffect(() => {
    createEditor(content);
    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, [content, createEditor]);

  const validateJavaScript = (code: string) => {
    try {
      // Test if the code is valid JavaScript that returns an object
      const fn = new Function('prompt', code);
      const result = fn('test');
      if (typeof result !== 'object' || result === null) {
        throw new Error('JavaScript code must return an object');
      }
      return true;
    } catch (error) {
      console.error('JavaScript validation error:', error);
      throw new Error('Invalid JavaScript: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const validateJSON = (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('JSON must be an object');
      }
      if (!jsonStr.includes('{{prompt}}')) {
        throw new Error('JSON must include {{prompt}} placeholder');
      }
      return true;
    } catch (error) {
      console.error('JSON validation error:', error);
      throw new Error('Invalid JSON: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleSave = async () => {
    try {
      if (isJavaScript) {
        validateJavaScript(contentRef.current);
      } else {
        validateJSON(contentRef.current);
      }
      
      setIsSaving(true);
      await onSave(contentRef.current, isJavaScript);
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Validation error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFormat = () => {
    const currentContent = contentRef.current;
    setIsJavaScript(!isJavaScript);
    // Editor will be recreated by the useEffect due to isJavaScript dependency
    setTimeout(() => createEditor(currentContent), 0);
  };

  const jsExample = `(prompt) => ({
  model: 'pplx-7b-chat',
  messages: [{ role: 'user', content: prompt }],
  response_format: { type: 'json_object' }
})`;

  const jsonExample = `{
  "model": "pplx-7b-chat",
  "messages": [
    { "role": "user", "content": "{{prompt}}" }
  ],
  "response_format": { "type": "json_object" }
}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[800px] max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Edit {modelId} API Request Template
            </h3>
            <div className="mt-2">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isJavaScript}
                  onChange={toggleFormat}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  Use JavaScript format
                </span>
              </label>
              <p className="mt-2 text-sm text-gray-500">
                {isJavaScript ? (
                  <>
                    JavaScript mode: Write a function that takes a 'prompt' parameter and returns the API request object.
                    <br />
                    Example:
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-xs">
                      {jsExample}
                    </pre>
                  </>
                ) : (
                  <>
                    JSON mode: Use &#123;&#123;prompt&#125;&#125; as a placeholder for the prompt text.
                    <br />
                    Example:
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-xs">
                      {jsonExample}
                    </pre>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
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