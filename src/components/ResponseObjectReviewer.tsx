import React from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { linter, lintGutter } from '@codemirror/lint';
import { jsonParseLinter } from '@codemirror/lang-json';
import { Loader2 } from 'lucide-react';

interface ResponseObjectReviewerProps {
  content: string;
  status?: 'connecting' | 'pending' | 'completed' | 'error';
}

export const ResponseObjectReviewer: React.FC<ResponseObjectReviewerProps> = ({ 
  content,
  status = 'completed'
}) => {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const editorViewRef = React.useRef<EditorView | null>(null);

  React.useEffect(() => {
    if (status === 'completed' && editorRef.current && !editorViewRef.current) {
      let formattedContent = content;
      let isJson = false;

      try {
        JSON.parse(content);
        isJson = true;
        formattedContent = JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        console.info('Content appears to be Markdown');
      }

      const view = new EditorView({
        doc: formattedContent,
        extensions: [
          basicSetup,
          isJson ? [
            json(),
            lintGutter(),
            linter(jsonParseLinter())
          ] : [
            markdown()
          ],
          oneDark,
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': {
              fontSize: '14px',
              height: '100%'
            },
            '.cm-content': {
              fontFamily: isJson ? 'monospace' : 'inherit',
              padding: '8px',
              maxWidth: '100%'
            },
            '.cm-line': {
              padding: '0 8px',
              wordWrap: 'break-word',
              whiteSpace: 'pre-wrap'
            },
            '.cm-gutters': {
              minHeight: '100%'
            },
            '.cm-content *': {
              wordBreak: 'break-word',
              overflowWrap: 'break-word'
            },
            '.cm-link': {
              color: '#3b82f6',
              textDecoration: 'underline'
            },
            '.cm-header.cm-header-2': {
              color: '#6b7280',
              borderBottom: '1px solid #e5e7eb',
              marginTop: '1.5em',
              paddingBottom: '0.5em',
              fontWeight: 'bold'
            },
            '.cm-url': {
              color: '#3b82f6',
              textDecoration: 'underline'
            },
            '.cm-formatting-list': {
              color: '#6b7280',
              fontWeight: 'bold'
            },
            'pre': {
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              maxWidth: '100%',
              overflowX: 'hidden'
            }
          })
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
    };
  }, [content, status]);

  if (status === 'connecting' || status === 'pending') {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center gap-4 bg-gray-50 rounded-lg border border-gray-200">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <div className="text-sm text-gray-600">
          {status === 'connecting' ? 'Connecting to AI model...' : 'Generating response...'}
        </div>
        <div className="w-64 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-blue-500 transition-all duration-300 ${
              status === 'connecting' ? 'w-1/3' : 'w-2/3'
            }`}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={editorRef} className="border rounded-lg overflow-hidden" style={{ height: '300px' }} />
  );
};