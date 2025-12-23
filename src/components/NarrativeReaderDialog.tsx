'use client';

import React, { useMemo } from 'react';
import { X, BookOpen, Clock } from 'lucide-react';

type NarrativeReaderDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  text: string;
  meta?: {
    wordCount?: number;
    createdAt?: Date;
    language?: 'PL' | 'EN';
    sourceLabel?: string;
  };
};

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function NarrativeReaderDialog({ isOpen, onClose, title, text, meta }: NarrativeReaderDialogProps) {
  const paragraphs = useMemo(() => splitParagraphs(text), [text]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-purple-600" />
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-gray-900 truncate">{title}</h2>
              <div className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-2">
                {meta?.language && <span>{meta.language}</span>}
                {meta?.wordCount !== undefined && <span>• {meta.wordCount} words</span>}
                {meta?.sourceLabel && <span>• {meta.sourceLabel}</span>}
                {meta?.createdAt && (
                  <span className="inline-flex items-center gap-1">
                    • <Clock className="w-3 h-3" /> {meta.createdAt.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 bg-gray-50">
          <div className="mx-auto max-w-2xl bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-8">
            <div className="text-center mb-6">
              <div className="text-2xl font-semibold text-gray-900">{title}</div>
              <div className="mt-2 h-px bg-gray-200" />
            </div>

            <div className="text-gray-800 leading-7 text-lg font-serif space-y-5">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, idx) => (
                  <p key={idx} className={idx === 0 ? 'first-letter:text-4xl first-letter:font-semibold first-letter:mr-1 first-letter:float-left' : ''}>
                    {p}
                  </p>
                ))
              ) : (
                <p>{text}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


