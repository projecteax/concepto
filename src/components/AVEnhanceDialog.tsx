'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Send, 
  Loader2,
  Sparkles,
  Check
} from 'lucide-react';
import { AVShot, EnhancementMessage, EnhancementThread } from '@/types';

interface AVEnhanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEnhancementComplete: (selectedText: string, thread: EnhancementThread) => void;
  shot: AVShot;
}

export function AVEnhanceDialog({
  isOpen,
  onClose,
  onEnhancementComplete,
  shot,
}: AVEnhanceDialogProps) {
  const [messages, setMessages] = useState<EnhancementMessage[]>([]);
  const [editablePrompt, setEditablePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAlternatives, setGeneratedAlternatives] = useState<string[]>([]);
  const [originalText, setOriginalText] = useState<string>('');
  const [selectedAlternative, setSelectedAlternative] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const defaultPrompt = `Rewrite text and make it more casual and fun`;

  // Initialize from thread when dialog opens
  useEffect(() => {
    if (isOpen) {
      setEditablePrompt(defaultPrompt);
      setSelectedAlternative(null);
      
      // Load existing data from thread
      if (shot.enhancementThread) {
        // Ensure all loaded messages have unique IDs (fix any duplicates from storage)
        const loadedMessages = (shot.enhancementThread.messages || []).map((msg, index) => ({
          ...msg,
          id: msg.id.includes('-') && !msg.id.match(/[a-z0-9]{9}$/) 
            ? `${msg.id}-${Math.random().toString(36).substr(2, 9)}-${index}`
            : msg.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`
        }));
        setMessages(loadedMessages);
        setGeneratedAlternatives(shot.enhancementThread.alternatives || []);
        setOriginalText(shot.enhancementThread.originalText || shot.audio);
      } else {
        // First time opening - initialize with current shot audio
        setMessages([]);
        setGeneratedAlternatives([]);
        setOriginalText(shot.audio);
      }
    }
  }, [isOpen, shot.enhancementThread, shot.audio]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generatedAlternatives]);

  const handleGenerate = async () => {
    if (!editablePrompt.trim()) {
      alert('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    
    try {
      // Add user message - use unique ID with random component
      const userMessage: EnhancementMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-user`,
        role: 'user',
        content: editablePrompt,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      // Call enhance API - use originalText if available, otherwise current shot audio
      const textToEnhance = originalText || shot.audio;
      const response = await fetch('/api/gemini/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editablePrompt,
          text: textToEnhance,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      if (!data.alternatives || !Array.isArray(data.alternatives) || data.alternatives.length === 0) {
        throw new Error(data.error || 'No alternatives returned from server');
      }

      const alternatives = data.alternatives.slice(0, 3); // Ensure max 3
      // Add new alternatives to existing ones instead of replacing
      setGeneratedAlternatives(prev => {
        const newAlternatives = [...prev, ...alternatives];
        
        // Add assistant message with correct count - use unique ID with random component
        const assistantMessage: EnhancementMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-assistant`,
          role: 'assistant',
          content: `Generated ${alternatives.length} more alternative versions (${newAlternatives.length} total). Please select one to insert.`,
          createdAt: new Date(),
        };
        setMessages(msgPrev => [...msgPrev, assistantMessage]);
        
        // Update thread with new alternatives (this will be saved when inserting)
        return newAlternatives;
      });
    } catch (error: unknown) {
      console.error('Error generating enhancement:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate enhancement. Please try again.';
      alert(errorMessage);
      
      // Add error message - use unique ID with random component
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-error`,
        role: 'assistant',
        content: `Error: ${errorMessage}`,
        createdAt: new Date(),
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertText = () => {
    if (selectedAlternative === null || !generatedAlternatives[selectedAlternative]) {
      alert('Please select an alternative to insert');
      return;
    }
    
    const selectedText = generatedAlternatives[selectedAlternative];
    
    // Create updated thread with all messages, alternatives, and original text
    const updatedThread: EnhancementThread = {
      messages: [
        ...messages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-selected`,
          role: 'assistant' as const,
          content: `Selected alternative ${selectedAlternative + 1}: "${selectedText.substring(0, 50)}..."`,
          createdAt: new Date(),
        }
      ],
      alternatives: generatedAlternatives, // Store all alternatives
      originalText: originalText, // Store original text
      createdAt: shot.enhancementThread?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    
    onEnhancementComplete(selectedText, updatedThread);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Enhance Text
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
          {/* Original Text - Editable */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Original Text (editable)</h3>
            <textarea
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none text-sm"
              placeholder="Enter or edit the original text..."
            />
          </div>

          {/* Generated Alternatives */}
          {generatedAlternatives.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700">
                  Generated Alternatives ({generatedAlternatives.length} total)
                </h3>
                <button
                  onClick={handleInsertText}
                  disabled={selectedAlternative === null}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                  <Check className="w-4 h-4" />
                  Insert Selected
                </button>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {generatedAlternatives.map((alt, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedAlternative(index)}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      selectedAlternative === index
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selectedAlternative === index
                          ? 'border-indigo-600 bg-indigo-600'
                          : 'border-gray-400'
                      }`}>
                        {selectedAlternative === index && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          Alternative {index + 1}
                        </div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{alt}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat Messages - Hidden, only stored for thread history */}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t bg-gray-50">
          {/* Editable Prompt */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enhancement Prompt (editable)
            </label>
            <textarea
              value={editablePrompt}
              onChange={(e) => setEditablePrompt(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-mono text-sm"
              placeholder="Enter enhancement instructions..."
              disabled={isGenerating}
            />
          </div>

          {/* Generate Button */}
          <div className="flex items-center justify-end">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !editablePrompt.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Generate Alternatives
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

