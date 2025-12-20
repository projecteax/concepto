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
  Download,
  Wand2,
  Check,
  Sparkles
} from 'lucide-react';
import { ScreenplayElement, ScreenplayData, ScreenplayComment } from '@/types';
import { useS3Upload } from '@/hooks/useS3Upload';
import { TranslationDialog } from './TranslationDialog';
import { EnhanceDialog } from './EnhanceDialog';

export interface ScreenplayEditorHandle {
  exportPDF: () => void;
  exportVO: () => void;
  exportStoryboard: () => void;
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
  const [activeCommentElementId, setActiveCommentElementId] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDeleteElementId, setConfirmDeleteElementId] = useState<string | null>(null);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<{ elementId: string; commentId: string } | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [dropdownDirection, setDropdownDirection] = useState<{ [key: string]: 'up' | 'down' }>({});
  // Load language from localStorage or default to PL
  const [language, setLanguage] = useState<'PL' | 'EN'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('screenplay-language');
      return (saved === 'PL' || saved === 'EN') ? saved : 'PL';
    }
    return 'PL';
  });
  const [showTranslationDialog, setShowTranslationDialog] = useState(false);
  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  const [enhanceElementId, setEnhanceElementId] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<{ [key: string]: string }>({});

  // Save language to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('screenplay-language', language);
    }
  }, [language]);

  // Sync localData when screenplayData prop changes
  useEffect(() => {
    if (screenplayData) {
      setLocalData(prev => {
        // Create a hash to detect actual changes - include content to catch content updates
        const newHash = JSON.stringify({
          title: screenplayData.title,
          elementsCount: screenplayData.elements?.length || 0,
          elementsENCount: screenplayData.elementsEN?.length || 0,
          firstElementId: screenplayData.elements?.[0]?.id,
          firstElementContent: screenplayData.elements?.[0]?.content?.substring(0, 50), // First 50 chars of content
          lastElementId: screenplayData.elements?.[screenplayData.elements.length - 1]?.id,
          lastElementContent: screenplayData.elements?.[screenplayData.elements.length - 1]?.content?.substring(0, 50),
        });
        
        const prevHash = JSON.stringify({
          title: prev.title,
          elementsCount: prev.elements?.length || 0,
          elementsENCount: prev.elementsEN?.length || 0,
          firstElementId: prev.elements?.[0]?.id,
          firstElementContent: prev.elements?.[0]?.content?.substring(0, 50),
          lastElementId: prev.elements?.[prev.elements.length - 1]?.id,
          lastElementContent: prev.elements?.[prev.elements.length - 1]?.content?.substring(0, 50),
        });
        
        // Only update if data actually changed
        if (newHash !== prevHash) {
          console.log('🔄 ScreenplayEditor: Updating localData from prop', {
            newElementsCount: screenplayData.elements?.length,
            firstElementId: screenplayData.elements?.[0]?.id,
            firstElementType: screenplayData.elements?.[0]?.type,
            firstElementContent: screenplayData.elements?.[0]?.content?.substring(0, 100),
            firstElementContentLength: screenplayData.elements?.[0]?.content?.length || 0,
            prevElementsCount: prev.elements?.length || 0,
          });
          console.log('🔄 ScreenplayEditor: Full first element:', screenplayData.elements?.[0]);
          return screenplayData;
        } else {
          console.log('⏭️ ScreenplayEditor: Hash unchanged, skipping update');
        }
        return prev;
      });
    }
  }, [screenplayData]);

  const isFirstRenderRef = useRef(true);
  const autosaveTimerRef = useRef<number | null>(null);
  const commentsPanelRef = useRef<HTMLDivElement | null>(null);
  // Upload hook (assumed available in client)
  const { uploadFile } = useS3Upload();
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
  const selectedElementIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedElementIdRef.current = selectedElementId;
  }, [selectedElementId]);


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
          
          // Determine dropdown direction based on position in viewport
          const rect = input.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const spaceBelow = viewportHeight - rect.bottom;
          const spaceAbove = rect.top;
          const dropdownHeight = 250; // Approximate dropdown height
          
          setDropdownDirection(prev => ({
            ...prev,
            [editingElementId]: spaceBelow < dropdownHeight && spaceAbove > dropdownHeight ? 'up' : 'down'
          }));
        }
      }, 10);
    }
  }, [editingElementId]);

  // Industry standard formatting for A4 page
  // US Standard screenplay format: 8.5" x 11" with specific margins
  // On mobile we cap the width to the viewport so the page fits without horizontal scrolling
  const pageStyles = {
    width: '100%',
    maxWidth: '8.5in',
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

  // Initialize EN elements when switching to EN language
  useEffect(() => {
    if (language === 'EN' && (!localData.elementsEN || localData.elementsEN.length === 0)) {
      const enElements = localData.elements.map(el => ({
        ...el,
        id: `en-${el.id}`,
        content: ''
      }));
      setLocalData(prev => ({
        ...prev,
        elementsEN: enElements
      }));
    } else if (language === 'EN' && localData.elementsEN && localData.elementsEN.length !== localData.elements.length) {
      // Sync EN elements with PL structure
      const enElements = localData.elements.map((plEl, index) => {
        const existingEn = localData.elementsEN?.[index];
        return existingEn && existingEn.type === plEl.type
          ? existingEn
          : {
              ...plEl,
              id: `en-${plEl.id}`,
              content: existingEn?.content || ''
            };
      });
      setLocalData(prev => ({
        ...prev,
        elementsEN: enElements
      }));
    }
  }, [language, localData.elements.length]);

  // Helper functions to get current language data
  const getCurrentElements = (): ScreenplayElement[] => {
    if (language === 'EN') {
      // If EN elements don't exist yet, return empty ones (will be initialized by useEffect)
      if (!localData.elementsEN || localData.elementsEN.length === 0) {
        return localData.elements.map(el => ({
          ...el,
          id: `en-${el.id}`,
          content: ''
        }));
      }
      return localData.elementsEN;
    }
    return localData.elements;
  };

  const getCurrentTitle = (): string => {
    if (language === 'EN') {
      return localData.titleEN || localData.title;
    }
    return localData.title;
  };

  const setCurrentTitle = (title: string) => {
    if (language === 'EN') {
      setLocalData(prev => ({ ...prev, titleEN: title }));
    } else {
      setLocalData(prev => ({ ...prev, title: title }));
    }
  };

  const updateCurrentElement = (id: string, content: string) => {
    if (language === 'EN') {
      setLocalData(prev => ({
        ...prev,
        elementsEN: (prev.elementsEN || []).map(el => 
          el.id === id ? { ...el, content } : el
        )
      }));
    } else {
      updateElement(id, content);
    }
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
    const currentElements = getCurrentElements();
    const insertIndex = afterId 
      ? currentElements.findIndex(e => e.id === afterId) + 1
      : currentElements.length;
    
    const newElement: ScreenplayElement = {
      id: `element-${Date.now()}`,
      type,
      content: '',
      position: insertIndex
    };

    // Sync to both PL and EN by position
    setLocalData(prev => {
      const plElements = [...prev.elements];
      const enElements = prev.elementsEN ? [...prev.elementsEN] : [];
      
      // Create corresponding elements
      const plNewElement: ScreenplayElement = {
        ...newElement,
        id: `pl-${newElement.id}`,
        content: ''
      };
      const enNewElement: ScreenplayElement = {
        ...newElement,
        id: `en-${newElement.id}`,
        content: ''
      };
      
      // Insert at the same position in both arrays
      plElements.splice(insertIndex, 0, plNewElement);
      enElements.splice(insertIndex, 0, enNewElement);
      
      // Reorder positions
      const reorderedPL = plElements.map((el, idx) => ({ ...el, position: idx }));
      const reorderedEN = enElements.map((el, idx) => ({ ...el, position: idx }));
      
      return {
        ...prev,
        elements: reorderedPL,
        elementsEN: reorderedEN
      };
    });

    // Set editing to the element in current language
    const elementId = language === 'EN' ? `en-${newElement.id}` : `pl-${newElement.id}`;
    setEditingElementId(elementId);
  };

  const updateElement = (id: string, content: string) => {
    const isEN = id.startsWith('en-') || (language === 'EN' && !id.startsWith('pl-'));
    const baseId = id.replace(/^(en-|pl-)/, '');
    
    setLocalData(prev => {
      if (isEN || language === 'EN') {
        // Update EN element and mark as edited
        return {
          ...prev,
          elementsEN: (prev.elementsEN || []).map(el => {
            if (el.id === id || (baseId && el.id === `en-${baseId}`)) {
              const original = originalContent[id] || el.content;
              const isEdited = content !== original;
              return { 
                ...el, 
                content,
                editedInEN: isEdited && !el.reviewed
              };
            }
            return el;
          })
        };
      } else {
        // Update PL element and mark as edited
        return {
          ...prev,
          elements: prev.elements.map(el => {
            if (el.id === id || (baseId && el.id === `pl-${baseId}`)) {
              const original = originalContent[id] || el.content;
              const isEdited = content !== original;
              return { 
                ...el, 
                content,
                editedInPL: isEdited && !el.reviewed
              };
            }
            return el;
          })
        };
      }
    });
  };

  const deleteElement = (id: string) => {
    const currentElements = getCurrentElements();
    const elementIndex = currentElements.findIndex(el => el.id === id);
    
    if (elementIndex === -1) return;
    
    setLocalData(prev => {
      if (language === 'EN') {
        // Delete from EN and corresponding PL element by position
        const newEN = (prev.elementsEN || []).filter((_, idx) => idx !== elementIndex);
        const newPL = prev.elements.filter((_, idx) => idx !== elementIndex);
        
        // Reorder positions
        const reorderedEN = newEN.map((el, idx) => ({ ...el, position: idx }));
        const reorderedPL = newPL.map((el, idx) => ({ ...el, position: idx }));
        
        return {
          ...prev,
          elementsEN: reorderedEN,
          elements: reorderedPL
        };
      } else {
        // Delete from PL and corresponding EN element by position
        const newPL = prev.elements.filter((_, idx) => idx !== elementIndex);
        const newEN = (prev.elementsEN || []).filter((_, idx) => idx !== elementIndex);
        
        // Reorder positions
        const reorderedPL = newPL.map((el, idx) => ({ ...el, position: idx }));
        const reorderedEN = newEN.map((el, idx) => ({ ...el, position: idx }));
        
        return {
          ...prev,
          elements: reorderedPL,
          elementsEN: reorderedEN
        };
      }
    });
    
    setEditingElementId(null);
    setSelectedElementId(null);
  };

  const markElementAsReviewed = (id: string) => {
    const currentElements = getCurrentElements();
    const elementIndex = currentElements.findIndex(el => el.id === id);
    
    if (elementIndex === -1) return;
    
    // Reset original content so future edits will be detected
    setOriginalContent(prev => {
      const newContent = { ...prev };
      delete newContent[id];
      return newContent;
    });
    
    setLocalData(prev => {
      if (language === 'EN') {
        // Mark EN and corresponding PL element as reviewed
        return {
          ...prev,
          elementsEN: (prev.elementsEN || []).map((el, idx) => 
            idx === elementIndex ? { ...el, reviewed: true, editedInEN: false } : el
          ),
          elements: prev.elements.map((el, idx) => 
            idx === elementIndex ? { ...el, reviewed: true, editedInEN: false } : el
          )
        };
      } else {
        // Mark PL and corresponding EN element as reviewed
        return {
          ...prev,
          elements: prev.elements.map((el, idx) => 
            idx === elementIndex ? { ...el, reviewed: true, editedInPL: false } : el
          ),
          elementsEN: (prev.elementsEN || []).map((el, idx) => 
            idx === elementIndex ? { ...el, reviewed: true, editedInPL: false } : el
          )
        };
      }
    });
  };

  const requestDeleteElement = (id: string) => {
    setConfirmDeleteElementId(id);
  };

  const confirmDeleteElement = () => {
    if (!confirmDeleteElementId) return;
    deleteElement(confirmDeleteElementId);
    setConfirmDeleteElementId(null);
  };

  const cancelDeleteElement = () => setConfirmDeleteElementId(null);

  const changeElementType = (id: string, newType: ScreenplayElement['type']) => {
    const currentElements = getCurrentElements();
    const elementIndex = currentElements.findIndex(el => el.id === id);
    
    if (elementIndex === -1) return;
    
    setLocalData(prev => {
      // Update both PL and EN elements at the same position
      return {
        ...prev,
        elements: prev.elements.map((el, idx) => 
          idx === elementIndex ? { ...el, type: newType } : el
        ),
        elementsEN: (prev.elementsEN || []).map((el, idx) => 
          idx === elementIndex ? { ...el, type: newType } : el
        )
      };
    });
    // Keep the element selected and in editing mode
    setSelectedElementId(id);
    setEditingElementId(id);
  };

  const handleElementClick = (id: string, event: React.MouseEvent) => {
    event.preventDefault();
    setSelectedElementId(id);
    setEditingElementId(id);
    
    // Always update original content when starting to edit (even if it exists)
    // This ensures that if content was reviewed and then edited again, we track the new baseline
    const currentElements = getCurrentElements();
    const element = currentElements.find(el => el.id === id);
    if (element) {
      setOriginalContent(prev => ({
        ...prev,
        [id]: element.content
      }));
    }
  };

  const handleElementBlur = (id: string) => {
    // Check if content changed
    const currentElements = getCurrentElements();
    const element = currentElements.find(el => el.id === id);
    const original = originalContent[id];
    
    if (element && original !== undefined && element.content !== original) {
      // Content changed - mark as edited in CURRENT language
      // This will highlight the corresponding element in the OTHER language
      const currentIndex = currentElements.findIndex(el => el.id === id);
      
      setLocalData(prev => {
        if (language === 'EN') {
          // Edited EN - mark EN as edited, so PL will be highlighted
          return {
            ...prev,
            elementsEN: (prev.elementsEN || []).map((el, idx) =>
              idx === currentIndex ? { ...el, editedInEN: true, reviewed: false } : el
            ),
            // Also mark corresponding PL element
            elements: prev.elements.map((el, idx) =>
              idx === currentIndex ? { ...el, editedInEN: true, reviewed: false } : el
            )
          };
        } else {
          // Edited PL - mark PL as edited, so EN will be highlighted
          return {
            ...prev,
            elements: prev.elements.map((el, idx) =>
              idx === currentIndex ? { ...el, editedInPL: true, reviewed: false } : el
            ),
            // Also mark corresponding EN element
            elementsEN: (prev.elementsEN || []).map((el, idx) =>
              idx === currentIndex ? { ...el, editedInPL: true, reviewed: false } : el
            )
          };
        }
      });
    }
    
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
        requestDeleteElement(elementId);
      }
    } else if (event.key === 'Escape') {
      setEditingElementId(null);
      setShowToolbar(false);
      setSelectedElementId(null);
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    onSave(localData);
    setIsSaving(false);
    setLastSavedAt(Date.now());
  };

  // Autosave on changes with debounce (30 seconds - backup save only)
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      handleSave();
    }, 30000); // 30 seconds - backup save to prevent Firebase quota issues
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [localData]);

  useEffect(() => {
    if (activeCommentElementId && commentsPanelRef.current) {
      commentsPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeCommentElementId]);

  const addCommentToElement = async (elementId: string, files?: FileList | null) => {
    let imageUrls: string[] = [];
    try {
      if (files && files.length > 0 && uploadFile) {
        setIsUploading(true);
        const uploads: string[] = [];
        for (const file of Array.from(files)) {
          const res = await uploadFile(file, 'screenplay-comments');
          if (res?.url) uploads.push(res.url);
        }
        imageUrls = uploads;
      }
    } finally {
      setIsUploading(false);
    }

    const comment: ScreenplayComment = {
      id: `cmt-${Date.now()}`,
      createdAt: Date.now(),
      text: newCommentText.trim(),
      images: imageUrls,
    };

    setLocalData(prev => ({
      ...prev,
      elements: prev.elements.map(e => e.id === elementId
        ? { ...e, comments: [...(e.comments || []), comment] }
        : e
      )
    }));
    setNewCommentText('');
  };

  const requestDeleteComment = (elementId: string, commentId: string) => {
    setConfirmDeleteComment({ elementId, commentId });
  };

  const confirmDeleteCommentAction = () => {
    if (!confirmDeleteComment) return;
    const { elementId, commentId } = confirmDeleteComment;
    setLocalData(prev => ({
      ...prev,
      elements: prev.elements.map(e => e.id === elementId
        ? { ...e, comments: (e.comments || []).filter(c => c.id !== commentId) }
        : e
      )
    }));
    setConfirmDeleteComment(null);
  };

  const cancelDeleteComment = () => setConfirmDeleteComment(null);

  const handleExportPDF = () => {
    // Create a new window for PDF generation
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Get current language elements and title
    const currentElements = getCurrentElements();
    const currentTitle = getCurrentTitle();

    // Generate HTML content for PDF
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${currentTitle || 'Untitled Screenplay'}</title>
        <style>
          @page {
            size: letter;
            margin: 1in;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Courier New', monospace;
            font-size: 12pt;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            color: #000;
          }
          
          .page {
            width: 6.5in;
            min-height: 9in;
            margin: 0 auto;
            page-break-after: always;
            position: relative;
          }
          
          .page:last-child {
            page-break-after: avoid;
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
        <div class="title">${currentTitle || 'Untitled Screenplay'}</div>
      </div>
    `;

    // Add screenplay elements
    currentElements.forEach((element) => {
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

    // Trigger print dialog after a short delay
    setTimeout(() => {
      printWindow.print();
      // Close the window after printing
      printWindow.addEventListener('afterprint', () => {
        printWindow.close();
      });
    }, 500);
  };

  const handleExportVO = () => {
    // Create a new window for VO PDF generation
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Get current language elements and title
    const currentElements = getCurrentElements();
    const currentTitle = getCurrentTitle();

    // Filter elements to only scene-setting, character, and dialogue
    const voElements = currentElements.filter(element => 
      element.type === 'scene-setting' || 
      element.type === 'character' || 
      element.type === 'dialogue'
    );

    // Generate HTML content for PDF
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${currentTitle || 'Untitled Screenplay'} - VO</title>
        <style>
          @page {
            size: letter;
            margin: 1in;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Courier New', monospace;
            font-size: 12pt;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            color: #000;
          }
          
          .page {
            width: 6.5in;
            min-height: 9in;
            margin: 0 auto;
            page-break-after: always;
            position: relative;
          }
          
          .page:last-child {
            page-break-after: avoid;
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
          
          .dialogue {
            margin: 0.25em 0 0.5em 0;
            margin-left: 1.5in;
            margin-right: 1.5in;
            width: 3.5in;
            text-align: left;
          }
        </style>
      </head>
      <body>
    `;

    // Add title page
    htmlContent += `
      <div class="page">
        <div class="title">${currentTitle || 'Untitled Screenplay'} - VO</div>
      </div>
    `;

    // Add VO elements only
    voElements.forEach((element) => {
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

    // Trigger print dialog after a short delay
    setTimeout(() => {
      printWindow.print();
      // Close the window after printing
      printWindow.addEventListener('afterprint', () => {
        printWindow.close();
      });
    }, 500);
  };

  const handleExportStoryboard = () => {
    // Create a new window for Storyboard PDF generation
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Get current language elements and title
    const currentElements = getCurrentElements();
    const currentTitle = getCurrentTitle();

    // Generate HTML content for Storyboard PDF
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${currentTitle || 'Untitled Screenplay'} - Storyboard</title>
        <style>
          @page {
            size: letter;
            margin: 0.5in;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Courier New', monospace;
            font-size: 10pt;
            line-height: 1.3;
            margin: 0;
            padding: 0;
            color: #000;
          }
          
          .page {
            width: 7.5in;
            min-height: 10in;
            margin: 0 auto;
            page-break-after: always;
            position: relative;
            padding: 0.5in;
            display: flex;
            flex-direction: column;
          }
          
          .page:last-child {
            page-break-after: avoid;
          }
          
          .title-page {
            text-align: center;
            padding-top: 3in;
            justify-content: center;
          }
          
          .title {
            font-size: 28pt;
            font-weight: bold;
            margin-bottom: 0.5in;
            text-transform: uppercase;
          }
          
          .subtitle {
            font-size: 14pt;
            margin-bottom: 2in;
            color: #666;
          }
          
          .script-content {
            flex: 1;
            margin-bottom: 0.3in;
            font-size: 10pt;
            line-height: 1.4;
          }
          
          .script-element {
            margin-bottom: 0.15in;
          }
          
          .script-element.scene-setting {
            text-transform: uppercase;
            font-weight: bold;
            margin-top: 0.2in;
            margin-left: 0;
          }
          
          .script-element.character {
            text-transform: uppercase;
            font-weight: bold;
            text-align: center;
            margin: 0.15in 2in 0.05in 2in;
          }
          
          .script-element.dialogue {
            margin-left: 1in;
            margin-right: 1in;
          }
          
          .script-element.action {
            margin-left: 0;
          }
          
          .script-element.parenthetical {
            margin-left: 1.5in;
            margin-right: 1.5in;
            font-style: italic;
          }
          
          .storyboard-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: repeat(3, 1fr);
            gap: 0.2in;
            margin-top: 0.3in;
            width: 100%;
            flex-shrink: 0;
          }
          
          .storyboard-panel {
            width: 100%;
            aspect-ratio: 16 / 9;
            border: 2px solid #000;
            background-color: #fff;
            position: relative;
            page-break-inside: avoid;
          }
          
          .panel-number {
            position: absolute;
            top: 0.05in;
            left: 0.05in;
            background-color: #fff;
            padding: 0.03in 0.1in;
            font-weight: bold;
            font-size: 10pt;
            border: 1px solid #000;
            z-index: 10;
          }
          
          .panel-notes {
            margin-top: 0.1in;
            width: 100%;
            min-height: 0.5in;
            border: 1px dashed #666;
            padding: 0.1in;
            font-size: 8pt;
            font-family: 'Arial', sans-serif;
            background-color: #fafafa;
          }
          
          .panel-notes-label {
            font-size: 7pt;
            font-weight: bold;
            color: #666;
            margin-bottom: 0.05in;
          }
          
          .panel-container {
            display: flex;
            flex-direction: column;
          }
        </style>
      </head>
      <body>
    `;

    // Add title page
    htmlContent += `
      <div class="page title-page">
        <div class="title">${currentTitle || 'Untitled Screenplay'}</div>
        <div class="subtitle">Storyboard</div>
      </div>
    `;

    // Generate script pages first (without storyboard panels)
    const totalFrames = 62;
    const framesPerPage = 6;
    let frameCounter = 1;
    let currentPageElements: string[] = [];
    let elementCount = 0;

    // Function to generate storyboard grid (6 panels in 2x3 grid)
    const generateStoryboardGrid = (startFrame: number, endFrame: number) => {
      let grid = '<div class="storyboard-grid">';
      for (let i = startFrame; i <= endFrame && i <= totalFrames; i++) {
        grid += `
          <div class="panel-container">
            <div class="storyboard-panel">
              <div class="panel-number">${i}</div>
            </div>
            <div class="panel-notes">
              <div class="panel-notes-label">Notes:</div>
            </div>
          </div>
        `;
      }
      grid += '</div>';
      return grid;
    };

    // Function to close a script page (no storyboard panels here)
    const closePage = () => {
      if (currentPageElements.length === 0) return;
      
      const pageContent = currentPageElements.join('');
      htmlContent += `<div class="page">${pageContent}</div>`;
      currentPageElements = [];
      elementCount = 0;
    };

    // Add all script elements, creating new pages as needed
    // Rough estimate: ~25-30 elements per page (adjust based on content length)
    currentElements.forEach((element) => {
      const elementClass = element.type.replace('-', '-');
      const content = element.content || '&nbsp;';
      const elementHtml = `<div class="script-element ${elementClass}">${content}</div>`;
      
      // Estimate if adding this element would overflow the page
      // Use element count as rough proxy (adjust threshold as needed)
      if (elementCount > 25 && currentPageElements.length > 0) {
        closePage();
      }
      
      currentPageElements.push(elementHtml);
      elementCount++;
    });

    // Close the last page with remaining elements
    if (currentPageElements.length > 0) {
      closePage();
    }
    
    // Now add storyboard pages at the very end (62 frames total, 6 per page)
    while (frameCounter <= totalFrames) {
      const framesToAdd = Math.min(framesPerPage, totalFrames - frameCounter + 1);
      if (framesToAdd > 0) {
        htmlContent += `<div class="page">${generateStoryboardGrid(frameCounter, frameCounter + framesToAdd - 1)}</div>`;
        frameCounter += framesToAdd;
      }
    }

    htmlContent += `
      </body>
      </html>
    `;

    // Write content to new window
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Trigger print dialog after a short delay
    setTimeout(() => {
      printWindow.print();
      // Close the window after printing
      printWindow.addEventListener('afterprint', () => {
        printWindow.close();
      });
    }, 500);
  };

  // expose handlers
  useImperativeHandle(ref, () => ({
    exportPDF: handleExportPDF,
    exportVO: handleExportVO,
    exportStoryboard: handleExportStoryboard,
    togglePreview: () => setIsPreviewMode(prev => !prev),
    save: handleSave
  }));

  const handleTranslationComplete = (translatedText: string) => {
    // Parse the translated text and update EN elements
    // The translated text should maintain the same structure as PL with [TYPE] markers
    const plElements = localData.elements;
    
    // Parse translated text by element type markers
    const lines = translatedText.split('\n');
    const parsedElements: Array<{ type: string; content: string }> = [];
    let currentType: string | null = null;
    let currentContent: string[] = [];
    
    for (const line of lines) {
      // Check if line is a type marker like [SCENE-SETTING], [CHARACTER], etc.
      const typeMatch = line.match(/^\[([A-Z-]+)\]$/);
      if (typeMatch) {
        // Save previous element if exists
        if (currentType && currentContent.length > 0) {
          parsedElements.push({
            type: currentType.toLowerCase(),
            content: currentContent.join('\n').trim()
          });
        }
        // Start new element
        currentType = typeMatch[1].toLowerCase();
        currentContent = [];
      } else if (currentType && line.trim()) {
        // Add content to current element
        currentContent.push(line);
      }
    }
    
    // Save last element
    if (currentType && currentContent.length > 0) {
      parsedElements.push({
        type: currentType.toLowerCase(),
        content: currentContent.join('\n').trim()
      });
    }
    
    // Match parsed elements to PL structure
    const enElements: ScreenplayElement[] = plElements.map((plEl, index) => {
      // Try to find matching translated element by type and position
      const translatedEl = parsedElements[index];
      
      // If we found a matching element with the same type, use it
      if (translatedEl && translatedEl.type === plEl.type) {
        return {
          ...plEl,
          id: `en-${plEl.id}`,
          content: translatedEl.content
        };
      }
      
      // Otherwise, try to find by type only
      const matchingByType = parsedElements.find(el => el.type === plEl.type);
      if (matchingByType) {
        return {
          ...plEl,
          id: `en-${plEl.id}`,
          content: matchingByType.content
        };
      }
      
      // Fallback: use empty content
      return {
        ...plEl,
        id: `en-${plEl.id}`,
        content: ''
      };
    });

    setLocalData(prev => ({
      ...prev,
      elementsEN: enElements,
      titleEN: prev.titleEN || prev.title
    }));
  };

  const renderElement = (element: ScreenplayElement, index: number) => {
    const isSelected = selectedElementId === element.id;
    const isEditing = editingElementId === element.id;
    const styles = elementStyles[element.type];
    
    // Check if element is edited in the OTHER language
    // If viewing EN, highlight if PL was edited (need to review in EN)
    // If viewing PL, highlight if EN was edited (need to review in PL)
    const isEdited = language === 'EN' 
      ? element.editedInPL && !element.reviewed
      : element.editedInEN && !element.reviewed;

    return (
      <div key={element.id}>
        
        <div
          className={`relative group mb-2 ${isEditing ? 'ring-2 ring-blue-500 rounded-lg' : ''} ${
            isEdited ? 'ring-2 ring-yellow-400 bg-yellow-50 rounded-lg' : ''
          } ${
            isPreviewMode ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50'
          }`}
          onClick={(e) => !isPreviewMode && handleElementClick(element.id, e)}
        >
        {/* Edited indicator and review button */}
        {!isPreviewMode && isEdited && (
          <button
            className="absolute -right-8 top-0 w-6 h-6 rounded-full bg-yellow-500 border border-yellow-600 text-white flex items-center justify-center shadow-sm hover:bg-yellow-600 z-10"
            title="Mark as reviewed"
            onClick={(e) => { 
              e.stopPropagation(); 
              markElementAsReviewed(element.id);
            }}
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        {/* Comment icon indicator - only when comments exist */}
        {!isPreviewMode && (element.comments && element.comments.length > 0) && !isEdited && (
          <button
            className="absolute -right-8 top-0 w-6 h-6 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-800 flex items-center justify-center shadow-sm hover:bg-yellow-200"
            title={`${element.comments.length} comment${element.comments.length > 1 ? 's' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveCommentElementId(element.id); }}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
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
            value={element.content || ''}
            onChange={(e) => {
              if (language === 'EN') {
                updateCurrentElement(element.id, e.target.value);
              } else {
                updateElement(element.id, e.target.value);
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, element.id)}
            onBlur={() => handleElementBlur(element.id)}
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
          <div className={`absolute -right-32 ${dropdownDirection[element.id] === 'up' ? 'bottom-0' : 'top-0'} flex flex-col space-y-2`}>
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
                {/* Divider */}
                <div className="border-t border-gray-300 my-1"></div>
                {/* Enhance button */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEnhanceElementId(element.id);
                    setShowEnhanceDialog(true);
                  }}
                  className="px-3 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-600 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Enhance
                </button>
                {/* Add Comment button */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveCommentElementId(element.id);
                  }}
                  className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                >
                  Add Comment
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    requestDeleteElement(element.id);
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
        <div className="flex-1 bg-gray-100 p-4 sm:p-6 flex flex-col lg:flex-row">
          {!isPreviewMode && (
            <div className="mb-4 lg:mb-0 lg:w-16 lg:mr-6 lg:sticky top-4 self-start">
              <div className="flex flex-row items-center gap-3 overflow-x-auto pb-2 lg:pb-0 lg:flex-col lg:items-center lg:gap-3">
                {/* Language Toggle */}
                <div className="flex flex-row lg:flex-col gap-1 mb-2 flex-shrink-0">
                  <button
                    onClick={() => setLanguage('PL')}
                    className={`w-12 h-8 rounded-md font-medium text-xs transition-colors ${
                      language === 'PL'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    title="Polish"
                  >
                    PL
                  </button>
                  <button
                    onClick={() => setLanguage('EN')}
                    className={`w-12 h-8 rounded-md font-medium text-xs transition-colors ${
                      language === 'EN'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                    title="English"
                  >
                    EN
                  </button>
                </div>
                
                {/* AI Generate Button for EN */}
                {language === 'EN' && (
                  <button
                    onClick={() => setShowTranslationDialog(true)}
                    className="w-12 h-12 rounded-md bg-purple-600 hover:bg-purple-700 shadow text-white flex items-center justify-center"
                    title="Generate English translation"
                  >
                    <Wand2 className="w-5 h-5" />
                  </button>
                )}
                <div className="hidden lg:block w-full border-t border-gray-300 my-2"></div>
                
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addElement('scene-setting', selectedElementIdRef.current || undefined); }}
                  className="w-12 h-12 rounded-md bg-red-600 hover:bg-red-700 shadow text-white flex items-center justify-center"
                  title="Scene Setting"
                  aria-label="Add scene setting"
                >
                  <Type className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addElement('character', selectedElementIdRef.current || undefined); }}
                  className="w-12 h-12 rounded-md bg-blue-600 hover:bg-blue-700 shadow text-white flex items-center justify-center"
                  title="Character"
                  aria-label="Add character"
                >
                  <Users className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addElement('action', selectedElementIdRef.current || undefined); }}
                  className="w-12 h-12 rounded-md bg-green-600 hover:bg-green-700 shadow text-white flex items-center justify-center"
                  title="Action"
                  aria-label="Add action"
                >
                  <FileText className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addElement('dialogue', selectedElementIdRef.current || undefined); }}
                  className="w-12 h-12 rounded-md bg-purple-600 hover:bg-purple-700 shadow text-white flex items-center justify-center"
                  title="Dialogue"
                  aria-label="Add dialogue"
                >
                  <AlignLeft className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addElement('parenthetical', selectedElementIdRef.current || undefined); }}
                  className="w-12 h-12 rounded-md bg-orange-600 hover:bg-orange-700 shadow text-white flex items-center justify-center"
                  title="Parenthetical"
                  aria-label="Add parenthetical"
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); addElement('general', selectedElementIdRef.current || undefined); }}
                  className="w-12 h-12 rounded-md bg-gray-600 hover:bg-gray-700 shadow text-white flex items-center justify-center"
                  title="General"
                  aria-label="Add general"
                >
                  <FileText className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto">
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
                  value={getCurrentTitle()}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  className="text-3xl font-bold text-black text-center bg-transparent border-none outline-none w-full"
                  placeholder="Untitled Screenplay"
                  style={{ direction: 'ltr', color: '#000000' }}
                  dir="ltr"
                />
              ) : (
                <div className="text-3xl font-bold text-black" style={{ direction: 'ltr', color: '#000000' }} dir="ltr">
                  {getCurrentTitle() || 'Untitled Screenplay'}
                </div>
              )}
            </div>

            {/* Elements */}
            <div className="space-y-3">
              {getCurrentElements().map((element, index) => renderElement(element, index))}
            </div>

            {/* Add First Element Button */}
            {getCurrentElements().length === 0 && !isPreviewMode && (
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

          {/* Right comments panel */}
          {!isPreviewMode && activeCommentElementId && (
            <div
              ref={commentsPanelRef}
              className="w-full mt-4 lg:mt-0 lg:w-80 lg:ml-6 lg:sticky top-4 self-start bg-white border border-gray-200 rounded-lg shadow-sm p-3 h-fit max-h-[80vh] overflow-auto"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-800 text-sm">Comments</h4>
                <button
                  className="text-gray-500 hover:text-gray-700 text-xs"
                  onClick={() => setActiveCommentElementId(null)}
                >
                  Close
                </button>
              </div>
              <div className="space-y-3 mb-3">
                {(getCurrentElements().find(e => e.id === activeCommentElementId)?.comments || []).map((c) => (
                  <div key={c.id} className="border border-gray-200 rounded p-2">
                    <div className="text-xs text-gray-500 mb-1">{new Date(c.createdAt).toLocaleString()}</div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm text-gray-900 whitespace-pre-wrap flex-1">{c.text}</div>
                      <button
                        className="text-xs text-red-600 hover:text-red-700"
                        onClick={() => requestDeleteComment(activeCommentElementId!, c.id)}
                      >
                        Delete
                      </button>
                    </div>
                    {c.images && c.images.length > 0 && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {c.images.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt="comment attachment"
                            className="w-full h-16 object-cover rounded border cursor-zoom-in"
                            onClick={() => setPreviewImageUrl(url)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add comment */}
              <div className="border-t pt-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Add a note..."
                  rows={3}
                  className="w-full text-sm border rounded p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="text-xs text-gray-600 cursor-pointer">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addCommentToElement(activeCommentElementId!, e.target.files)} />
                    Attach images
                  </label>
                  <button
                    disabled={isUploading || newCommentText.trim().length === 0}
                    onClick={() => addCommentToElement(activeCommentElementId!)}
                    className={`px-3 py-1.5 rounded text-xs font-medium ${isUploading || newCommentText.trim().length === 0 ? 'bg-gray-200 text-gray-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    {isUploading ? 'Uploading...' : 'Add Comment'}
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
      
      {/* Confirm delete element modal */}
      {confirmDeleteElementId && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={cancelDeleteElement}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-medium text-gray-900 mb-2">Delete section?</div>
            <div className="text-sm text-gray-600 mb-4">This action cannot be undone.</div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-sm rounded border" onClick={cancelDeleteElement}>Cancel</button>
              <button className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700" onClick={confirmDeleteElement}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete comment modal */}
      {confirmDeleteComment && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={cancelDeleteComment}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-medium text-gray-900 mb-2">Delete comment?</div>
            <div className="text-sm text-gray-600 mb-4">This will remove the comment permanently.</div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-sm rounded border" onClick={cancelDeleteComment}>Cancel</button>
              <button className="px-3 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700" onClick={confirmDeleteCommentAction}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {previewImageUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={() => setPreviewImageUrl(null)}>
          <img src={previewImageUrl} alt="preview" className="max-w-[90vw] max-h-[90vh] object-contain" />
        </div>
      )}

      {/* Translation Dialog */}
      <TranslationDialog
        isOpen={showTranslationDialog}
        onClose={() => setShowTranslationDialog(false)}
        onTranslationComplete={handleTranslationComplete}
        screenplayData={localData}
      />

      {/* Enhance Dialog */}
      {showEnhanceDialog && enhanceElementId && (() => {
        const currentElements = getCurrentElements();
        const element = currentElements.find(el => el.id === enhanceElementId);
        if (!element) return null;
        
        return (
          <EnhanceDialog
            isOpen={showEnhanceDialog}
            onClose={() => {
              setShowEnhanceDialog(false);
              setEnhanceElementId(null);
            }}
            onEnhancementComplete={(selectedText, thread) => {
              // Update the element with enhanced text and thread
              const elementIndex = currentElements.findIndex(el => el.id === enhanceElementId);
              if (elementIndex === -1) return;
              
              // Get the original content to detect changes
              const currentElement = currentElements[elementIndex];
              const originalContent = currentElement.content;
              
              setLocalData(prev => {
                if (language === 'EN') {
                  // Enhanced EN - mark EN as edited, so PL will be highlighted
                  return {
                    ...prev,
                    elementsEN: (prev.elementsEN || []).map((el, idx) =>
                      idx === elementIndex
                        ? { 
                            ...el, 
                            content: selectedText, 
                            enhancementThread: thread,
                            editedInEN: selectedText !== originalContent,
                            reviewed: false
                          }
                        : el
                    ),
                    elements: prev.elements.map((el, idx) =>
                      idx === elementIndex
                        ? { 
                            ...el, 
                            enhancementThread: thread,
                            editedInEN: selectedText !== originalContent,
                            reviewed: false
                          }
                        : el
                    )
                  };
                } else {
                  // Enhanced PL - mark PL as edited, so EN will be highlighted
                  return {
                    ...prev,
                    elements: prev.elements.map((el, idx) =>
                      idx === elementIndex
                        ? { 
                            ...el, 
                            content: selectedText, 
                            enhancementThread: thread,
                            editedInPL: selectedText !== originalContent,
                            reviewed: false
                          }
                        : el
                    ),
                    elementsEN: (prev.elementsEN || []).map((el, idx) =>
                      idx === elementIndex
                        ? { 
                            ...el, 
                            enhancementThread: thread,
                            editedInPL: selectedText !== originalContent,
                            reviewed: false
                          }
                        : el
                    )
                  };
                }
              });
              
              // Reset original content tracking for this element
              setOriginalContent(prev => {
                const newContent = { ...prev };
                delete newContent[enhanceElementId];
                return newContent;
              });
              
              setShowEnhanceDialog(false);
              setEnhanceElementId(null);
            }}
            element={element}
          />
        );
      })()}
    </>
  );
});

// Provide a display name to satisfy react/display-name lint rule
ScreenplayEditor.displayName = 'ScreenplayEditor';

export default ScreenplayEditor;