'use client';

import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { 
  Type, 
  Users, 
  FileText, 
  MessageSquare, 
  AlignLeft, 
  Bold, 
  Italic,
  Underline,
  Save,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Download
} from 'lucide-react';
import { ScreenplayElement, ScreenplayData } from '@/types';

export interface ScreenplayEditorHandle {
  exportPDF: () => void;
  togglePreview: () => void;
  save: () => void;
}

interface ScreenplayEditorProps {
  screenplayData: ScreenplayData;
  onSave: (data: ScreenplayData) => void;
  episodeId: string;
}

const ScreenplayEditor = forwardRef<ScreenplayEditorHandle, ScreenplayEditorProps>(({ 
  screenplayData,
  onSave,
  episodeId
}, ref) => {
  const [localData, setLocalData] = useState<ScreenplayData>(screenplayData);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});


  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingElementId) {
      // Small delay to ensure the input is rendered
      setTimeout(() => {
        const input = inputRefs.current[editingElementId];
        if (input) {
          // Auto-resize the textarea
          input.style.height = 'auto';
          input.style.height = input.scrollHeight + 'px';
          input.focus();
          input.select(); // Select all text for easy replacement
        }
      }, 10);
    }
  }, [editingElementId]);

  // Industry standard formatting for A4 page
  // US Standard screenplay format: 8.5" x 11" with specific margins
  const pageStyles = {
    width: '8.5in',
    minHeight: '11in',
    margin: '0 auto',
    padding: '1in 1in', // 1 inch top/bottom, 1 inch left/right
    backgroundColor: 'white',
    boxShadow: '0 0 10px rgba(0,0,0,0.1)',
    fontFamily: 'Courier New, monospace',
    fontSize: '12pt',
    lineHeight: '1.2',
    position: 'relative' as const,
    direction: 'ltr' as const,
    textAlign: 'left' as const,
    unicodeBidi: 'embed' as const
  };

  // Industry standard screenplay margins (from left edge of paper, accounting for 1" padding)
  // Scene Heading: 1.5" left margin, extends to 7.0" (width: ~5.5")
  // Action: 1.5" left margin, extends to 7.0" (width: ~5.5")
  // Character: 4.1" left margin, centered (width: ~1.5")
  // Dialogue: 2.5" left margin, extends to 6.5" (width: ~4.0")
  // Parenthetical: 3.1" left margin, extends to 5.35" (width: ~2.25")
  const elementStyles = {
    'scene-setting': {
      textTransform: 'uppercase' as const,
      fontWeight: 'bold' as const,
      marginBottom: '0.5em',
      marginTop: '1em',
      textAlign: 'left' as const,
      marginLeft: '0.5in', // 1.5" from paper edge (1" padding + 0.5" = 1.5")
      marginRight: '1.0in', // Total right margin 2" (1" padding + 1" = 2")
      paddingLeft: '0',
      paddingRight: '0',
      width: '5.5in',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    },
    'character': {
      textTransform: 'uppercase' as const,
      fontWeight: 'bold' as const,
      marginBottom: '0.25em',
      marginTop: '0.5em',
      textAlign: 'center' as const,
      marginLeft: '3.1in', // 4.1" from paper edge (1" padding + 3.1" = 4.1")
      marginRight: '3.1in', // Symmetrical for centering
      paddingLeft: '0',
      paddingRight: '0',
      width: '1.3in',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    },
    'action': {
      textTransform: 'none' as const,
      fontWeight: 'normal' as const,
      marginBottom: '0.5em',
      marginTop: '0.5em',
      textAlign: 'left' as const,
      marginLeft: '0.5in', // 1.5" from paper edge (same as scene heading)
      marginRight: '1.0in',
      paddingLeft: '0',
      paddingRight: '0',
      width: '5.5in',
      lineHeight: '1.2',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    },
    'parenthetical': {
      textTransform: 'none' as const,
      fontWeight: 'normal' as const,
      marginBottom: '0.25em',
      marginTop: '0.25em',
      textAlign: 'left' as const,
      marginLeft: '2.1in', // 3.1" from paper edge (1" padding + 2.1" = 3.1")
      marginRight: '2.35in', // 5.35" from paper edge
      paddingLeft: '0',
      paddingRight: '0',
      width: '2.05in',
      fontStyle: 'italic' as const,
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    },
    'dialogue': {
      textTransform: 'none' as const,
      fontWeight: 'normal' as const,
      marginBottom: '0.5em',
      marginTop: '0.25em',
      textAlign: 'left' as const,
      marginLeft: '1.5in', // 2.5" from paper edge (1" padding + 1.5" = 2.5")
      marginRight: '1.5in', // 6.5" from paper edge (1" padding + 1.5" = 2.5" right)
      paddingLeft: '0',
      paddingRight: '0',
      width: '3.5in',
      lineHeight: '1.2',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    },
    'general': {
      textTransform: 'none' as const,
      fontWeight: 'normal' as const,
      marginBottom: '0.5em',
      marginTop: '0.5em',
      textAlign: 'left' as const,
      marginLeft: '0.5in',
      marginRight: '1.0in',
      paddingLeft: '0',
      paddingRight: '0',
      width: '5.5in',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    }
  };

  const elementIcons = {
    'scene-setting': Type,
    'character': Users,
    'action': FileText,
    'parenthetical': MessageSquare,
    'dialogue': AlignLeft,
    'general': FileText
  };

  const elementLabels = {
    'scene-setting': 'Scene Setting',
    'character': 'Character',
    'action': 'Action',
    'parenthetical': 'Parenthetical',
    'dialogue': 'Dialogue',
    'general': 'General'
  };

  // Element type colors for highlighting
  const elementColors = {
    'scene-setting': {
      bg: 'bg-red-100',
      border: 'border-red-400',
      text: 'text-red-900'
    },
    'character': {
      bg: 'bg-blue-100',
      border: 'border-blue-400',
      text: 'text-blue-900'
    },
    'action': {
      bg: 'bg-green-100',
      border: 'border-green-400',
      text: 'text-green-900'
    },
    'parenthetical': {
      bg: 'bg-orange-100',
      border: 'border-orange-400',
      text: 'text-orange-900'
    },
    'dialogue': {
      bg: 'bg-purple-100',
      border: 'border-purple-400',
      text: 'text-purple-900'
    },
    'general': {
      bg: 'bg-gray-100',
      border: 'border-gray-400',
      text: 'text-gray-900'
    }
  };

  const addElement = (type: ScreenplayElement['type'], afterId?: string) => {
    const newElement: ScreenplayElement = {
      id: `element-${Date.now()}`,
      type,
      content: '',
      position: afterId ? 
        localData.elements.findIndex(e => e.id === afterId) + 1 : 
        localData.elements.length
    };

    const newElements = [...localData.elements];
    if (afterId) {
      newElements.splice(newElement.position, 0, newElement);
    } else {
      newElements.push(newElement);
    }

    // Reorder positions
    const reorderedElements = newElements.map((element, index) => ({
      ...element,
      position: index
    }));

    setLocalData(prev => ({
      ...prev,
      elements: reorderedElements
    }));

    setEditingElementId(newElement.id);
  };

  const updateElement = (id: string, content: string) => {
    setLocalData(prev => ({
      ...prev,
      elements: prev.elements.map(el => 
        el.id === id ? { ...el, content } : el
      )
    }));
  };

  const deleteElement = (id: string) => {
    setLocalData(prev => ({
      ...prev,
      elements: prev.elements.filter(el => el.id !== id)
    }));
    setEditingElementId(null);
    setSelectedElementId(null);
  };

  const changeElementType = (id: string, newType: ScreenplayElement['type']) => {
    setLocalData(prev => ({
      ...prev,
      elements: prev.elements.map(el => 
        el.id === id ? { ...el, type: newType } : el
      )
    }));
    // Keep the element selected and in editing mode
    setSelectedElementId(id);
    setEditingElementId(id);
  };

  const handleElementClick = (id: string, event: React.MouseEvent) => {
    event.preventDefault();
    setSelectedElementId(id);
    setEditingElementId(id);
  };

  const handleElementBlur = () => {
    setEditingElementId(null);
    setSelectedElementId(null);
    setShowToolbar(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent, elementId: string) => {
    const element = localData.elements.find(el => el.id === elementId);
    const elementType = element?.type;
    
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const target = event.currentTarget as HTMLInputElement;
      const cursorPosition = target.selectionStart || 0;
      const textLength = target.value.length;
      
      // If at end of dialogue, create new character element
      // If at end of character, create new dialogue
      // Otherwise, create new action element
      if ((elementType === 'dialogue' || elementType === 'parenthetical') && cursorPosition === textLength) {
        addElement('character', elementId);
      } else if (elementType === 'character' && cursorPosition === textLength) {
        addElement('dialogue', elementId);
      } else {
        addElement('action', elementId);
      }
    } else if (event.key === 'Backspace') {
      const target = event.currentTarget as HTMLInputElement;
      if (target.value === '') {
        event.preventDefault();
        deleteElement(elementId);
      }
    } else if (event.key === 'Escape') {
      setEditingElementId(null);
      setShowToolbar(false);
      setSelectedElementId(null);
    }
  };

  const handleSave = () => {
    onSave(localData);
  };

  const handleExportPDF = () => {
    // Create a new window for PDF generation
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Calculate page breaks for PDF
    const calculatePageBreaks = (elements: ScreenplayElement[]) => {
      const linesPerPage = 55; // Industry standard for 12pt Courier font
      const pageBreaks: number[] = [];
      let currentLines = 0;

      elements.forEach((element, index) => {
        let elementLines = 1;
        
        if (element.content) {
          const maxCharsPerLine = element.type === 'dialogue' ? 35 : 60;
          const contentLines = Math.ceil(element.content.length / maxCharsPerLine);
          elementLines = Math.max(1, contentLines);
        }

        const spacing = element.type === 'scene-setting' ? 2 : 
                       element.type === 'character' ? 1 : 
                       element.type === 'parenthetical' ? 0.5 : 1;

        const totalElementLines = elementLines + spacing;

        if (currentLines + totalElementLines > linesPerPage && index > 0) {
          pageBreaks.push(index);
          currentLines = totalElementLines;
        } else {
          currentLines += totalElementLines;
        }
      });

      return pageBreaks;
    };

    const pageBreaks = calculatePageBreaks(localData.elements);
    let currentPage = 1;

    // Generate HTML content for PDF
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${localData.title || 'Untitled Screenplay'}</title>
        <style>
          @page {
            size: 8.5in 11in;
            margin: 1in;
          }
          
          body {
            font-family: 'Courier New', monospace;
            font-size: 12pt;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            color: #000;
            width: 8.5in;
          }
          
          .page {
            width: 8.5in;
            min-height: 11in;
            margin: 0;
            padding: 1in;
            page-break-after: always;
            position: relative;
            box-sizing: border-box;
          }
          
          .page:last-child {
            page-break-after: avoid;
          }
          
          .page-number {
            position: absolute;
            top: 0.5in;
            right: 0.5in;
            font-size: 10pt;
            color: #666;
          }
          
          .title {
            text-align: center;
            font-size: 24pt;
            font-weight: bold;
            margin-bottom: 2in;
            text-transform: uppercase;
          }
          
          .scene-setting {
            text-transform: uppercase;
            font-weight: bold;
            margin: 1em 0 0.5em 0;
            margin-left: 0.5in;
            margin-right: 1.0in;
            width: 5.5in;
          }
          
          .character {
            text-transform: uppercase;
            font-weight: bold;
            margin: 0.5em 0 0.25em 0;
            text-align: center;
            margin-left: 3.1in;
            margin-right: 3.1in;
            width: 1.3in;
          }
          
          .action {
            margin: 0.5em 0;
            margin-left: 0.5in;
            margin-right: 1.0in;
            width: 5.5in;
          }
          
          .parenthetical {
            margin: 0.25em 0;
            margin-left: 2.1in;
            margin-right: 2.35in;
            width: 2.05in;
            font-style: italic;
          }
          
          .dialogue {
            margin: 0.25em 0 0.5em 0;
            margin-left: 1.5in;
            margin-right: 1.5in;
            width: 3.5in;
            text-align: left;
          }
          
          .general {
            margin: 0.5em 0;
            margin-left: 0.5in;
            margin-right: 1.0in;
            width: 5.5in;
          }
        </style>
      </head>
      <body>
    `;

    // Add title page
    htmlContent += `
      <div class="page">
        <div class="page-number">${currentPage}</div>
        <div class="title">${localData.title || 'Untitled Screenplay'}</div>
      </div>
    `;
    currentPage++;

    // Add screenplay elements with page breaks
    localData.elements.forEach((element, index) => {
      if (pageBreaks.includes(index)) {
        htmlContent += `</div><div class="page"><div class="page-number">${currentPage}</div>`;
        currentPage++;
      }

      const elementClass = element.type.replace('-', '-');
      htmlContent += `<div class="${elementClass}">${element.content || '&nbsp;'}</div>`;
    });

    htmlContent += `
      </body>
      </html>
    `;

    // Write content to new window
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Trigger print dialog
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // expose handlers
  useImperativeHandle(ref, () => ({
    exportPDF: handleExportPDF,
    togglePreview: () => setIsPreviewMode(prev => !prev),
    save: handleSave
  }));

  const renderElement = (element: ScreenplayElement, index: number) => {
    const isSelected = selectedElementId === element.id;
    const isEditing = editingElementId === element.id;
    const styles = elementStyles[element.type];

    return (
      <div key={element.id}>
        
        <div
          className={`relative group mb-2 ${isEditing ? 'ring-2 ring-blue-500 rounded-lg' : ''} ${
            isPreviewMode ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50'
          }`}
          onClick={(e) => !isPreviewMode && handleElementClick(element.id, e)}
        >
        {/* Element Type Label - Much Clearer */}
        {!isPreviewMode && isEditing && (
          <div className="absolute -left-32 top-0 opacity-100 transition-opacity">
            <div className={`px-3 py-1 rounded-lg text-sm font-medium text-white ${elementColors[element.type].bg.replace('100', '600')}`}>
              {elementLabels[element.type]}
            </div>
          </div>
        )}

        {/* Element Content - Fixed text direction and contrast */}
        {isEditing && !isPreviewMode ? (
          <textarea
            ref={(el) => {
              inputRefs.current[element.id] = el;
              if (el) {
                // Auto-resize when textarea is first rendered
                setTimeout(() => {
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }, 0);
              }
            }}
            value={element.content}
            onChange={(e) => updateElement(element.id, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, element.id)}
            onBlur={handleElementBlur}
            className={`w-full outline-none min-h-[1.5em] rounded px-2 py-1 border-2 resize-none ${elementColors[element.type].bg} ${elementColors[element.type].border} ${elementColors[element.type].text}`}
            style={{
              ...styles,
              direction: 'ltr',
              unicodeBidi: 'embed',
              textAlign: styles.textAlign || 'left',
              fontFamily: 'Courier New, monospace',
              fontSize: '12pt',
              textTransform: styles.textTransform || 'none',
              minHeight: '1.5em',
              height: 'auto'
            }}
            dir="ltr"
            rows={1}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = target.scrollHeight + 'px';
            }}
          />
        ) : (
          <div
            className={`outline-none min-h-[1.5em] text-black ${isPreviewMode ? 'cursor-default' : 'cursor-pointer'}`}
            style={{
              ...styles,
              direction: 'ltr',
              unicodeBidi: 'embed',
              textAlign: styles.textAlign || 'left',
              fontFamily: 'Courier New, monospace',
              fontSize: '12pt',
              color: '#000000',
              textTransform: styles.textTransform || 'none'
            }}
            dir="ltr"
          >
            {element.content || '\u00A0'}
          </div>
        )}

        {/* Action Buttons - Much Better Design */}
        {!isPreviewMode && isEditing && (
          <div className="absolute -right-32 top-0 flex flex-col space-y-2">
            <div className="bg-white border-2 border-gray-300 rounded-lg p-2 shadow-lg">
              <div className="text-xs font-semibold text-gray-700 mb-2">Change Type:</div>
              <div className="flex flex-col space-y-1">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    changeElementType(element.id, 'scene-setting');
                  }}
                  className={`px-3 py-1 text-white rounded text-xs hover:opacity-80 ${
                    element.type === 'scene-setting' ? 'bg-red-800' : 'bg-red-600'
                  }`}
                >
                  Scene Setting
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    changeElementType(element.id, 'character');
                  }}
                  className={`px-3 py-1 text-white rounded text-xs hover:opacity-80 ${
                    element.type === 'character' ? 'bg-blue-800' : 'bg-blue-600'
                  }`}
                >
                  Character
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    changeElementType(element.id, 'action');
                  }}
                  className={`px-3 py-1 text-white rounded text-xs hover:opacity-80 ${
                    element.type === 'action' ? 'bg-green-800' : 'bg-green-600'
                  }`}
                >
                  Action
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    changeElementType(element.id, 'dialogue');
                  }}
                  className={`px-3 py-1 text-white rounded text-xs hover:opacity-80 ${
                    element.type === 'dialogue' ? 'bg-purple-800' : 'bg-purple-600'
                  }`}
                >
                  Dialogue
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    changeElementType(element.id, 'parenthetical');
                  }}
                  className={`px-3 py-1 text-white rounded text-xs hover:opacity-80 ${
                    element.type === 'parenthetical' ? 'bg-orange-800' : 'bg-orange-600'
                  }`}
                >
                  Parenthetical
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteElement(element.id);
                  }}
                  className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  };

  return (
    <>
      <style jsx global>{`
        .screenplay-editor * {
          direction: ltr !important;
          unicode-bidi: embed !important;
        }
        .screenplay-editor input, .screenplay-editor textarea {
          direction: ltr !important;
          unicode-bidi: embed !important;
        }
        .page-break {
          page-break-before: always;
          break-before: page;
        }
        @media print {
          .page-break {
            page-break-before: always;
          }
        }
      `}</style>
      <div className="h-full flex flex-col bg-white screenplay-editor" style={{ direction: 'ltr', unicodeBidi: 'embed' }} dir="ltr">
        {/* Editor with left sidebar */}
        <div className="flex-1 overflow-auto bg-gray-100 p-6 flex">
          {!isPreviewMode && (
            <div className="w-16 mr-6 sticky top-4 self-start">
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => addElement('scene-setting')}
                  className="w-12 h-12 rounded-md bg-red-600 hover:bg-red-700 shadow text-white flex items-center justify-center"
                  title="Scene Setting"
                  aria-label="Add scene setting"
                >
                  <Type className="w-5 h-5" />
                </button>
                <button
                  onClick={() => addElement('character')}
                  className="w-12 h-12 rounded-md bg-blue-600 hover:bg-blue-700 shadow text-white flex items-center justify-center"
                  title="Character"
                  aria-label="Add character"
                >
                  <Users className="w-5 h-5" />
                </button>
                <button
                  onClick={() => addElement('action')}
                  className="w-12 h-12 rounded-md bg-green-600 hover:bg-green-700 shadow text-white flex items-center justify-center"
                  title="Action"
                  aria-label="Add action"
                >
                  <FileText className="w-5 h-5" />
                </button>
                <button
                  onClick={() => addElement('dialogue')}
                  className="w-12 h-12 rounded-md bg-purple-600 hover:bg-purple-700 shadow text-white flex items-center justify-center"
                  title="Dialogue"
                  aria-label="Add dialogue"
                >
                  <AlignLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => addElement('parenthetical')}
                  className="w-12 h-12 rounded-md bg-orange-600 hover:bg-orange-700 shadow text-white flex items-center justify-center"
                  title="Parenthetical"
                  aria-label="Add parenthetical"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
                <button
                  onClick={() => addElement('general')}
                  className="w-12 h-12 rounded-md bg-gray-600 hover:bg-gray-700 shadow text-white flex items-center justify-center"
                  title="General"
                  aria-label="Add general"
                >
                  <FileText className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1">
            <div className="max-w-4xl mx-auto">
          <div
            ref={editorRef}
            style={pageStyles}
            className="bg-white shadow-2xl"
          >

            {/* Title */}
            <div className="text-center mb-12">
              {!isPreviewMode ? (
                <input
                  type="text"
                  value={localData.title}
                  onChange={(e) => setLocalData(prev => ({ ...prev, title: e.target.value }))}
                  className="text-3xl font-bold text-black text-center bg-transparent border-none outline-none w-full"
                  placeholder="Untitled Screenplay"
                  style={{ direction: 'ltr', color: '#000000' }}
                  dir="ltr"
                />
              ) : (
                <div className="text-3xl font-bold text-black" style={{ direction: 'ltr', color: '#000000' }} dir="ltr">
                  {localData.title || 'Untitled Screenplay'}
                </div>
              )}
            </div>

            {/* Elements */}
            <div className="space-y-3">
              {localData.elements.map((element, index) => renderElement(element, index))}
            </div>

            {/* Add First Element Button */}
            {localData.elements.length === 0 && !isPreviewMode && (
              <div className="text-center py-16">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-700 mb-2">Ready to Write?</h3>
                  <p className="text-gray-600">Start your screenplay by adding your first element</p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => addElement('scene-setting')}
                    className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 shadow-lg"
                  >
                    Start with Scene Setting
                  </button>
                  <button
                    onClick={() => addElement('action')}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-lg"
                  >
                    Start with Action
                  </button>
                </div>
              </div>
            )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

// Provide a display name to satisfy react/display-name lint rule
ScreenplayEditor.displayName = 'ScreenplayEditor';

export default ScreenplayEditor;