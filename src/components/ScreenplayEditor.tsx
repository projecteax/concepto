'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
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
  Sparkles,
  History,
  Edit3,
  X
} from 'lucide-react';
import { ScreenplayElement, ScreenplayData, ScreenplayComment, ScreenplayStableVersion } from '@/types';
import { useS3Upload } from '@/hooks/useS3Upload';
import { useAuth } from '@/contexts/AuthContext';
import { TranslationDialog } from './TranslationDialog';
import { EnhanceDialog } from './EnhanceDialog';

export interface ScreenplayEditorHandle {
  exportPDF: () => void;
  exportVO: () => void;
  exportStoryboard: () => void;
  togglePreview: () => void;
  save: () => Promise<void>;
}

interface ScreenplayEditorProps {
  screenplayData: ScreenplayData;
  onSave: (data: ScreenplayData) => void | Promise<void>;
  episodeId: string;
}

const ScreenplayEditor = forwardRef<ScreenplayEditorHandle, ScreenplayEditorProps>(({ 
  screenplayData,
  onSave,
  episodeId
}, ref) => {
  const { user } = useAuth();
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
  const [isMobile, setIsMobile] = useState(false);
  const elementContainerRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [commentsPanelTop, setCommentsPanelTop] = useState<number>(0);
  
  // Stable versions state
  // Helper to convert createdAt to Date (handles Firestore Timestamp, string, number, or Date)
  const convertToDateForState = (date: unknown): Date => {
    if (date instanceof Date) return date;
    if (typeof date === 'number') return new Date(date);
    if (typeof date === 'string') return new Date(date);
    if (date && typeof date === 'object' && 'toDate' in date) {
      return (date as { toDate: () => Date }).toDate();
    }
    return new Date();
  };
  
  const [stableVersions, setStableVersions] = useState<ScreenplayStableVersion[]>(() => {
    if (!screenplayData.stableVersions) return [];
    return screenplayData.stableVersions.map(v => ({
      ...v,
      createdAt: convertToDateForState(v.createdAt)
    }));
  });
  const [editingVersionName, setEditingVersionName] = useState<string | null>(null);
  const [tempVersionName, setTempVersionName] = useState('');
  const [versionToRestore, setVersionToRestore] = useState<ScreenplayStableVersion | null>(null);

  // Track window size for responsive styles
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      
      // Sync stable versions
      if (screenplayData.stableVersions) {
        const convertToDate = (date: unknown): Date => {
          if (date instanceof Date) return date;
          if (typeof date === 'number') return new Date(date);
          if (typeof date === 'string') return new Date(date);
          if (date && typeof date === 'object' && 'toDate' in date) {
            return (date as { toDate: () => Date }).toDate();
          }
          return new Date();
        };
        setStableVersions(screenplayData.stableVersions.map(v => ({
          ...v,
          createdAt: convertToDate(v.createdAt)
        })));
      } else {
        setStableVersions([]);
      }
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
  // On mobile we use minimal margins (5px) and responsive units
  const pageStyles = useMemo(() => ({
    width: '100%',
    maxWidth: isMobile ? '100%' : '8.5in',
    minHeight: isMobile ? 'auto' : '11in',
    margin: '0 auto',
    padding: isMobile ? '12px 5px' : '1in 1in', // 5px left/right on mobile, 1 inch on desktop
    backgroundColor: 'white',
    boxShadow: isMobile ? 'none' : '0 0 10px rgba(0,0,0,0.1)',
    fontFamily: 'Courier New, monospace',
    fontSize: isMobile ? '11pt' : '12pt',
    lineHeight: '1.2',
    position: 'relative' as const,
    direction: 'ltr' as const,
    textAlign: 'left' as const,
    unicodeBidi: 'embed' as const
  }), [isMobile]);

  // Industry standard screenplay margins (from left edge of paper, accounting for padding)
  // On mobile: use minimal margins and percentages for responsive layout
  // On desktop: use industry standard inch-based margins
  const elementStyles = useMemo(() => ({
    'scene-setting': {
      textTransform: 'uppercase' as const,
      fontWeight: 'bold' as const,
      marginBottom: '0.5em',
      marginTop: '1em',
      textAlign: 'left' as const,
      marginLeft: isMobile ? '0' : '0.5in',
      marginRight: isMobile ? '0' : '1.0in',
      paddingLeft: '0',
      paddingRight: '0',
      width: isMobile ? '100%' : '5.5in',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    },
    'character': {
      textTransform: 'uppercase' as const,
      fontWeight: 'bold' as const,
      marginBottom: '0.25em',
      marginTop: '0.5em',
      textAlign: 'center' as const,
      marginLeft: isMobile ? 'auto' : '3.1in',
      marginRight: isMobile ? 'auto' : '3.1in',
      paddingLeft: '0',
      paddingRight: '0',
      width: isMobile ? 'auto' : '1.3in',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    },
    'action': {
      textTransform: 'none' as const,
      fontWeight: 'normal' as const,
      marginBottom: '0.5em',
      marginTop: '0.5em',
      textAlign: 'left' as const,
      marginLeft: isMobile ? '0' : '0.5in',
      marginRight: isMobile ? '0' : '1.0in',
      paddingLeft: '0',
      paddingRight: '0',
      width: isMobile ? '100%' : '5.5in',
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
      marginLeft: isMobile ? '10%' : '2.1in',
      marginRight: isMobile ? '10%' : '2.35in',
      paddingLeft: '0',
      paddingRight: '0',
      width: isMobile ? 'auto' : '2.05in',
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
      marginLeft: isMobile ? '5%' : '1.5in',
      marginRight: isMobile ? '5%' : '1.5in',
      paddingLeft: '0',
      paddingRight: '0',
      width: isMobile ? 'auto' : '3.5in',
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
      marginLeft: isMobile ? '0' : '0.5in',
      marginRight: isMobile ? '0' : '1.0in',
      paddingLeft: '0',
      paddingRight: '0',
      width: isMobile ? '100%' : '5.5in',
      direction: 'ltr' as const,
      unicodeBidi: 'embed' as const
    }
  }), [isMobile]);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ ...localData, stableVersions });
      setLastSavedAt(Date.now());
    } finally {
      setIsSaving(false);
    }
  };

  // Stable versions functions
  const handleSaveVersion = useCallback(async () => {
    const nextVersionNumber = stableVersions.length + 1;
    const defaultName = `Screenplay_stable_v${nextVersionNumber}`;

    const newVersion: ScreenplayStableVersion = {
      id: `version-${Date.now()}`,
      name: defaultName,
      createdAt: new Date(),
      data: {
        title: localData.title,
        titleEN: localData.titleEN,
        elements: JSON.parse(JSON.stringify(localData.elements)),
        elementsEN: localData.elementsEN ? JSON.parse(JSON.stringify(localData.elementsEN)) : undefined,
      },
    };

    const updatedVersions = [...stableVersions, newVersion];
    setStableVersions(updatedVersions);
    setEditingVersionName(newVersion.id);
    setTempVersionName(newVersion.name);
    
    // Save the new stable version
    setIsSaving(true);
    try {
      await onSave({ ...localData, stableVersions: updatedVersions });
      setLastSavedAt(Date.now());
    } finally {
      setIsSaving(false);
    }
  }, [stableVersions, localData, onSave]);

  const handleRestoreVersion = useCallback(async () => {
    if (!versionToRestore) return;

    const restoredData = {
      title: versionToRestore.data.title,
      titleEN: versionToRestore.data.titleEN,
      elements: JSON.parse(JSON.stringify(versionToRestore.data.elements)),
      elementsEN: versionToRestore.data.elementsEN ? JSON.parse(JSON.stringify(versionToRestore.data.elementsEN)) : undefined,
      stableVersions: stableVersions, // Keep stable versions as is
    };

    setLocalData(restoredData);
    setVersionToRestore(null);
    
    // Save the restored version
    setIsSaving(true);
    try {
      await onSave(restoredData);
      setLastSavedAt(Date.now());
    } finally {
      setIsSaving(false);
    }
  }, [versionToRestore, stableVersions, onSave]);

  const handleUpdateVersionName = useCallback(async (versionId: string, newName: string) => {
    if (!newName.trim()) return;
    
    const updatedVersions = stableVersions.map(v => 
      v.id === versionId ? { ...v, name: newName.trim() } : v
    );
    setStableVersions(updatedVersions);
    setEditingVersionName(null);
    setTempVersionName('');
    
    // Save the updated name
    setIsSaving(true);
    try {
      await onSave({ ...localData, stableVersions: updatedVersions });
      setLastSavedAt(Date.now());
    } finally {
      setIsSaving(false);
    }
  }, [stableVersions, localData, onSave]);

  const handleDeleteVersion = useCallback(async (versionId: string) => {
    const updatedVersions = stableVersions.filter(v => v.id !== versionId);
    setStableVersions(updatedVersions);
    
    // Save after deletion
    setIsSaving(true);
    try {
      await onSave({ ...localData, stableVersions: updatedVersions });
      setLastSavedAt(Date.now());
    } finally {
      setIsSaving(false);
    }
  }, [stableVersions, localData, onSave]);

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
      void handleSave();
    }, 30000); // 30 seconds - backup save to prevent Firebase quota issues
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [localData]);

  useEffect(() => {
    if (activeCommentElementId) {
      // Position comments panel at same level as the commented element
      const elementContainer = elementContainerRefs.current[activeCommentElementId];
      if (elementContainer) {
        const updatePosition = () => {
          const rect = elementContainer.getBoundingClientRect();
          const scrollContainer = elementContainer.closest('.flex-1.overflow-auto');
          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            // Calculate position relative to scroll container
            const relativeTop = rect.top - containerRect.top + scrollContainer.scrollTop;
            setCommentsPanelTop(relativeTop);
          }
        };
        
        updatePosition();
        
        // Scroll element into view gently
        elementContainer.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest', 
          inline: 'nearest' 
        });
        
        // Update position after scroll
        setTimeout(updatePosition, 300);
        
        // Update on scroll
        const handleScroll = () => updatePosition();
        const scrollContainer = elementContainer.closest('.flex-1.overflow-auto');
        if (scrollContainer) {
          scrollContainer.addEventListener('scroll', handleScroll);
          return () => scrollContainer.removeEventListener('scroll', handleScroll);
        }
      }
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
      author: user?.name || user?.username || 'Unknown',
      text: newCommentText.trim(),
      images: imageUrls,
    };

    // Find the base element ID (remove en-/pl- prefix if present)
    const baseId = elementId.replace(/^(en-|pl-)/, '');
    
    setLocalData(prev => {
      // Update both PL and EN elements with the same base ID
      const updatedPL = prev.elements.map(e => {
        const eBaseId = e.id.replace(/^(en-|pl-)/, '');
        return eBaseId === baseId
          ? { ...e, comments: [...(e.comments || []), comment] }
          : e;
      });
      
      const updatedEN = (prev.elementsEN || []).map(e => {
        const eBaseId = e.id.replace(/^(en-|pl-)/, '');
        return eBaseId === baseId
          ? { ...e, comments: [...(e.comments || []), comment] }
          : e;
      });
      
      return {
        ...prev,
        elements: updatedPL,
        elementsEN: updatedEN,
      };
    });
    
    setNewCommentText('');
  };

  const requestDeleteComment = (elementId: string, commentId: string) => {
    setConfirmDeleteComment({ elementId, commentId });
  };

  const confirmDeleteCommentAction = () => {
    if (!confirmDeleteComment) return;
    const { elementId, commentId } = confirmDeleteComment;
    
    // Find the base element ID (remove en-/pl- prefix if present)
    const baseId = elementId.replace(/^(en-|pl-)/, '');
    
    setLocalData(prev => {
      // Update both PL and EN elements with the same base ID
      const updatedPL = prev.elements.map(e => {
        const eBaseId = e.id.replace(/^(en-|pl-)/, '');
        return eBaseId === baseId
          ? { ...e, comments: (e.comments || []).filter(c => c.id !== commentId) }
          : e;
      });
      
      const updatedEN = (prev.elementsEN || []).map(e => {
        const eBaseId = e.id.replace(/^(en-|pl-)/, '');
        return eBaseId === baseId
          ? { ...e, comments: (e.comments || []).filter(c => c.id !== commentId) }
          : e;
      });
      
      return {
        ...prev,
        elements: updatedPL,
        elementsEN: updatedEN,
      };
    });
    
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
          ref={(el) => { elementContainerRefs.current[element.id] = el; }}
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
            className={`absolute ${isMobile ? 'top-0 right-0' : '-right-8 top-0'} w-6 h-6 rounded-full bg-yellow-500 border border-yellow-600 text-white flex items-center justify-center shadow-sm hover:bg-yellow-600 z-10`}
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
            className={`absolute ${isMobile ? 'top-0 right-0' : '-right-8 top-0'} w-6 h-6 rounded-full bg-yellow-100 border border-yellow-300 text-yellow-800 flex items-center justify-center shadow-sm hover:bg-yellow-200 z-10`}
            title={`${element.comments.length} comment${element.comments.length > 1 ? 's' : ''}`}
            onClick={(e) => { e.stopPropagation(); setActiveCommentElementId(element.id); }}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Element Type Label - Much Clearer */}
        {!isPreviewMode && isEditing && (
          <div className={`absolute ${isMobile ? 'top-0 left-0' : '-left-32 top-0'} opacity-100 transition-opacity z-10`}>
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
          <div className={`absolute ${isMobile ? 'top-full left-0 mt-2 w-full' : `-right-32 ${dropdownDirection[element.id] === 'up' ? 'bottom-0' : 'top-0'}`} flex flex-col space-y-2 z-50`}>
            <div className={`bg-white border-2 border-gray-300 rounded-lg p-2 shadow-lg ${isMobile ? 'w-full' : ''}`}>
              <div className="text-xs font-semibold text-gray-700 mb-2">Change Type:</div>
              <div className={`flex ${isMobile ? 'flex-row flex-wrap' : 'flex-col'} gap-1`}>
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
        <div className="flex-1 bg-gray-100 p-4 sm:p-6 flex flex-col lg:flex-row relative">
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
                
                {/* Stable Versions Panel Toggle */}
                <button
                  onClick={() => {
                    // Toggle stable versions panel visibility
                    const panel = document.getElementById('stable-versions-panel');
                    if (panel) {
                      panel.classList.toggle('hidden');
                    }
                  }}
                  className="w-12 h-12 rounded-md bg-indigo-600 hover:bg-indigo-700 shadow text-white flex items-center justify-center"
                  title="Stable Versions"
                  aria-label="Toggle stable versions panel"
                >
                  <History className="w-5 h-5" />
                </button>
                
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

          <div className="flex-1 overflow-auto relative">
            <div className={`${isMobile ? 'w-full px-[5px]' : 'max-w-4xl mx-auto'}`}>
          <div
            ref={editorRef}
            style={pageStyles}
            className={`bg-white ${isMobile ? 'shadow-none' : 'shadow-2xl'}`}
          >

            {/* Title */}
            <div className="text-center mb-12">
              {!isPreviewMode ? (
                <input
                  type="text"
                  value={getCurrentTitle()}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  className="text-3xl font-bold text-black text-center bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none w-full transition-colors"
                  placeholder="Untitled Screenplay"
                  style={{ direction: 'ltr', color: '#000000' }}
                  dir="ltr"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
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

          {/* Stable Versions Panel */}
          {!isPreviewMode && (
            <div
              id="stable-versions-panel"
              className="hidden lg:block w-full mt-4 lg:mt-0 lg:w-80 lg:ml-6 lg:sticky top-4 self-start bg-gray-900 border border-gray-800 rounded-lg shadow-sm h-fit max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 className="text-sm font-semibold text-gray-300">Stable Versions</h3>
                <button
                  onClick={handleSaveVersion}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-medium flex items-center space-x-1"
                  title="Save current state as a stable version"
                >
                  <Save className="w-3 h-3" />
                  <span>Save</span>
                </button>
              </div>
              <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
                {stableVersions.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500 text-xs text-center">No stable versions saved yet.<br />Click &quot;Save&quot; to create one.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stableVersions
                      .sort((a, b) => {
                        const getDate = (d: unknown): Date => {
                          if (d instanceof Date) return d;
                          if (typeof d === 'number') return new Date(d);
                          if (typeof d === 'string') return new Date(d);
                          if (d && typeof d === 'object' && 'toDate' in d) {
                            return (d as { toDate: () => Date }).toDate();
                          }
                          return new Date();
                        };
                        return getDate(b.createdAt).getTime() - getDate(a.createdAt).getTime();
                      })
                      .map((version) => (
                        <div key={version.id} className="bg-gray-800 border border-gray-700 rounded-md p-3 shadow-sm">
                          {editingVersionName === version.id ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="text"
                                value={tempVersionName}
                                onChange={(e) => setTempVersionName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateVersionName(version.id, tempVersionName);
                                  } else if (e.key === 'Escape') {
                                    setEditingVersionName(null);
                                    setTempVersionName('');
                                  }
                                }}
                                onBlur={() => {
                                  if (tempVersionName.trim()) {
                                    handleUpdateVersionName(version.id, tempVersionName);
                                  } else {
                                    setEditingVersionName(null);
                                    setTempVersionName('');
                                  }
                                }}
                                className="flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                autoFocus
                              />
                              <button
                                onClick={() => handleUpdateVersionName(version.id, tempVersionName)}
                                className="p-1 text-green-500 hover:text-green-400"
                                title="Save name"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingVersionName(null);
                                  setTempVersionName('');
                                }}
                                className="p-1 text-red-500 hover:text-red-400"
                                title="Cancel"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex-1 min-w-0">
                                  <p
                                    className="text-xs font-medium text-gray-200 truncate cursor-pointer hover:text-indigo-400"
                                    onClick={() => {
                                      setEditingVersionName(version.id);
                                      setTempVersionName(version.name);
                                    }}
                                    title="Click to rename"
                                  >
                                    {version.name}
                                  </p>
                                  <p className="text-[10px] text-gray-500 mt-0.5">
                                    Saved: {(() => {
                                      let date: Date;
                                      if (version.createdAt instanceof Date) {
                                        date = version.createdAt;
                                      } else if (typeof version.createdAt === 'number') {
                                        date = new Date(version.createdAt);
                                      } else if (typeof version.createdAt === 'string') {
                                        date = new Date(version.createdAt);
                                      } else if (version.createdAt && typeof version.createdAt === 'object' && 'toDate' in version.createdAt) {
                                        date = (version.createdAt as { toDate: () => Date }).toDate();
                                      } else {
                                        date = new Date();
                                      }
                                      return date.toLocaleDateString('en-US', { 
                                        month: 'short', 
                                        day: 'numeric', 
                                        year: 'numeric' 
                                      }) + ' ' + date.toLocaleTimeString('en-US', { 
                                        hour: '2-digit', 
                                        minute: '2-digit' 
                                      });
                                    })()}
                                  </p>
                                </div>
                                <div className="flex items-center space-x-1 ml-2">
                                  <button
                                    onClick={() => {
                                      setEditingVersionName(version.id);
                                      setTempVersionName(version.name);
                                    }}
                                    className="p-1 text-gray-400 hover:text-white"
                                    title="Rename version"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setVersionToRestore(version)}
                                    className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-sm"
                                    title="Restore this version"
                                  >
                                    <History className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteVersion(version.id)}
                                    className="p-1 text-red-500 hover:text-red-400"
                                    title="Delete version"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Comments Panel - Right side, positioned at same level as commented element (Google Docs style) */}
          {!isPreviewMode && activeCommentElementId && (
            <div
              ref={commentsPanelRef}
              className="hidden lg:block w-full mt-4 lg:mt-0 lg:w-80 lg:ml-6 lg:absolute bg-white border border-gray-200 rounded-lg shadow-lg h-fit max-h-[80vh] overflow-auto z-10"
              style={{ top: `${commentsPanelTop}px`, right: '1.5rem' }}
            >
              <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
                <h4 className="font-medium text-gray-800 text-sm">Comments</h4>
                <button
                  className="text-gray-500 hover:text-gray-700 text-xs"
                  onClick={() => setActiveCommentElementId(null)}
                >
                  Close
                </button>
              </div>
              <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                {(getCurrentElements().find(e => e.id === activeCommentElementId)?.comments || []).map((c) => (
                  <div key={c.id} className="border border-gray-200 rounded p-2 bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-medium text-gray-700">
                        {c.author || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </div>
                    </div>
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
              <div className="border-t border-gray-200 p-3 bg-gray-50">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addCommentToElement(activeCommentElementId!, e.target.files)} />
                    Attach images
                  </label>
                  <button
                    disabled={isUploading || newCommentText.trim().length === 0}
                    onClick={() => addCommentToElement(activeCommentElementId!)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      isUploading || newCommentText.trim().length === 0
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isUploading ? 'Uploading...' : 'Comment'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Restore Version Confirmation Dialog */}
          {versionToRestore && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg max-w-md w-full mx-4 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Restore Stable Version</h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to restore &quot;{versionToRestore.name}&quot;? This will override your current screenplay state.
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={handleRestoreVersion}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => setVersionToRestore(null)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
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