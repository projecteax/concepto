'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

interface ImportedShot {
  order: string; // e.g., "1.1", "1.2"
  take: string; // e.g., "SC01T01"
  audio: string;
  visual: string;
  time: string; // e.g., "0:04:00"
  segmentNumber: number; // Extracted from order
}

interface ImportAVDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (shots: ImportedShot[]) => void;
}

export function ImportAVDialog({ isOpen, onClose, onImport }: ImportAVDialogProps) {
  const [importedShots, setImportedShots] = useState<ImportedShot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (time: string): string => {
    // Normalize time format: "0:04:00" -> "00:04:00" (MM:SS:FF)
    const parts = time.split(':');
    if (parts.length === 3) {
      const mins = parts[0].padStart(2, '0');
      const secs = parts[1].padStart(2, '0');
      const frames = parts[2].padStart(2, '0');
      return `${mins}:${secs}:${frames}`;
    }
    return time;
  };

  const parseCSV = (csvText: string): ImportedShot[] => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Parse header - handle quoted headers
    const headerLine = lines[0];
    const headerValues: string[] = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let j = 0; j < headerLine.length; j++) {
      const char = headerLine[j];
      const nextChar = j < headerLine.length - 1 ? headerLine[j + 1] : '';
      
      if (char === '"') {
        if (nextChar === '"' && inQuotes) {
          currentValue += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        headerValues.push(currentValue.trim().toLowerCase().replace(/^"|"$/g, ''));
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    headerValues.push(currentValue.trim().toLowerCase().replace(/^"|"$/g, ''));
    
    const orderIndex = headerValues.indexOf('order');
    const takeIndex = headerValues.indexOf('take');
    const audioIndex = headerValues.indexOf('audio');
    const visualIndex = headerValues.indexOf('visual');
    const timeIndex = headerValues.indexOf('time');

    if (orderIndex === -1 || takeIndex === -1 || audioIndex === -1 || visualIndex === -1 || timeIndex === -1) {
      throw new Error('CSV must contain columns: order, take, audio, visual, time');
    }

    const shots: ImportedShot[] = [];
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle CSV with quoted fields that may contain commas
      const values: string[] = [];
      let currentValue = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const nextChar = j < line.length - 1 ? line[j + 1] : '';
        
        if (char === '"') {
          // Handle escaped quotes ("")
          if (nextChar === '"' && inQuotes) {
            currentValue += '"';
            j++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim()); // Add last value
      
      // Remove surrounding quotes from values
      const cleanedValues = values.map(v => {
        if (v.startsWith('"') && v.endsWith('"')) {
          return v.slice(1, -1).replace(/""/g, '"');
        }
        return v;
      });

      if (cleanedValues.length < 5) continue;

      const order = cleanedValues[orderIndex]?.trim() || '';
      const take = cleanedValues[takeIndex]?.trim() || '';
      const audio = cleanedValues[audioIndex]?.trim() || '';
      const visual = cleanedValues[visualIndex]?.trim() || '';
      const time = cleanedValues[timeIndex]?.trim() || '';

      // Skip empty rows
      if (!order && !take && !audio && !visual) continue;

      // Extract segment number from order (e.g., "1.1" -> 1, "2.5" -> 2)
      const orderMatch = order.match(/^(\d+)\./);
      const segmentNumber = orderMatch ? parseInt(orderMatch[1], 10) : 1;

      shots.push({
        order,
        take,
        audio,
        visual,
        time: formatTime(time), // Normalize time format
        segmentNumber,
      });
    }

    return shots;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const text = await file.text();
      const shots = parseCSV(text);
      
      if (shots.length === 0) {
        throw new Error('No valid shots found in CSV file');
      }

      setImportedShots(shots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      setImportedShots([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = () => {
    if (importedShots.length === 0) {
      setError('No shots to import');
      return;
    }
    onImport(importedShots);
    onClose();
    // Reset state
    setImportedShots([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Import AV Script from CSV</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload CSV File
            </label>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Choose CSV File</span>
              </label>
              {isProcessing && (
                <span className="text-sm text-gray-600">Processing...</span>
              )}
              {importedShots.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{importedShots.length} shots loaded</span>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Table */}
          {importedShots.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Order</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Take</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Audio</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Visual</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {importedShots.map((shot, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900 font-mono">{shot.order}</td>
                        <td className="px-4 py-3 text-gray-900 font-mono">{shot.take}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-md">{shot.audio || <span className="text-gray-400 italic">No audio</span>}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-md">{shot.visual || <span className="text-gray-400 italic">No visual</span>}</td>
                        <td className="px-4 py-3 text-gray-900 font-mono">{formatTime(shot.time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importedShots.length === 0 && !error && !isProcessing && (
            <div className="text-center py-12 text-gray-500">
              <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Upload a CSV file to import AV script data</p>
              <p className="text-sm mt-2">Expected format: order, take, audio, visual, time</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importedShots.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Auto-populate AV Script</span>
          </button>
        </div>
      </div>
    </div>
  );
}

