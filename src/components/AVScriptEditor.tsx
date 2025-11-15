'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AVScript, AVSegment, AVShot, GlobalAsset, ScreenplayData } from '@/types';
import { 
  Plus, 
  Image as ImageIcon,
  GripVertical,
  X,
  ZoomIn,
  Trash2,
  AlertTriangle,
  Volume2,
  Upload,
  Play,
  Pause,
  Loader2,
  Sparkles,
  MapPin,
  Edit3,
  Save,
  Download,
  Key,
  Package
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import CommentThread from './CommentThread';
import { ImageGenerationDialog } from './ImageGenerationDialog';
import { AVEnhanceDialog } from './AVEnhanceDialog';
import { AutoPopulateDialog } from './AutoPopulateDialog';
import { ImportAVDialog } from './ImportAVDialog';
import { ApiKeyDialog } from './ApiKeyDialog';

interface AVScriptEditorProps {
  episodeId: string;
  avScript?: AVScript;
  onSave: (avScript: AVScript) => void | Promise<void>;
  onSaveImmediately?: (avScript: AVScript) => void | Promise<void>;
  globalAssets?: GlobalAsset[];
  screenplayData?: ScreenplayData;
  showId?: string;
}

export function AVScriptEditor({ 
  episodeId, 
  avScript, 
  onSave,
  onSaveImmediately,
  globalAssets = [],
  screenplayData,
  showId = '',
}: AVScriptEditorProps) {
  const [script, setScript] = useState<AVScript>(avScript || {
    id: `av-script-${Date.now()}`,
    episodeId,
    title: 'BT AV script',
    version: 'v1',
    segments: [],
    totalRuntime: 0,
    totalWords: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const [showAddSegment, setShowAddSegment] = useState(false);
  const [newSegmentTitle, setNewSegmentTitle] = useState('');
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: 'segment' | 'shot' | 'image';
    id: string;
    segmentId?: string;
    title?: string;
  } | null>(null);
  const [showImageGenerationDialog, setShowImageGenerationDialog] = useState(false);
  const [currentShotForGeneration, setCurrentShotForGeneration] = useState<{
    segmentId: string;
    shotId: string;
  } | null>(null);
  const [showAutoPopulateDialog, setShowAutoPopulateDialog] = useState(false);
  const [showImportAVDialog, setShowImportAVDialog] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [isDownloadingPlugin, setIsDownloadingPlugin] = useState(false);
  const [isAnyPopupOpen, setIsAnyPopupOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autosaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const { uploadFile } = useS3Upload();

  // Handle Blender plugin download
  const handleDownloadPlugin = async () => {
    setIsDownloadingPlugin(true);
    try {
      const response = await fetch('/api/blender-plugin/download');
      
      if (!response.ok) {
        throw new Error('Failed to download plugin');
      }

      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'concepto_blender_plugin.zip';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading plugin:', error);
      alert('Failed to download Blender plugin. Please try again.');
    } finally {
      setIsDownloadingPlugin(false);
    }
  };

  // Sync avScript prop to state when it changes (e.g., when data loads from Firebase or real-time updates)
  // This ensures that when episode data loads from Firebase after component mount,
  // the component will update to show the latest saved script
  const hasInitializedRef = React.useRef(false);
  const lastSyncedAvScriptRef = React.useRef<string>('');
  
  useEffect(() => {
    if (avScript) {
      // Create a hash of the avScript to detect actual changes
      const avScriptHash = JSON.stringify({
        id: avScript.id,
        segmentsCount: avScript.segments?.length || 0,
        totalShots: avScript.segments?.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0) || 0,
        segmentIds: avScript.segments?.map(s => s.id).sort().join(',') || '',
        updatedAt: avScript.updatedAt instanceof Date ? avScript.updatedAt.getTime() : avScript.updatedAt,
      });
      
      // Only update if the script actually changed
      if (lastSyncedAvScriptRef.current !== avScriptHash) {
        setScript(currentScript => {
          const isFirstLoad = !hasInitializedRef.current;
          const isDifferentScript = currentScript.id !== avScript.id;
          const isDefaultEmptyScript = currentScript.id.startsWith('av-script-') && currentScript.segments.length === 0;
          
          console.log('🔄 Syncing AV Script from prop:', {
            currentId: currentScript.id,
            newId: avScript.id,
            currentSegments: currentScript.segments.length,
            newSegments: avScript.segments?.length || 0,
            isFirstLoad,
            isDifferentScript,
            isDefaultEmptyScript,
            hashChanged: lastSyncedAvScriptRef.current !== avScriptHash,
          });
          
          if (isFirstLoad || isDifferentScript || isDefaultEmptyScript || lastSyncedAvScriptRef.current !== avScriptHash) {
            hasInitializedRef.current = true;
            lastSyncedAvScriptRef.current = avScriptHash;
            return avScript;
          }
          return currentScript; // No change needed
        });
      } else {
        console.log('⏭️ AV Script prop changed but hash is the same - skipping sync');
      }
    } else {
      hasInitializedRef.current = true; // Mark as initialized even if no avScript
    }
  }, [avScript]); // Only depend on avScript prop - this will trigger when Firebase data loads

  // Ensure all shots have take numbers assigned
  useEffect(() => {
    let needsUpdate = false;
    const updatedSegments = script.segments.map(segment => {
      // First, collect all existing take numbers in this segment
      const existingTakes = segment.shots
        .map(s => s.take)
        .filter(take => take && take.startsWith(`SC${segment.segmentNumber.toString().padStart(2, '0')}T`))
        .map(take => {
          const match = take?.match(/SC\d+T(\d+)_image/);
          return match ? parseInt(match[1], 10) : 0;
        });
      
      let maxTakeNumber = existingTakes.length > 0 ? Math.max(...existingTakes, 0) : 0;
      
      const shotsWithTakes = segment.shots.map(shot => {
        // If shot doesn't have a take, generate one
        if (!shot.take) {
          needsUpdate = true;
          maxTakeNumber += 1;
          const takeNumber = maxTakeNumber.toString().padStart(2, '0');
          const sceneNumber = segment.segmentNumber.toString().padStart(2, '0');
          const take = `SC${sceneNumber}T${takeNumber}_image`;
          
          return {
            ...shot,
            take: take,
          };
        }
        return shot;
      });
      
      if (needsUpdate) {
        return {
          ...segment,
          shots: shotsWithTakes,
        };
      }
      return segment;
    });
    
    if (needsUpdate) {
      setScript(prev => ({
        ...prev,
        segments: updatedSegments,
        updatedAt: new Date(),
      }));
    }
  }, [script.segments]);

  // Calculate totals whenever script changes
  useEffect(() => {
    const totalWords = script.segments.reduce((sum, segment) => sum + segment.totalWords, 0);
    const totalRuntime = script.segments.reduce((sum, segment) => sum + segment.totalRuntime, 0);
    
    setScript(prev => ({
      ...prev,
      totalWords,
      totalRuntime,
      updatedAt: new Date(),
    }));
  }, [script.segments]);

  // Manual save handler - use immediate save if available for real-time sync
  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      // Use immediate save if available (for real-time sync), otherwise use regular save
      if (onSaveImmediately) {
        console.log('💾 Manual save using immediate save (real-time sync)');
        await onSaveImmediately(script);
      } else {
        console.log('💾 Manual save using regular save');
        await onSave(script);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving script:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save when script changes (10-second debounce for real-time, 30 seconds for regular)
  // Use shorter debounce when real-time sync is available (indicated by onSaveImmediately existing)
  // Increased to 10 seconds to significantly reduce Firebase writes (from 4k/hour to ~360/hour)
  const autosaveDelay = onSaveImmediately ? 10000 : 30000;
  
  // Track last saved script hash to prevent unnecessary saves
  const lastSavedScriptHashRef = React.useRef<string>('');
  
  useEffect(() => {
    // Create a lightweight hash of the script to detect actual changes
    const scriptHash = JSON.stringify({
      segmentsCount: script.segments.length,
      totalShots: script.segments.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0),
      segmentIds: script.segments.map(s => s.id).sort().join(','),
      // Only include first 100 chars of titles/audio to detect content changes without full serialization
      segmentTitles: script.segments.map(s => s.title?.substring(0, 100) || '').join('|'),
      firstShotAudios: script.segments.map(s => s.shots?.[0]?.audio?.substring(0, 100) || '').join('|'),
    });
    
    // Skip if nothing actually changed (prevents saves on re-renders)
    if (lastSavedScriptHashRef.current === scriptHash && lastSavedScriptHashRef.current !== '') {
      console.log('⏭️ Skipping autosave - script hash unchanged');
      return;
    }
    
    // Clear any existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Set new timeout
    autosaveTimeoutRef.current = setTimeout(async () => {
      // Double-check hash hasn't changed during the debounce period
      const currentHash = JSON.stringify({
        segmentsCount: script.segments.length,
        totalShots: script.segments.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0),
        segmentIds: script.segments.map(s => s.id).sort().join(','),
        segmentTitles: script.segments.map(s => s.title?.substring(0, 100) || '').join('|'),
        firstShotAudios: script.segments.map(s => s.shots?.[0]?.audio?.substring(0, 100) || '').join('|'),
      });
      
      if (lastSavedScriptHashRef.current === currentHash && lastSavedScriptHashRef.current !== '') {
        console.log('⏭️ Skipping autosave - script unchanged during debounce');
        return;
      }
      
      console.log('💾 Auto-saving AV Script (after', autosaveDelay / 1000, 'seconds):', {
        segments: script.segments.length,
        totalShots: script.segments.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0),
      });
      setIsSaving(true);
      try {
        await onSave(script);
        lastSavedScriptHashRef.current = currentHash; // Update saved hash
        setLastSavedAt(Date.now());
      } catch (error) {
        console.error('Error auto-saving script:', error);
      } finally {
        setIsSaving(false);
      }
    }, autosaveDelay);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.segments, script.title, script.version, onSave, autosaveDelay]);

  const handleAddSegment = () => {
    if (!newSegmentTitle.trim()) return;

    const newSegment: AVSegment = {
      id: `segment-${Date.now()}`,
      episodeId,
      segmentNumber: script.segments.length + 1,
      title: newSegmentTitle.trim(),
      shots: [],
      totalRuntime: 0,
      totalWords: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedScript = {
      ...script,
      segments: [...script.segments, newSegment],
    };
    setScript(updatedScript);
    // Don't save immediately - let autosave handle it
    // Reset autosave timer by triggering effect
    setNewSegmentTitle('');
    setShowAddSegment(false);
  };

  const handleAddShot = (segmentId: string) => {
    const segment = script.segments.find(s => s.id === segmentId);
    if (!segment) return;

    // Generate unique take number for this scene
    // Format: SC{segmentNumber}T{takeNumber}_image
    // Find the highest take number in this segment
    const existingTakes = segment.shots
      .map(shot => shot.take)
      .filter(take => take && take.startsWith(`SC${segment.segmentNumber.toString().padStart(2, '0')}T`))
      .map(take => {
        // Extract take number from format SC01T03_image
        const match = take.match(/SC\d+T(\d+)_image/);
        return match ? parseInt(match[1], 10) : 0;
      });
    
    const nextTakeNumber = existingTakes.length > 0 
      ? Math.max(...existingTakes) + 1 
      : 1;
    
    const takeNumber = nextTakeNumber.toString().padStart(2, '0');
    const sceneNumber = segment.segmentNumber.toString().padStart(2, '0');
    const take = `SC${sceneNumber}T${takeNumber}_image`;

    const newShot: AVShot = {
      id: `shot-${Date.now()}`,
      segmentId,
      shotNumber: 0, // Will be calculated
      take: take,
      audio: '',
      visual: '',
      duration: 0,
      wordCount: 0,
      runtime: 0,
      order: segment.shots.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedScript = {
      ...script,
      segments: script.segments.map(segment => 
        segment.id === segmentId 
          ? { 
              ...segment, 
              shots: [...segment.shots, newShot],
              updatedAt: new Date(),
            }
          : segment
      ),
    };
    setScript(updatedScript);
    // Don't save immediately - let autosave handle it
  };

  const handleUpdateShot = (segmentId: string, shotId: string, updates: Partial<AVShot>) => {
    const updatedScript = {
      ...script,
      segments: script.segments.map(segment => 
        segment.id === segmentId 
          ? {
              ...segment,
              shots: segment.shots.map(shot => 
                shot.id === shotId 
                  ? { 
                      ...shot, 
                      ...updates, 
                      updatedAt: new Date(),
                      wordCount: updates.audio !== undefined ? calculateWordCount(updates.audio) : shot.wordCount,
                      runtime: updates.audio !== undefined ? calculateRuntime(updates.audio) : shot.runtime,
                    }
                  : shot
              ),
              updatedAt: new Date(),
            }
          : segment
      ),
    };
    setScript(updatedScript);
    // Don't save immediately - let autosave handle it (10 second debounce)
    // This prevents saving on every keystroke, reducing Firebase writes significantly
  };

  const handleDeleteSegment = async (segmentId: string) => {
    const updatedScript = {
      ...script,
      segments: script.segments.filter(segment => segment.id !== segmentId),
    };
    setScript(updatedScript);
    setDeleteConfirmation(null);
    // Save immediately for deletions (critical operation)
    try {
      if (onSaveImmediately) {
        await onSaveImmediately(updatedScript);
      } else {
        await onSave(updatedScript);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving after deletion:', error);
    }
  };

  const handleDeleteShot = async (segmentId: string, shotId: string) => {
    const updatedScript = {
      ...script,
      segments: script.segments.map(segment => 
        segment.id === segmentId 
          ? {
              ...segment,
              shots: segment.shots.filter(shot => shot.id !== shotId),
              updatedAt: new Date(),
            }
          : segment
      ),
    };
    setScript(updatedScript);
    setDeleteConfirmation(null);
    // Save immediately for deletions (critical operation)
    try {
      if (onSaveImmediately) {
        await onSaveImmediately(updatedScript);
      } else {
        await onSave(updatedScript);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving after deletion:', error);
    }
  };

  const handleDeleteImage = async (segmentId: string, shotId: string) => {
    const updatedScript = {
      ...script,
      segments: script.segments.map(segment => 
        segment.id === segmentId 
          ? {
              ...segment,
              shots: segment.shots.map(shot => 
                shot.id === shotId 
                  ? { 
                      ...shot, 
                      imageUrl: undefined,
                      imageGenerationThread: undefined, // Clear conversation thread when deleting image
                      updatedAt: new Date(),
                    }
                  : shot
              ),
              updatedAt: new Date(),
            }
          : segment
      ),
    };
    setScript(updatedScript);
    setDeleteConfirmation(null);
    // Save immediately for deletions (critical operation)
    try {
      if (onSaveImmediately) {
        await onSaveImmediately(updatedScript);
      } else {
        await onSave(updatedScript);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving after image deletion:', error);
    }
  };


  const [draggedShot, setDraggedShot] = useState<{shot: AVShot, segmentId: string, index: number} | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, shot: AVShot, segmentId: string, index: number) => {
    // Prevent dragging if clicking on interactive elements (buttons, inputs, etc.)
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, [role="button"]')) {
      e.preventDefault();
      return;
    }
    setDraggedShot({ shot, segmentId, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', shot.id);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number, segmentId: string) => {
    e.preventDefault();
    
    if (!draggedShot || draggedShot.segmentId !== segmentId) {
      setDraggedShot(null);
      setDragOverIndex(null);
      return;
    }

    const segment = script.segments.find(s => s.id === segmentId);
    if (!segment) {
      setDraggedShot(null);
      setDragOverIndex(null);
      return;
    }

    const shots = Array.from(segment.shots);
    const [movedShot] = shots.splice(draggedShot.index, 1);
    shots.splice(targetIndex, 0, movedShot);

    // Update order and shot numbers
    // IMPORTANT: Take number should NOT change when reordering - it's a permanent identifier
    const updatedShots = shots.map((shot, index) => ({
      ...shot,
      order: index,
      shotNumber: segment.segmentNumber * 100 + (index + 1),
      // Keep existing take number - don't change it
      updatedAt: new Date(),
    }));

    const updatedScript = {
      ...script,
      segments: script.segments.map(segment => 
        segment.id === segmentId 
          ? {
              ...segment,
              shots: updatedShots,
              updatedAt: new Date(),
            }
          : segment
      ),
    };
    
    setScript(updatedScript);
    // Don't save immediately - let autosave handle it
    setDraggedShot(null);
    setDragOverIndex(null);
  };

  const calculateWordCount = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const calculateRuntime = (text: string): number => {
    // Rough estimate: 3 words per second
    const wordCount = calculateWordCount(text);
    return Math.ceil(wordCount / 3);
  };

  // Format duration as MM:SS:FF (minutes:seconds:frames) at 24 fps
  const formatDuration = (seconds: number): string => {
    const totalFrames = Math.floor(seconds * 24); // 24 fps
    const mins = Math.floor(totalFrames / (24 * 60));
    const remainingFrames = totalFrames % (24 * 60);
    const secs = Math.floor(remainingFrames / 24);
    const frames = remainingFrames % 24;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const formatShotNumber = (segmentNumber: number, shotNumber: number): string => {
    return `${segmentNumber}.${shotNumber}`;
  };

  // Handle import from CSV
  const handleImportCSV = async (importedShots: Array<{
    order: string;
    take: string;
    audio: string;
    visual: string;
    time: string;
    segmentNumber: number;
  }>) => {
    // Convert imported shots to the same format as generated shots
    const convertedShots = importedShots.map(shot => ({
      shotNumber: shot.order,
      uniqueName: shot.take,
      visual: shot.visual,
      audio: shot.audio,
      time: shot.time,
      segmentNumber: shot.segmentNumber,
    }));
    
    // Use the same autopopulate logic
    await handleAutopopulate(convertedShots);
  };

  // Handle autopopulate from generated shots
  const handleAutopopulate = async (generatedShots: Array<{
    shotNumber: string;
    uniqueName: string;
    visual: string;
    audio: string;
    time: string;
    segmentNumber: number;
  }>) => {
    // Group shots by segment
    const shotsBySegment = new Map<number, typeof generatedShots>();
    generatedShots.forEach(shot => {
      if (!shotsBySegment.has(shot.segmentNumber)) {
        shotsBySegment.set(shot.segmentNumber, []);
      }
      shotsBySegment.get(shot.segmentNumber)!.push(shot);
    });

    // Update or create segments and shots
    const updatedSegments = [...script.segments];
    
    shotsBySegment.forEach((shots, segmentNum) => {
      // Find or create segment
      let segment = updatedSegments.find(s => s.segmentNumber === segmentNum);
      
      if (!segment) {
        // Create new segment
        segment = {
          id: `segment-${Date.now()}-${segmentNum}`,
          episodeId,
          segmentNumber: segmentNum,
          title: `Scene ${segmentNum.toString().padStart(2, '0')}`,
          shots: [],
          totalRuntime: 0,
          totalWords: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        updatedSegments.push(segment);
      }

      // Parse time string (MM:SS:FF) to seconds
      const parseTime = (timeStr: string): number => {
        const parts = timeStr.split(':');
        if (parts.length === 3) {
          const mins = parseInt(parts[0], 10) || 0;
          const secs = parseInt(parts[1], 10) || 0;
          const frames = parseInt(parts[2], 10) || 0;
          return mins * 60 + secs + frames / 24; // 24 fps
        }
        return 0;
      };

      // Add or update shots
      shots.forEach((generatedShot, index) => {
        // Check if shot with this unique name already exists
        const existingShot = segment.shots.find(s => s.take === generatedShot.uniqueName);
        
        if (existingShot) {
          // Update existing shot
          existingShot.audio = generatedShot.audio;
          existingShot.visual = generatedShot.visual;
          existingShot.duration = parseTime(generatedShot.time);
          existingShot.wordCount = calculateWordCount(generatedShot.audio);
          existingShot.runtime = calculateRuntime(generatedShot.audio);
          existingShot.updatedAt = new Date();
        } else {
          // Create new shot
          const newShot: AVShot = {
            id: `shot-${Date.now()}-${index}`,
            segmentId: segment.id,
            shotNumber: 0, // Will be calculated
            take: generatedShot.uniqueName,
            audio: generatedShot.audio,
            visual: generatedShot.visual,
            duration: parseTime(generatedShot.time),
            wordCount: calculateWordCount(generatedShot.audio),
            runtime: calculateRuntime(generatedShot.audio),
            order: segment.shots.length,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          segment.shots.push(newShot);
        }
      });

      // Recalculate segment totals
      segment.totalWords = segment.shots.reduce((sum, s) => sum + s.wordCount, 0);
      segment.totalRuntime = segment.shots.reduce((sum, s) => sum + s.runtime, 0);
      segment.updatedAt = new Date();
    });

    // Sort segments by segment number
    updatedSegments.sort((a, b) => a.segmentNumber - b.segmentNumber);

    // Update shot numbers and recalculate totals
    updatedSegments.forEach(segment => {
      segment.shots.forEach((shot, index) => {
        shot.shotNumber = segment.segmentNumber * 100 + (index + 1);
      });
    });

    // Update script
    const updatedScript = {
      ...script,
      segments: updatedSegments,
      updatedAt: new Date(),
    };
    
    setScript(updatedScript);
    // Trigger autosave
    onSave(updatedScript);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{script.title}</h2>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {script.version}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">Total RT</div>
                <div className="text-lg font-semibold text-gray-900">{formatDuration(script.totalRuntime)}</div>
              </div>
              {/* Import AV Button */}
              <button
                onClick={() => setShowImportAVDialog(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                title="Import AV script from CSV file"
              >
                <Upload className="w-4 h-4" />
                <span>Import AV</span>
              </button>
              {/* Get API Button */}
              <button
                onClick={() => setShowApiKeyDialog(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                title="Get API configuration for Blender plugin"
              >
                <Key className="w-4 h-4" />
                <span>Get API</span>
              </button>
              {/* Download Blender Plugin Button */}
              <button
                onClick={handleDownloadPlugin}
                disabled={isDownloadingPlugin}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Download Blender plugin as zip file"
              >
                {isDownloadingPlugin ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                <span>Blender Plugin</span>
              </button>
              {/* Auto-populate Button */}
              <button
                onClick={() => setShowAutoPopulateDialog(true)}
                disabled={!screenplayData}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                title="Auto-populate AV script from screenplay"
              >
                <Sparkles className="w-4 h-4" />
                <span>Auto-populate</span>
              </button>
              {/* Manual Save Button */}
              <button
                onClick={handleManualSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                title="Save manually"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
              {/* Save Status */}
              {lastSavedAt && !isSaving && (
                <div className="text-xs text-gray-500">
                  Saved {new Date(lastSavedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center space-x-6">
            <div>
              <span className="text-sm text-gray-500">Total Words:</span>
              <span className="ml-2 font-medium text-gray-900">{script.totalWords}</span>
            </div>
          </div>
        </div>

        {/* Segments */}
        <div className="p-6">
        {script.segments.map((segment) => (
          <div key={segment.id} className="mb-8">
            {/* Segment Header */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Scene {segment.segmentNumber.toString().padStart(2, '0')}
                    </h3>
                    <p className="text-sm text-gray-600">{segment.title}</p>
                  </div>
                  <CommentThread 
                    targetType="av-segment" 
                    targetId={segment.id}
                    className="inline-block"
                  />
                </div>
                <button
                  onClick={() => setDeleteConfirmation({
                    type: 'segment',
                    id: segment.id,
                    title: segment.title
                  })}
                  className="flex items-center space-x-1 px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                  title="Delete segment"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Segment</span>
                </button>
              </div>
              
              {/* Scene Description Fields */}
              <div className="bg-gray-50 p-4 rounded-lg space-y-3 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Scene Setting
                    </label>
                    <input
                      type="text"
                      value={segment.sceneSetting || ''}
                      onChange={(e) => {
                        const updatedScript = {
                          ...script,
                          segments: script.segments.map(s =>
                            s.id === segment.id
                              ? { ...s, sceneSetting: e.target.value, updatedAt: new Date() }
                              : s
                          ),
                        };
                        setScript(updatedScript);
                        // Don't save immediately - let autosave handle it
                      }}
                      placeholder="Scene setting name..."
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <select
                      value={segment.locationId || ''}
                      onChange={(e) => {
                        const locationId = e.target.value;
                        const location = globalAssets.find(a => a.id === locationId && a.category === 'location');
                        const updatedScript = {
                          ...script,
                          segments: script.segments.map(s =>
                            s.id === segment.id
                              ? {
                                  ...s,
                                  locationId: locationId || undefined,
                                  locationName: location?.name || undefined,
                                  updatedAt: new Date(),
                                }
                              : s
                          ),
                        };
                        setScript(updatedScript);
                        // Don't save immediately - let autosave handle it
                      }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">Select location...</option>
                      {globalAssets
                        .filter(asset => asset.category === 'location')
                        .map(location => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Action
                    </label>
                    <textarea
                      value={segment.actionDescription || ''}
                      onChange={(e) => {
                        const updatedScript = {
                          ...script,
                          segments: script.segments.map(s =>
                            s.id === segment.id
                              ? { ...s, actionDescription: e.target.value, updatedAt: new Date() }
                              : s
                          ),
                        };
                        setScript(updatedScript);
                        // Don't save immediately - let autosave handle it
                      }}
                      placeholder="Action description..."
                      rows={2}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Shots Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-200">
                <div className="col-span-1 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Row</div>
                <div className="col-span-1 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Take</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Audio</div>
                <div className="col-span-3 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Visual</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Image</div>
                <div className="col-span-3 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</div>
              </div>

              <div className="min-h-[200px] bg-white">
                {segment.shots.map((shot, shotIndex) => (
                  <div
                    key={shot.id}
                    draggable={!isAnyPopupOpen}
                    onDragStart={(e) => {
                      if (isAnyPopupOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      handleDragStart(e, shot, segment.id, shotIndex);
                    }}
                    onDragOver={(e) => {
                      if (isAnyPopupOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      handleDragOver(e, shotIndex);
                    }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => {
                      if (isAnyPopupOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      handleDrop(e, shotIndex, segment.id);
                    }}
                    className={`transition-all duration-200 ${
                      draggedShot?.shot.id === shot.id 
                        ? 'opacity-50 bg-blue-100 shadow-lg transform scale-105' 
                        : dragOverIndex === shotIndex 
                          ? 'bg-blue-50 border-2 border-blue-300 border-dashed' 
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    <ShotRow
                      shot={shot}
                      segmentNumber={segment.segmentNumber}
                      shotIndex={shotIndex}
                      onUpdate={(updates) => handleUpdateShot(segment.id, shot.id, updates)}
                      onImageUpload={async (file) => {
                        const result = await uploadFile(file, `episodes/${episodeId}/av-script/storyboards/`);
                        if (result) {
                          const updatedScript = {
                            ...script,
                            segments: script.segments.map(seg => 
                              seg.id === segment.id
                                ? {
                                    ...seg,
                                    shots: seg.shots.map(s => 
                                      s.id === shot.id
                                        ? { 
                                            ...s, 
                                            imageUrl: result.url,
                                            updatedAt: new Date(),
                                          }
                                        : s
                                    ),
                                    updatedAt: new Date(),
                                  }
                                : seg
                            ),
                          };
                          setScript(updatedScript);
                          // Don't save immediately - let autosave handle it
                        }
                      }}
                      onImageGenerate={() => {
                        setCurrentShotForGeneration({ segmentId: segment.id, shotId: shot.id });
                        setShowImageGenerationDialog(true);
                      }}
                      onEnlargeImage={setEnlargedImage}
                      onDeleteShot={() => setDeleteConfirmation({
                        type: 'shot',
                        id: shot.id,
                        segmentId: segment.id,
                        title: `Shot ${formatShotNumber(segment.segmentNumber, shotIndex + 1)}`
                      })}
                      onDeleteImage={() => setDeleteConfirmation({
                        type: 'image',
                        id: shot.id,
                        segmentId: segment.id,
                        title: `Image for Shot ${formatShotNumber(segment.segmentNumber, shotIndex + 1)}`
                      })}
                      formatDuration={formatDuration}
                      formatShotNumber={formatShotNumber}
                      onAudioUpload={async (file, audioFileId, voiceId, voiceName) => {
                        const result = await uploadFile(file, `episodes/${episodeId}/av-script/audio/`);
                        if (result) {
                          // Use a function to get the latest state, since React state updates are async
                          setScript(currentScript => {
                            const currentSegment = currentScript.segments.find(s => s.id === segment.id);
                            if (!currentSegment) return currentScript;
                            
                            const currentShot = currentSegment.shots.find(s => s.id === shot.id);
                            if (!currentShot) return currentScript;
                            
                            const currentAudioFiles = currentShot.audioFiles || [];
                            let updatedAudioFiles: typeof currentAudioFiles;
                            
                            console.log('Uploading audio file:', {
                              audioFileId,
                              voiceId,
                              voiceName,
                              resultUrl: result.url,
                              currentAudioFilesCount: currentAudioFiles.length,
                              currentAudioFileIds: currentAudioFiles.map(af => af.id),
                            });
                            
                            // Find the audio file by ID (the one just created by handleSaveAudio)
                            const existingAudioFile = currentAudioFiles.find(af => af.id === audioFileId);
                            
                            if (existingAudioFile) {
                              // Update the existing audio file with the uploaded URL, preserving voice info
                              console.log('Updating existing audio file by ID:', {
                                id: existingAudioFile.id,
                                existingVoiceId: existingAudioFile.voiceId,
                                existingVoiceName: existingAudioFile.voiceName,
                                newVoiceId: voiceId,
                                newVoiceName: voiceName,
                              });
                              
                              updatedAudioFiles = currentAudioFiles.map(af => 
                                af.id === audioFileId
                                  ? { 
                                      ...af, 
                                      audioUrl: result.url,
                                      voiceId: voiceId,
                                      voiceName: voiceName,
                                    }
                                  : af
                              );
                            } else {
                              // Audio file not found by ID - might be a race condition
                              // Try to find by blob URL as fallback
                              const blobAudioFiles = currentAudioFiles.filter(af => af.audioUrl && af.audioUrl.startsWith('blob:'));
                              
                              if (blobAudioFiles.length > 0) {
                                // Update the most recent blob URL file
                                const blobAudioFile = blobAudioFiles[blobAudioFiles.length - 1];
                                console.log('Audio file not found by ID, updating blob URL file:', {
                                  id: blobAudioFile.id,
                                  expectedId: audioFileId,
                                });
                                
                                updatedAudioFiles = currentAudioFiles.map(af => 
                                  af.id === blobAudioFile.id
                                    ? { 
                                        ...af, 
                                        audioUrl: result.url,
                                        voiceId: voiceId,
                                        voiceName: voiceName,
                                      }
                                    : af
                                );
                              } else {
                                // Last resort: create new audio file with voice info
                                console.warn('Audio file not found, creating new one:', {
                                  expectedId: audioFileId,
                                  voiceId,
                                  voiceName,
                                });
                                
                                const audioFile = {
                                  id: audioFileId,
                                  audioUrl: result.url,
                                  voiceId: voiceId,
                                  voiceName: voiceName,
                                  uploadedAt: new Date(),
                                };
                                updatedAudioFiles = [...currentAudioFiles, audioFile];
                              }
                            }
                            
                            console.log('Final audioFiles after upload:', updatedAudioFiles.map(af => ({
                              id: af.id,
                              voiceId: af.voiceId,
                              voiceName: af.voiceName,
                              audioUrl: af.audioUrl?.substring(0, 50) + '...',
                            })));
                            
                            const updatedScript = {
                              ...currentScript,
                              segments: currentScript.segments.map(seg => 
                                seg.id === segment.id 
                                  ? {
                                      ...seg,
                                      shots: seg.shots.map(s => 
                                        s.id === shot.id 
                                          ? { 
                                              ...s, 
                                              audioFiles: updatedAudioFiles,
                                              updatedAt: new Date(),
                                            }
                                          : s
                                      ),
                                      updatedAt: new Date(),
                                    }
                                  : seg
                              ),
                            };
                            
                            // Don't save immediately - let autosave handle it
                            
                            return updatedScript;
                          });
                        }
                      }}
                      onAudioGenerate={async (text, voiceId, voiceName) => {
                        // This is handled in the popup, but we need to provide it
                        // The actual generation is done in the ShotRow component
                      }}
                      onPopupStateChange={(isOpen) => setIsAnyPopupOpen(isOpen)}
                    />
                  </div>
                ))}
                {segment.shots.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="text-center">
                      <div className="text-lg font-medium">No shots yet</div>
                      <div className="text-sm">Add your first shot below</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Add Shot Button */}
            <div className="mt-4">
              <button
                onClick={() => handleAddShot(segment.id)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus className="w-4 h-4 mr-2" />
                + Row
              </button>
            </div>

            {/* Segment Footer */}
            <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
              <div>END OF SEGMENT {segment.segmentNumber}</div>
              <div className="flex items-center space-x-4">
                <div>
                  <span className="font-medium">SEGMENT RT</span> {formatDuration(segment.totalRuntime)}
                </div>
                <div>
                  <span className="font-medium">SEGMENT WORDS</span> {segment.totalWords}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add Segment */}
        {showAddSegment ? (
          <div className="mt-8 p-4 border border-gray-200 rounded-lg">
            <input
              type="text"
              value={newSegmentTitle}
              onChange={(e) => setNewSegmentTitle(e.target.value)}
              placeholder="Enter segment title..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              onKeyPress={(e) => e.key === 'Enter' && handleAddSegment()}
            />
            <div className="mt-3 flex space-x-2">
              <button
                onClick={handleAddSegment}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Add Segment
              </button>
              <button
                onClick={() => setShowAddSegment(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <button
              onClick={() => setShowAddSegment(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              + Segment
            </button>
          </div>
        )}
        </div>

      {/* Image Enlargement Modal */}
      {enlargedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setEnlargedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={enlargedImage}
              alt="Enlarged storyboard"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Image Generation Dialog */}
      {showImageGenerationDialog && currentShotForGeneration && (() => {
        const segment = script.segments.find(s => s.id === currentShotForGeneration.segmentId);
        const shot = segment?.shots.find(s => s.id === currentShotForGeneration.shotId);
        const initialImageUrl = shot?.imageUrl && !shot?.imageGenerationThread ? shot.imageUrl : undefined;
        
        return (
          <ImageGenerationDialog
            isOpen={showImageGenerationDialog}
            onClose={() => {
              setShowImageGenerationDialog(false);
              setCurrentShotForGeneration(null);
            }}
            initialImageUrl={initialImageUrl}
            existingThread={shot?.imageGenerationThread}
            onImageGenerated={async (imageUrl, thread) => {
              if (segment && shot) {
                const updatedScript = {
                  ...script,
                  segments: script.segments.map(seg =>
                    seg.id === segment.id
                      ? {
                        ...seg,
                        shots: seg.shots.map(s =>
                          s.id === shot.id
                            ? {
                                ...s,
                                imageUrl,
                                imageGenerationThread: thread,
                                updatedAt: new Date(),
                              }
                            : s
                        ),
                        updatedAt: new Date(),
                      }
                    : seg
                ),
                updatedAt: new Date(),
              };
              setScript(updatedScript);
              
              // Save immediately to ensure image is persisted
              try {
                console.log('Saving image to AV script:', { imageUrl, shotId: shot.id });
                // Use immediate save if available, otherwise use regular save
                if (onSaveImmediately) {
                  await onSaveImmediately(updatedScript);
                } else {
                  await onSave(updatedScript);
                }
                setLastSavedAt(Date.now());
                console.log('Image saved successfully');
              } catch (error) {
                console.error('Error saving image:', error);
                alert('Failed to save image. Please try again.');
              }
            }
          }}
          visualDescription={(() => {
            const segment = script.segments.find(s => s.id === currentShotForGeneration.segmentId);
            const shot = segment?.shots.find(s => s.id === currentShotForGeneration.shotId);
            return shot?.visual || '';
          })()}
          locationDescription={(() => {
            const segment = script.segments.find(s => s.id === currentShotForGeneration.segmentId);
            if (segment?.locationId) {
              const location = globalAssets.find(a => a.id === segment.locationId);
              return location?.description || '';
            }
            return '';
          })()}
          locationId={(() => {
            const segment = script.segments.find(s => s.id === currentShotForGeneration.segmentId);
            return segment?.locationId;
          })()}
          globalAssets={globalAssets}
          episodeId={episodeId}
          showId={showId}
          />
        );
      })()}

      {/* Import AV Dialog */}
      {showImportAVDialog && (
        <ImportAVDialog
          isOpen={showImportAVDialog}
          onClose={() => setShowImportAVDialog(false)}
          onImport={handleImportCSV}
        />
      )}

      {/* API Key Dialog */}
      {showApiKeyDialog && (
        <ApiKeyDialog
          isOpen={showApiKeyDialog}
          onClose={() => setShowApiKeyDialog(false)}
          showId={showId || ''}
          episodeId={episodeId}
        />
      )}

      {/* Auto-populate Dialog */}
      {showAutoPopulateDialog && (
        <AutoPopulateDialog
          isOpen={showAutoPopulateDialog}
          onClose={() => setShowAutoPopulateDialog(false)}
          onAutopopulate={handleAutopopulate}
          screenplayData={screenplayData}
          avScript={script}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Confirm Deletion</h3>
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete &quot;{deleteConfirmation?.title}&quot;?
                </p>
              </div>
            </div>
            
            <div className="mb-4">
              {deleteConfirmation?.type === 'segment' && (
                <p className="text-sm text-red-600">
                  This will delete the entire segment and all its shots. This action cannot be undone.
                </p>
              )}
              {deleteConfirmation?.type === 'shot' && (
                <p className="text-sm text-red-600">
                  This will delete the shot row. This action cannot be undone.
                </p>
              )}
              {deleteConfirmation?.type === 'image' && (
                <p className="text-sm text-red-600">
                  This will remove the image from the shot. This action cannot be undone.
                </p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  if (deleteConfirmation?.type === 'segment') {
                    handleDeleteSegment(deleteConfirmation.id);
                  } else if (deleteConfirmation?.type === 'shot' && deleteConfirmation?.segmentId) {
                    handleDeleteShot(deleteConfirmation.segmentId, deleteConfirmation.id);
                  } else if (deleteConfirmation?.type === 'image' && deleteConfirmation?.segmentId) {
                    handleDeleteImage(deleteConfirmation.segmentId, deleteConfirmation.id);
                  }
                }}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shot Row Component
interface ShotRowProps {
  shot: AVShot;
  segmentNumber: number;
  shotIndex: number;
  onUpdate: (updates: Partial<AVShot>) => void;
  onImageUpload: (file: File) => Promise<void>;
  onEnlargeImage: (imageUrl: string) => void;
  onDeleteShot: () => void;
  onDeleteImage: () => void;
  formatDuration: (seconds: number) => string;
  formatShotNumber: (segmentNumber: number, shotNumber: number) => string;
  onAudioUpload: (file: File, audioFileId: string, voiceId: string, voiceName: string) => Promise<void>;
  onAudioGenerate: (text: string, voiceId: string, voiceName: string) => Promise<void>;
  onImageGenerate?: () => void;
  onPopupStateChange?: (isOpen: boolean) => void;
}

function ShotRow({ 
  shot, 
  segmentNumber, 
  shotIndex, 
  onUpdate, 
  onImageUpload,
  onEnlargeImage,
  onDeleteShot,
  onDeleteImage,
  formatDuration,
  formatShotNumber,
  onAudioUpload,
  onAudioGenerate,
  onImageGenerate,
  onPopupStateChange
}: ShotRowProps) {
  const [showAudioPopup, setShowAudioPopup] = useState(false);
  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  
  // Notify parent when popup state changes
  useEffect(() => {
    onPopupStateChange?.(showAudioPopup || showEnhanceDialog);
  }, [showAudioPopup, showEnhanceDialog, onPopupStateChange]);
  const [popupMode, setPopupMode] = useState<'generate' | 'upload'>('generate');
  const [generateText, setGenerateText] = useState(shot.audio);
  
  // Get default voice from voices array to ensure it's always valid
  const voices = [
    { id: 'NihbqkjwL2d2zZZUinKL', name: 'Churrito 1' },
    { id: 'lG2MfRiKt2P404zPIFet', name: 'Churrito 2' },
    { id: '1ldpv8M94zJ7F9VTVyub', name: 'PIPI' },
    { id: '8bomXa7wMiYTu9p353B2', name: 'Percy' },
    { id: 'OehrGYnpLxrlEfNTsKfl', name: 'Muffin 1' },
    { id: 'music', name: 'Music' },
    { id: 'sfx', name: 'SFX' },
  ];
  
  const defaultVoice = voices[0];
  const [selectedVoiceId, setSelectedVoiceId] = useState(defaultVoice.id);
  const [selectedVoiceName, setSelectedVoiceName] = useState(defaultVoice.name);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [deleteConfirmAudioId, setDeleteConfirmAudioId] = useState<string | null>(null);
  const audioRefs = React.useRef<{ [key: string]: HTMLAudioElement }>({});
  

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  const handleAudioFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const url = URL.createObjectURL(file);
      setUploadedFileUrl(url);
    }
  };

  const handleGenerateAudio = async () => {
    if (!generateText.trim()) {
      alert('Please enter text to generate audio');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/elevenlabs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: generateText,
          voiceId: selectedVoiceId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API error response:', errorData);
        throw new Error(errorData.error || errorData.detail?.message || `Failed to generate audio: ${response.status}`);
      }

      const data = await response.json();
      const audioBlob = new Blob(
        [Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))],
        { type: 'audio/mpeg' }
      );
      const audioUrl = URL.createObjectURL(audioBlob);
      setGeneratedAudioUrl(audioUrl);
    } catch (error) {
      console.error('Error generating audio:', error);
      alert('Failed to generate audio. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAudio = async () => {
    let file: File | null = null;
    let tempUrl: string | null = null;

    if (popupMode === 'generate' && generatedAudioUrl) {
      // Convert blob URL to File
      const response = await fetch(generatedAudioUrl);
      const blob = await response.blob();
      file = new File([blob], `generated-${Date.now()}.mp3`, { type: 'audio/mpeg' });
      tempUrl = generatedAudioUrl;
    } else if (popupMode === 'upload' && uploadedFile) {
      file = uploadedFile;
      tempUrl = uploadedFileUrl;
    }

    if (!file || !tempUrl) return;

    try {
      // Ensure we have a valid voice name
      const voice = voices.find(v => v.id === selectedVoiceId);
      const voiceNameToSave = voice?.name || selectedVoiceName || defaultVoice.name;
      const voiceIdToSave = selectedVoiceId || defaultVoice.id;
      
      console.log('handleSaveAudio: Preparing to save audio with voice:', {
        voiceId: voiceIdToSave,
        voiceName: voiceNameToSave,
        selectedVoiceId,
        selectedVoiceName,
        foundVoice: !!voice,
      });

      // Create audio file with blob URL first (so upload handler can find it)
      const audioFileId = `audio-${Date.now()}`;
      const audioFile = {
        id: audioFileId,
        audioUrl: tempUrl, // Temporary blob URL, will be updated by upload handler
        voiceId: voiceIdToSave,
        voiceName: voiceNameToSave,
        uploadedAt: new Date(),
      };

      // Add audio file to shot immediately with blob URL and voice info
      const currentAudioFiles = shot.audioFiles || [];
      onUpdate({
        audioFiles: [...currentAudioFiles, audioFile],
      });

      console.log('handleSaveAudio: Added audio file to shot:', {
        id: audioFile.id,
        voiceId: audioFile.voiceId,
        voiceName: audioFile.voiceName,
        audioUrl: audioFile.audioUrl?.substring(0, 50),
      });

      // Now upload the file - pass the audio file ID so the upload handler can find and update it
      await onAudioUpload(file, audioFileId, voiceIdToSave, voiceNameToSave);

      // Clean up
      if (generatedAudioUrl) {
        URL.revokeObjectURL(generatedAudioUrl);
        setGeneratedAudioUrl(null);
      }
      if (uploadedFileUrl) {
        URL.revokeObjectURL(uploadedFileUrl);
        setUploadedFileUrl(null);
      }
      setUploadedFile(null);
      setShowAudioPopup(false);
    } catch (error) {
      console.error('Error saving audio:', error);
      alert('Failed to save audio. Please try again.');
    }
  };

  const handlePlayAudio = (audioId: string, audioUrl: string) => {
    // Stop any currently playing audio
    Object.values(audioRefs.current).forEach(audio => {
      if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    if (playingAudioId === audioId) {
      setPlayingAudioId(null);
      return;
    }

    const audio = new Audio(audioUrl);
    audioRefs.current[audioId] = audio;
    audio.play();
    setPlayingAudioId(audioId);

    audio.onended = () => {
      setPlayingAudioId(null);
    };

    audio.onerror = () => {
      setPlayingAudioId(null);
      alert('Error playing audio');
    };
  };

  const handleDeleteAudio = (audioId: string) => {
    setDeleteConfirmAudioId(audioId);
  };

  const confirmDeleteAudio = () => {
    if (deleteConfirmAudioId) {
      const currentAudioFiles = shot.audioFiles || [];
      onUpdate({
        audioFiles: currentAudioFiles.filter(af => af.id !== deleteConfirmAudioId),
      });
      setDeleteConfirmAudioId(null);
    }
  };

  return (
    <div className="grid grid-cols-12 border-b border-gray-200 hover:bg-gray-50">
      {/* Row Number */}
      <div className="col-span-1 px-4 py-3 flex items-center">
        <div>
          <GripVertical className="w-4 h-4 text-gray-400 mr-2 cursor-grab hover:text-gray-600" />
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-medium text-gray-900">
            {formatShotNumber(segmentNumber, shotIndex + 1)}
          </div>
          <div className="text-xs text-gray-500">
            {shot.wordCount} words {formatDuration(shot.runtime)} RT
          </div>
        </div>
      </div>

      {/* Take */}
      <div className="col-span-1 px-4 py-3 flex items-center">
        <div className="text-sm font-mono font-medium text-gray-900">
          {shot.take || `SC${segmentNumber.toString().padStart(2, '0')}T01_image`}
        </div>
      </div>

      {/* Audio */}
      <div className="col-span-2 px-4 py-3">
        <div className="relative">
          <textarea
            value={shot.audio}
            onChange={(e) => onUpdate({ audio: e.target.value })}
            placeholder="Audio..."
            className="w-full h-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none relative z-10 bg-transparent"
            style={{ color: 'transparent', caretColor: '#000' }}
          />
          <div 
            className="absolute inset-0 px-2 py-1 text-sm pointer-events-none overflow-hidden"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#000',
              border: '1px solid transparent',
              borderRadius: '0.25rem',
            }}
          >
            {shot.audio.split(/(\[[^\]]+\])/g).map((part, index) => {
              if (part.startsWith('[') && part.endsWith(']')) {
                return <span key={index} className="text-gray-400">{part}</span>;
              }
              return <span key={index}>{part}</span>;
            })}
            {!shot.audio && (
              <span className="text-gray-400">Audio...</span>
            )}
          </div>
        </div>
        {/* Audio Controls */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setGenerateText(shot.audio);
              setPopupMode('generate');
              // Reset to default voice when opening popup
              setSelectedVoiceId(defaultVoice.id);
              setSelectedVoiceName(defaultVoice.name);
              setShowAudioPopup(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
            title="Generate audio"
          >
            <Volume2 className="w-3 h-3" />
            Generate
          </button>
          <button
            onClick={() => {
              setShowEnhanceDialog(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
            title="Enhance text"
          >
            <Sparkles className="w-3 h-3" />
            Enhance
          </button>
          <button
            onClick={() => {
              setPopupMode('upload');
              // Reset to default voice when opening popup
              setSelectedVoiceId(defaultVoice.id);
              setSelectedVoiceName(defaultVoice.name);
              setShowAudioPopup(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            title="Upload audio"
          >
            <Upload className="w-3 h-3" />
            Upload
          </button>
          {/* Audio Files List */}
          {shot.audioFiles && shot.audioFiles.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {shot.audioFiles.map((audioFile) => (
                <div
                  key={audioFile.id}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
                >
                  <button
                    onClick={() => handlePlayAudio(audioFile.id, audioFile.audioUrl)}
                    className="text-indigo-600 hover:text-indigo-800"
                    title={playingAudioId === audioFile.id ? 'Pause' : 'Play'}
                  >
                    {playingAudioId === audioFile.id ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </button>
                  <span className="text-xs text-gray-700 font-medium" title={`Voice: ${audioFile.voiceName || audioFile.voiceId || 'Unknown'}`}>
                    {audioFile.voiceName || audioFile.voiceId || 'Unknown'}
                  </span>
                  <button
                    onClick={() => {
                      // Download audio file
                      const link = document.createElement('a');
                      link.href = audioFile.audioUrl;
                      link.download = `audio-${audioFile.id}-${audioFile.voiceName || 'audio'}.mp3`;
                      link.target = '_blank';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="text-green-600 hover:text-green-800"
                    title="Download audio"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteAudio(audioFile.id)}
                    className="text-red-600 hover:text-red-800"
                    title="Delete audio"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Audio Popup (Generate or Upload) - Using Portal to render outside draggable container */}
        {showAudioPopup && typeof window !== 'undefined' && createPortal(
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
            style={{ pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onDragStart={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <div 
              className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
              onClick={(e) => {
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onDragStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {popupMode === 'generate' ? 'Generate Audio' : 'Upload Audio'}
                </h3>
                <button
                  onClick={() => {
                    setShowAudioPopup(false);
                    if (generatedAudioUrl) {
                      URL.revokeObjectURL(generatedAudioUrl);
                      setGeneratedAudioUrl(null);
                    }
                    if (uploadedFileUrl) {
                      URL.revokeObjectURL(uploadedFileUrl);
                      setUploadedFileUrl(null);
                    }
                    setUploadedFile(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {popupMode === 'generate' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Text
                      </label>
                      <textarea
                        value={generateText}
                        onChange={(e) => setGenerateText(e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                        placeholder="Enter text to generate audio..."
                      />
                    </div>
                  </>
                )}
                {popupMode === 'upload' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Audio File
                    </label>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioFileSelect}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {uploadedFileUrl && (
                      <div className="mt-2 p-3 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePlayAudio('uploaded', uploadedFileUrl)}
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            {playingAudioId === 'uploaded' ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>
                          <span className="text-sm text-gray-600">Preview uploaded audio</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Character/Voice
                  </label>
                  <select
                    value={selectedVoiceId}
                    onChange={(e) => {
                      const voiceId = e.target.value;
                      const voice = voices.find(v => v.id === voiceId);
                      if (voice) {
                        setSelectedVoiceId(voiceId);
                        setSelectedVoiceName(voice.name);
                        console.log('Voice selected:', voice.name, 'ID:', voiceId);
                      } else {
                        console.warn('Voice not found for ID:', voiceId);
                        // Fallback to default voice if not found
                        setSelectedVoiceId(defaultVoice.id);
                        setSelectedVoiceName(defaultVoice.name);
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {voices.map(voice => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                </div>
                {(generatedAudioUrl || uploadedFileUrl) && (
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => handlePlayAudio(popupMode === 'generate' ? 'generated' : 'uploaded', generatedAudioUrl || uploadedFileUrl || '')}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        {playingAudioId === (popupMode === 'generate' ? 'generated' : 'uploaded') ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm text-gray-600">
                        Preview {popupMode === 'generate' ? 'generated' : 'uploaded'} audio
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  {popupMode === 'generate' && (
                    <button
                      onClick={handleGenerateAudio}
                      disabled={isGenerating || !generateText.trim()}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Generate'
                      )}
                    </button>
                  )}
                  {(generatedAudioUrl || uploadedFileUrl) && (
                    <button
                      onClick={handleSaveAudio}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
        {/* Delete Confirmation Popup */}
        {deleteConfirmAudioId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Confirm Delete</h3>
                <button
                  onClick={() => setDeleteConfirmAudioId(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to delete this audio file? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={confirmDeleteAudio}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirmAudioId(null)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Visual */}
      <div className="col-span-3 px-4 py-3">
        <textarea
          value={shot.visual}
          onChange={(e) => onUpdate({ visual: e.target.value })}
          placeholder="Visual..."
          className="w-full h-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
        />
      </div>

      {/* Image */}
      <div className="col-span-2 px-4 py-3">
        <div className="relative">
          {shot.imageUrl ? (
            <div className="relative group">
              <img
                src={shot.imageUrl}
                alt="Storyboard"
                className="w-full aspect-video object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => {
                  // If image was generated, reopen the dialog with thread
                  if (shot.imageGenerationThread && onImageGenerate) {
                    onImageGenerate();
                  } else if (shot.imageUrl && onImageGenerate) {
                    // For uploaded images, open chat with that image as reference
                    onImageGenerate();
                  } else {
                    onEnlargeImage(shot.imageUrl!);
                  }
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteImage();
                }}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 hover:bg-red-600"
                title="Delete image"
              >
                ×
              </button>
              <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100">
                {shot.imageGenerationThread && onImageGenerate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onImageGenerate();
                    }}
                    className="bg-indigo-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-indigo-600"
                    title="Edit/Continue generation"
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnlargeImage(shot.imageUrl!);
                  }}
                  className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-blue-600"
                  title="Enlarge image"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col items-center justify-center w-full aspect-video border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                <ImageIcon className="w-6 h-6 text-gray-400 mb-1" />
                <span className="text-xs text-gray-500">Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
              {onImageGenerate && (
                <button
                  onClick={onImageGenerate}
                  className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  title="Generate image with AI"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Duration & Actions */}
      <div className="col-span-3 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <label className="text-xs font-medium text-gray-700">Duration:</label>
            <input
              type="text"
              value={formatDuration(shot.duration)}
              onChange={(e) => {
                // Parse MM:SS:FF format to seconds
                const parts = e.target.value.split(':');
                if (parts.length === 3) {
                  const mins = parseInt(parts[0]) || 0;
                  const secs = parseInt(parts[1]) || 0;
                  const frames = parseInt(parts[2]) || 0;
                  if (!isNaN(mins) && !isNaN(secs) && !isNaN(frames) && frames >= 0 && frames < 24) {
                    const totalSeconds = mins * 60 + secs + frames / 24;
                    onUpdate({ duration: totalSeconds });
                  }
                } else if (parts.length === 2) {
                  // Also support MM:SS format for backward compatibility
                  const mins = parseInt(parts[0]) || 0;
                  const secs = parseInt(parts[1]) || 0;
                  if (!isNaN(mins) && !isNaN(secs)) {
                    onUpdate({ duration: mins * 60 + secs });
                  }
                }
              }}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="00:00:00"
            />
            <CommentThread 
              targetType="av-shot" 
              targetId={shot.id}
              className="inline-block"
            />
          </div>
          <button
            onClick={onDeleteShot}
            className="flex items-center space-x-1 text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors"
            title="Delete shot"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-xs">Delete</span>
          </button>
        </div>
      </div>

      {/* Enhance Dialog */}
      {showEnhanceDialog && (
        <AVEnhanceDialog
          isOpen={showEnhanceDialog}
          onClose={() => setShowEnhanceDialog(false)}
          onEnhancementComplete={(selectedText, thread) => {
            // Update the shot with enhanced text and thread
            onUpdate({
              audio: selectedText,
              enhancementThread: thread,
            });
            setShowEnhanceDialog(false);
          }}
          shot={shot}
        />
      )}
    </div>
  );
}
