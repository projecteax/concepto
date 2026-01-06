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

interface AVSegment {
  id: string;
  segmentNumber: number;
  title: string;
}

interface ImportAVDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (shots: ImportedShot[], targetSegmentId: string | null) => void;
  availableSegments?: AVSegment[];
}

export function ImportAVDialog({ isOpen, onClose, onImport, availableSegments = [] }: ImportAVDialogProps) {
  const [importedShots, setImportedShots] = useState<ImportedShot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetSegmentId, setTargetSegmentId] = useState<string | null>(null);
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

  const parseSRT = (srtText: string): ImportedShot[] => {
    const lines = srtText.split('\n');
    const shots: ImportedShot[] = [];
    let i = 0;
    let shotIndex = 1; // For generating order numbers

    while (i < lines.length) {
      // Skip empty lines
      while (i < lines.length && !lines[i].trim()) {
        i++;
      }
      if (i >= lines.length) break;

      // Line 1: Subtitle number (ignore)
      const numLine = lines[i].trim();
      if (!/^\d+$/.test(numLine)) {
        i++;
        continue;
      }
      i++;

      // Line 2: Timecode "00:00:00,000 --> 00:00:05,500"
      if (i >= lines.length) break;
      const timecodeLine = lines[i].trim();
      const timecodeMatch = timecodeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
      if (!timecodeMatch) {
        i++;
        continue;
      }

      // Parse start and end times
      const startH = parseInt(timecodeMatch[1], 10);
      const startM = parseInt(timecodeMatch[2], 10);
      const startS = parseInt(timecodeMatch[3], 10);
      const startMs = parseInt(timecodeMatch[4], 10);
      const endH = parseInt(timecodeMatch[5], 10);
      const endM = parseInt(timecodeMatch[6], 10);
      const endS = parseInt(timecodeMatch[7], 10);
      const endMs = parseInt(timecodeMatch[8], 10);

      const startTotalMs = (startH * 3600 + startM * 60 + startS) * 1000 + startMs;
      const endTotalMs = (endH * 3600 + endM * 60 + endS) * 1000 + endMs;
      const durationMs = endTotalMs - startTotalMs;
      const durationSec = durationMs / 1000.0;

      // Convert to MM:SS:FF format (assuming 24fps)
      const totalFrames = Math.round(durationSec * 24);
      const frames = totalFrames % 24;
      const totalSeconds = Math.floor(totalFrames / 24);
      const seconds = totalSeconds % 60;
      const minutes = Math.floor(totalSeconds / 60);
      const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;

      i++;

      // Line 3+: Text content (may span multiple lines)
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        textLines.push(lines[i].trim());
        i++;
      }
      const fullText = textLines.join(' ');

      // Extract take and visual description from text like "[SC01T01] - Visual description"
      const takeMatch = fullText.match(/\[?\s*(SC\d{2}T\d{2})\s*\]?\s*-?\s*(.*)/i);
      if (!takeMatch) {
        // No take pattern found, skip or use default
        i++;
        continue;
      }

      const take = takeMatch[1]; // e.g., "SC01T01"
      const visual = takeMatch[2].trim(); // Visual description after the take number

      // Extract segment number from take (SC01 -> segment 1)
      const segmentMatch = take.match(/SC(\d{2})/);
      const segmentNumber = segmentMatch ? parseInt(segmentMatch[1], 10) : 1;

      // Generate order number (segment.shotIndex)
      const order = `${segmentNumber}.${shotIndex}`;

      shots.push({
        order,
        take,
        audio: '', // SRT doesn't contain audio info
        visual,
        time: timeStr,
        segmentNumber,
      });

      shotIndex++;
    }

    return shots;
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
      const fileName = file.name.toLowerCase();
      
      let shots: ImportedShot[];
      if (fileName.endsWith('.srt')) {
        shots = parseSRT(text);
        if (shots.length === 0) {
          throw new Error('No valid shots found in SRT file. Expected format: [SC01T01] - Visual description');
        }
      } else if (fileName.endsWith('.csv')) {
        shots = parseCSV(text);
        if (shots.length === 0) {
          throw new Error('No valid shots found in CSV file');
        }
      } else {
        throw new Error('Unsupported file format. Please upload a CSV or SRT file.');
      }

      setImportedShots(shots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
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
    if (availableSegments.length > 0 && !targetSegmentId) {
      setError('Please select a target segment');
      return;
    }
    onImport(importedShots, targetSegmentId);
    onClose();
    // Reset state
    setImportedShots([]);
    setTargetSegmentId(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] flex flex-col m-0 sm:m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-6 border-b border-gray-200">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Import AV Script (CSV or SRT)</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3 sm:p-6">
          {/* Target Segment Selection */}
          {availableSegments.length > 0 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Target Segment / Scene
              </label>
              <select
                value={targetSegmentId || ''}
                onChange={(e) => setTargetSegmentId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">-- Select a segment --</option>
                {availableSegments
                  .sort((a, b) => a.segmentNumber - b.segmentNumber)
                  .map((segment) => (
                    <option key={segment.id} value={segment.id}>
                      Scene {segment.segmentNumber.toString().padStart(2, '0')}: {segment.title}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Choose which segment to add the imported shots to. If not selected, shots will be added to their original segments.
              </p>
            </div>
          )}

          {/* File Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload File (CSV or SRT)
            </label>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.srt"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Choose File</span>
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
              <div className="overflow-x-auto max-h-[50vh] sm:max-h-[60vh]" style={{ scrollbarWidth: 'thin', msOverflowStyle: 'auto' }}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Order</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Take</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Audio</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Visual</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200">Duration</th>
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
              <p>Upload a CSV or SRT file to import AV script data</p>
              <p className="text-sm mt-2">CSV format: order, take, audio, visual, time</p>
              <p className="text-sm mt-1">SRT format: [SC01T01] - Visual description (duration from timestamps)</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 p-3 sm:p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={importedShots.length === 0 || (availableSegments.length > 0 && !targetSegmentId)}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Auto-populate AV Script</span>
          </button>
        </div>
      </div>
    </div>
  );
}

