import React from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { StateEffect, StateField } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { Decoration, DecorationSet } from '@codemirror/view';
import { useStore } from '../store';

interface ResponseObjectHighlighterProps {
  content: string;
  highlights: { start: number; end: number; color: string }[];
  onHighlight: (highlights: { start: number; end: number; color: string }[]) => void;
  responseId: string;
  modelId: string;
  sectionId?: string;
  sectionTitle?: string;
}

// Custom state effect for adding highlights
const addHighlightEffect = StateEffect.define<{ from: number; to: number; class: string }>();

// Create decoration mark for highlights
const highlightMark = (className: string) => Decoration.mark({ class: className });

export const ResponseObjectHighlighter: React.FC<ResponseObjectHighlighterProps> = ({
  content,
  highlights,
  onHighlight,
  responseId,
  modelId,
  sectionId,
  sectionTitle
}) => {
  const { user, addHighlight, selectedRecord } = useStore();
  const editorRef = React.useRef<HTMLDivElement>(null);
  const editorViewRef = React.useRef<EditorView | null>(null);
  const [selection, setSelection] = React.useState<{ start: number; end: number } | null>(null);
  const [selectedColor, setSelectedColor] = React.useState('#FFEB3B');

  const colors = [
    '#FFEB3B', // Yellow
    '#81C784', // Green
    '#64B5F6', // Blue
    '#E57373', // Red
    '#BA68C8'  // Purple
  ];

  React.useEffect(() => {
    if (editorRef.current && !editorViewRef.current) {
      // Create a state field for managing highlights
      const highlightField = StateField.define<DecorationSet>({
        create() {
          return Decoration.none;
        },
        update(highlights, tr) {
          highlights = highlights.map(tr.changes);
          for (let e of tr.effects) {
            if (e.is(addHighlightEffect)) {
              highlights = highlights.update({
                add: [highlightMark(e.value.class).range(e.value.from, e.value.to)]
              });
            }
          }
          return highlights;
        },
        provide: f => EditorView.decorations.from(f)
      });

      const state = EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          markdown(),
          oneDark,
          highlightField,
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': {
              fontSize: '14px',
              height: '100%'
            },
            '.cm-content': {
              fontFamily: 'inherit',
              padding: '8px',
              maxWidth: '100%'
            },
            '.cm-line': {
              padding: '0 8px',
              wordWrap: 'break-word',
              whiteSpace: 'pre-wrap'
            },
            '.highlight-yellow': {
              backgroundColor: '#FFEB3B50'
            },
            '.highlight-green': {
              backgroundColor: '#81C78450'
            },
            '.highlight-blue': {
              backgroundColor: '#64B5F650'
            },
            '.highlight-red': {
              backgroundColor: '#E5737350'
            },
            '.highlight-purple': {
              backgroundColor: '#BA68C850'
            }
          })
        ]
      });

      const view = new EditorView({
        state,
        parent: editorRef.current,
        dispatch: tr => {
          view.update([tr]);
          if (tr.selection) {
            const ranges = tr.state.selection.ranges;
            if (ranges.length > 0 && !ranges[0].empty) {
              setSelection({
                start: ranges[0].from,
                end: ranges[0].to
              });
            } else {
              setSelection(null);
            }
          }
        }
      });

      editorViewRef.current = view;

      // Apply existing highlights
      highlights.forEach(highlight => {
        const colorClass = `highlight-${getColorName(highlight.color)}`;
        view.dispatch({
          effects: addHighlightEffect.of({
            from: highlight.start,
            to: highlight.end,
            class: colorClass
          })
        });
      });
    }

    return () => {
      if (editorViewRef.current) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, [content, highlights]);

  const getColorName = (color: string) => {
    const colorMap: Record<string, string> = {
      '#FFEB3B': 'yellow',
      '#81C784': 'green',
      '#64B5F6': 'blue',
      '#E57373': 'red',
      '#BA68C8': 'purple'
    };
    return colorMap[color] || 'yellow';
  };

  const handleHighlight = async () => {
    if (!selection || !editorViewRef.current || !user || !selectedRecord) {
      if (!selectedRecord) {
        alert('Please select a record before highlighting');
        return;
      }
      return;
    }

    const newHighlight = {
      start: selection.start,
      end: selection.end,
      color: selectedColor
    };

    const newHighlights = [...highlights, newHighlight];
    onHighlight(newHighlights);

    try {
      const highlightData = {
        id: crypto.randomUUID(),
        response_id: responseId,
        content: content,
        highlights: newHighlights,
        section_id: sectionId,
        section_title: sectionTitle,
        model_id: modelId,
        created_at: new Date().toISOString(),
        record_id: selectedRecord.id,
        record_name: selectedRecord.name
      };

      await addHighlight(highlightData);

      const colorClass = `highlight-${getColorName(selectedColor)}`;
      editorViewRef.current.dispatch({
        effects: addHighlightEffect.of({
          from: selection.start,
          to: selection.end,
          class: colorClass
        })
      });
    } catch (error) {
      console.error('Error saving highlight:', error);
      alert('Failed to save highlight. Please try again.');
    }

    setSelection(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {colors.map(color => (
            <button
              key={color}
              onClick={() => setSelectedColor(color)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${
                selectedColor === color ? 'scale-110 border-gray-600' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
              title={`Select ${getColorName(color)} highlighter`}
            />
          ))}
        </div>
        {selection && (
          <button
            onClick={handleHighlight}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Highlight Selection
          </button>
        )}
      </div>
      <div ref={editorRef} className="border rounded-lg overflow-hidden" style={{ height: '300px' }} />
    </div>
  );
};