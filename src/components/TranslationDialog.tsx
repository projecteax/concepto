'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Loader2,
  Wand2,
  Check
} from 'lucide-react';
import { ScreenplayData } from '@/types';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface TranslationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onTranslationComplete: (translatedText: string) => void;
  screenplayData: ScreenplayData;
  fromLanguage?: 'PL' | 'EN';
  toLanguage?: 'PL' | 'EN';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export function TranslationDialog({
  isOpen,
  onClose,
  onTranslationComplete,
  screenplayData,
  fromLanguage = 'PL',
  toLanguage = 'EN',
}: TranslationDialogProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [editablePrompt, setEditablePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const defaultPrompt = fromLanguage === 'PL' && toLanguage === 'EN'
    ? `Translate to english. This is a script for tv show For dialogues use a natural, expressive, slightly exaggerated tone — like friendly cartoon dialogue (e.g. Paw Patrol). Keep it casual, lively, and emotional.`
    : `Translate to polish. This is a script for tv show. For dialogues use a natural, expressive, slightly exaggerated tone — like friendly cartoon dialogue. Keep it casual, lively, and emotional.`;

  // Initialize prompt when dialog opens
  useEffect(() => {
    if (isOpen) {
      const prompt = fromLanguage === 'PL' && toLanguage === 'EN'
        ? `Translate to english. This is a script for tv show For dialogues use a natural, expressive, slightly exaggerated tone — like friendly cartoon dialogue (e.g. Paw Patrol). Keep it casual, lively, and emotional.`
        : `Translate to polish. This is a script for tv show. For dialogues use a natural, expressive, slightly exaggerated tone — like friendly cartoon dialogue. Keep it casual, lively, and emotional.`;
      setEditablePrompt(prompt);
      setMessages([]);
      setGeneratedText(null);
    }
  }, [isOpen, fromLanguage, toLanguage]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generatedText]);

  const buildScreenplayText = (): string => {
    // Build the screenplay text from elements based on source language
    let text = '';
    const sourceElements = fromLanguage === 'PL' 
      ? screenplayData.elements 
      : (screenplayData.elementsEN || screenplayData.elements);
    
    sourceElements.forEach((element) => {
      // Add element type marker for better context
      // Convert scene-setting to SCENE-SETTING, etc.
      const typeUpper = element.type.toUpperCase().replace(/_/g, '-');
      const typeMarker = `[${typeUpper}]`;
      text += `${typeMarker}\n${element.content}\n\n`;
    });

    return text.trim();
  };

  const handleGenerate = async () => {
    if (!editablePrompt.trim()) {
      alert('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    
    try {
      const polishText = buildScreenplayText();
      
      // Add user message
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: editablePrompt,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      // Show initial progress
      setProgress({ current: 0, total: 1 });

      // Call translation API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      try {
        const response = await fetch('/api/gemini/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: editablePrompt,
            polishText: polishText,
            screenplayTitle: screenplayData.title,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.translatedText) {
          throw new Error(data.error || 'No translation returned from server');
        }

        const translatedText = data.translatedText;
        setGeneratedText(translatedText);
        setProgress(null);

        // Add assistant message
        const chunksInfo = data.chunksProcessed && data.totalChunks > 1
          ? ` (processed ${data.chunksProcessed} chunks)`
          : '';
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `Translation completed${chunksInfo}! Review the text above and click "Insert Text" to apply it.`,
          createdAt: new Date(),
        }]);
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Translation request timed out. The screenplay is very long. Please try again or contact support.');
        }
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate translation. Please try again.';
      console.error('Error generating translation:', error);
      alert(errorMessage);
      
      // Add error message
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${errorMessage}`,
        createdAt: new Date(),
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertText = () => {
    if (!generatedText) {
      alert('No translation to insert');
      return;
    }
    
    onTranslationComplete(generatedText);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            Translate Screenplay ({fromLanguage} → {toLanguage})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Progress Indicator */}
          {progress && progress.total > 1 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  Processing chunk {progress.current} of {progress.total}...
                </span>
                <div className="w-48 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Generated Text Preview */}
          {generatedText && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700">Generated Translation</h3>
                <Button
                  onClick={handleInsertText}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="w-4 h-4 mr-1" />
                  Insert Text
                </Button>
              </div>
              <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm font-mono text-gray-900">
                  {generatedText}
                </pre>
              </div>
            </div>
          )}

          {/* Chat Messages */}
          {messages.length > 0 && (
            <div className="space-y-4 mb-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t bg-gray-50">
          {/* Editable Prompt */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Translation Prompt (editable)
            </label>
            <textarea
              value={editablePrompt}
              onChange={(e) => setEditablePrompt(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-mono text-sm"
              placeholder="Enter translation instructions..."
              disabled={isGenerating}
            />
          </div>

          {/* Generate Button */}
          <div className="flex items-center justify-end">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !editablePrompt.trim()}
              className="w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Generate Translation
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

