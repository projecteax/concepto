'use client';

import React from 'react';
import { X, Wand2, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TranslationConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fromLanguage: 'PL' | 'EN';
  toLanguage: 'PL' | 'EN';
}

export function TranslationConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  fromLanguage,
  toLanguage,
}: TranslationConfirmationDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Languages className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Translate Screenplay</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700 mb-1">{fromLanguage}</div>
              <div className="text-sm text-gray-500">From</div>
            </div>
            <Wand2 className="w-6 h-6 text-purple-600" />
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600 mb-1">{toLanguage}</div>
              <div className="text-sm text-gray-500">To</div>
            </div>
          </div>

          <p className="text-gray-700 mb-4 text-center">
            This will automatically translate your screenplay from <strong>{fromLanguage === 'PL' ? 'Polish' : 'English'}</strong> to <strong>{toLanguage === 'PL' ? 'Polish' : 'English'}</strong>.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> The translation will preserve all element types (Scene Setting, Character, Dialogue, etc.) and structure. 
              You can review and edit the translation after it's generated.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="bg-purple-600 hover:bg-purple-700">
            <Wand2 className="w-4 h-4 mr-2" />
            Translate
          </Button>
        </div>
      </div>
    </div>
  );
}
