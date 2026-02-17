'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AVScript, AVSegment, AVShot, AVShotImageGenerationThread, GlobalAsset, ScreenplayData, AVScriptStableVersion } from '@/types';
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
  Package,
  Video,
  PlusCircle,
  Info,
  Menu,
  History,
  Check
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import { useSessionStorageState } from '@/hooks/useSessionStorageState';
import { useAuth } from '@/contexts/AuthContext';
import CommentThread from './CommentThread';
import { ImageGenerationDialog } from './ImageGenerationDialog';
import { AVEnhanceDialog } from './AVEnhanceDialog';
import { AutoPopulateDialog } from './AutoPopulateDialog';
import { ImportAVDialog } from './ImportAVDialog';
import { ApiKeyDialog } from './ApiKeyDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AVScriptEditorProps {
  episodeId: string;
  avScript?: AVScript;
  onSave: (avScript: AVScript) => void | Promise<void>;
  onSaveImmediately?: (avScript: AVScript) => void | Promise<void>;
  globalAssets?: GlobalAsset[];
  screenplayData?: ScreenplayData;
  showId?: string;
  isReadOnly?: boolean;
}

export function AVScriptEditor({ 
  episodeId, 
  avScript, 
  onSave,
  onSaveImmediately,
  globalAssets = [],
  screenplayData,
  showId = '',
  isReadOnly = false,
}: AVScriptEditorProps) {
  // Session-only persistence for the current episode (survives component switches, clears on tab close)
  const scriptSceneFilterKey = `concepto:av:scriptSceneFilter:${episodeId}`;
  const previewSelectedSegmentKey = `concepto:av:selectedSegmentId:${episodeId}`;

  const [script, setScript] = useState<AVScript>(() => {
    const initialScript = avScript || {
      id: `av-script-${Date.now()}`,
      episodeId,
      title: 'AV script',
      version: 'v1',
      segments: [],
      totalRuntime: 0,
      totalWords: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Auto-update old "BT AV script" title to "AV script"
    if (initialScript.title === 'BT AV script') {
      initialScript.title = 'AV script';
    }
    return initialScript;
  });
  
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
  
  const [stableVersions, setStableVersions] = useState<AVScriptStableVersion[]>(() => {
    if (!avScript?.stableVersions) return [];
    return avScript.stableVersions.map(v => ({
      ...v,
      createdAt: convertToDateForState(v.createdAt)
    }));
  });
  const [editingVersionName, setEditingVersionName] = useState<string | null>(null);
  const [tempVersionName, setTempVersionName] = useState('');
  const [versionToRestore, setVersionToRestore] = useState<AVScriptStableVersion | null>(null);

  const [showAddSegment, setShowAddSegment] = useState(false);
  const [newSegmentTitle, setNewSegmentTitle] = useState('');
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [enlargedVideo, setEnlargedVideo] = useState<string | null>(null);
  const [promptModal, setPromptModal] = useState<{
    type: 'image' | 'video';
    prompt: string;
    modelName?: string;
  } | null>(null);
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
  const [isDownloadingResolvePlugin, setIsDownloadingResolvePlugin] = useState(false);
  const [isAnyPopupOpen, setIsAnyPopupOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSceneFilter, setSelectedSceneFilter] = useSessionStorageState<string>(
    scriptSceneFilterKey,
    'all',
    {
      serialize: (v) => v,
      deserialize: (raw) => raw,
    }
  ); // 'all' or segment id
  const autosaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Tab visibility tracking - prevent autosave when tab is inactive
  const isTabVisibleRef = React.useRef(true);
  const lastKnownAvScriptHashRef = React.useRef<string>('');
  const [syncNotification, setSyncNotification] = useState<{message: string; timestamp: Date} | null>(null);

  // If the saved filter references a scene that no longer exists, fall back to "all"
  useEffect(() => {
    if (
      selectedSceneFilter !== 'all' &&
      !script.segments.some(s => s.id === selectedSceneFilter)
    ) {
      setSelectedSceneFilter('all');
    }
  }, [script.segments, selectedSceneFilter, setSelectedSceneFilter]);

  const { uploadFile } = useS3Upload();

  // Auto-update "BT AV script" title to "AV script" on mount or when avScript prop changes
  useEffect(() => {
    if (script.title === 'BT AV script') {
      const updatedScript = {
        ...script,
        title: 'AV script',
        updatedAt: new Date(),
      };
      setScript(updatedScript);
      onSave(updatedScript);
    }
  }, []); // Run only once on mount

  // Sync internal state when avScript prop changes (e.g., from AVPreview save)
  useEffect(() => {
    if (avScript) {
      // Auto-update old "BT AV script" title if present
      if (avScript.title === 'BT AV script') {
        const updatedScript = {
          ...avScript,
          title: 'AV script',
          updatedAt: new Date(),
        };
        setScript(updatedScript);
        onSave(updatedScript);
        return;
      }
      
      // Only update if the prop actually changed (avoid unnecessary updates)
      const propHash = JSON.stringify(avScript);
      const stateHash = JSON.stringify(script);
      if (propHash !== stateHash) {
        setScript(avScript);
        if (avScript.stableVersions) {
          // Process versions to convert createdAt to Date
          const convertToDate = (date: unknown): Date => {
            if (date instanceof Date) return date;
            if (typeof date === 'number') return new Date(date);
            if (typeof date === 'string') return new Date(date);
            if (date && typeof date === 'object' && 'toDate' in date) {
              return (date as { toDate: () => Date }).toDate();
            }
            return new Date();
          };
          setStableVersions(avScript.stableVersions.map(v => ({
            ...v,
            createdAt: convertToDate(v.createdAt)
          })));
        } else {
          setStableVersions([]);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avScript]);

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

  // Handle Resolve plugin download
  const handleDownloadResolvePlugin = async () => {
    setIsDownloadingResolvePlugin(true);
    try {
      const response = await fetch('/api/resolve-plugin/download');
      
      if (!response.ok) {
        throw new Error('Failed to download plugin');
      }

      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'concepto_resolve_plugin.zip';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading Resolve plugin:', error);
      alert('Failed to download Resolve plugin. Please try again.');
    } finally {
      setIsDownloadingResolvePlugin(false);
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
      // Handle both formats: SC01T01 and SC01T01_image
      const existingTakes = segment.shots
        .map(s => s.take)
        .filter(take => take && take.startsWith(`SC${segment.segmentNumber.toString().padStart(2, '0')}T`))
        .map(take => {
          // Match SC01T01 or SC01T01_image format
          const match = take?.match(/SC\d+T(\d+)(?:_image)?$/);
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
          const take = `SC${sceneNumber}T${takeNumber}`;
          
          return {
            ...shot,
            take: take,
          };
        } else {
          // Remove _image suffix if present
          const cleanedTake = shot.take.replace(/_image$/, '');
          if (cleanedTake !== shot.take) {
            needsUpdate = true;
            return {
              ...shot,
              take: cleanedTake,
            };
          }
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
    // Calculate totals directly from shots (not from segment totals)
    const totalWords = script.segments.reduce((sum, segment) => {
      return sum + segment.shots.reduce((shotSum, shot) => shotSum + shot.wordCount, 0);
    }, 0);
    // Calculate totalRuntime from all shot durations (not runtime) across all segments
    const totalRuntime = script.segments.reduce((sum, segment) => {
      return sum + segment.shots.reduce((shotSum, shot) => shotSum + (shot.duration || 0), 0);
    }, 0);
    
    setScript(prev => ({
      ...prev,
      totalWords,
      totalRuntime,
      updatedAt: new Date(),
    }));
  }, [script.segments]);

  // Manual save handler - use immediate save if available for real-time sync
  const handleManualSave = async () => {
    if (isReadOnly) return;
    setIsSaving(true);
    try {
      const scriptToSave = { ...script, stableVersions };
      // Use immediate save if available (for real-time sync), otherwise use regular save
      if (onSaveImmediately) {
        console.log('💾 Manual save using immediate save (real-time sync)');
        await onSaveImmediately(scriptToSave);
      } else {
        console.log('💾 Manual save using regular save');
        await onSave(scriptToSave);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving script:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Stable versions functions
  const handleSaveVersion = async () => {
    if (isReadOnly) return;
    const nextVersionNumber = stableVersions.length + 1;
    const defaultName = `AVScript_stable_v${nextVersionNumber}`;

    const newVersion: AVScriptStableVersion = {
      id: `version-${Date.now()}`,
      name: defaultName,
      createdAt: new Date(),
      data: {
        title: script.title,
        version: script.version,
        segments: JSON.parse(JSON.stringify(script.segments)),
        totalRuntime: script.totalRuntime,
        totalWords: script.totalWords,
      },
    };

    const updatedVersions = [...stableVersions, newVersion];
    setStableVersions(updatedVersions);
    setEditingVersionName(newVersion.id);
    setTempVersionName(newVersion.name);
    
    // Save the new stable version
    setIsSaving(true);
    try {
      const scriptToSave = { ...script, stableVersions: updatedVersions };
      if (onSaveImmediately) {
        await onSaveImmediately(scriptToSave);
      } else {
        await onSave(scriptToSave);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving stable version:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreVersion = async () => {
    if (isReadOnly) return;
    if (!versionToRestore) return;

    const restoredScript = {
      ...script,
      title: versionToRestore.data.title,
      version: versionToRestore.data.version,
      segments: JSON.parse(JSON.stringify(versionToRestore.data.segments)),
      totalRuntime: versionToRestore.data.totalRuntime,
      totalWords: versionToRestore.data.totalWords,
      stableVersions: stableVersions, // Keep stable versions as is
    };

    setScript(restoredScript);
    setVersionToRestore(null);
    
    // Save the restored version
    setIsSaving(true);
    try {
      if (onSaveImmediately) {
        await onSaveImmediately(restoredScript);
      } else {
        await onSave(restoredScript);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error restoring version:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateVersionName = async (versionId: string, newName: string) => {
    if (isReadOnly) return;
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
      const scriptToSave = { ...script, stableVersions: updatedVersions };
      if (onSaveImmediately) {
        await onSaveImmediately(scriptToSave);
      } else {
        await onSave(scriptToSave);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error updating version name:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (isReadOnly) return;
    const updatedVersions = stableVersions.filter(v => v.id !== versionId);
    setStableVersions(updatedVersions);
    
    // Save after deletion
    setIsSaving(true);
    try {
      const scriptToSave = { ...script, stableVersions: updatedVersions };
      if (onSaveImmediately) {
        await onSaveImmediately(scriptToSave);
      } else {
        await onSave(scriptToSave);
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error deleting version:', error);
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
  
  // Track tab visibility and check for changes when tab becomes active
  useEffect(() => {
    // Helper function to safely get timestamp from updatedAt
    const getUpdatedAtTimestamp = (updatedAt: Date | string | number | undefined): number => {
      if (!updatedAt) return 0;
      if (updatedAt instanceof Date) return updatedAt.getTime();
      if (typeof updatedAt === 'number') return updatedAt;
      if (typeof updatedAt === 'string') return new Date(updatedAt).getTime();
      // Handle Firestore Timestamp
      if (updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt) {
        return (updatedAt as { toDate: () => Date }).toDate().getTime();
      }
      return 0;
    };

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      isTabVisibleRef.current = isVisible;

      if (isVisible && avScript) {
        // Tab became visible - check for changes in incoming avScript prop
        const currentHash = JSON.stringify({
          segmentsCount: avScript.segments.length,
          totalShots: avScript.segments.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0),
          segmentIds: avScript.segments.map(s => s.id).sort().join(','),
          shotIds: avScript.segments.flatMap(seg => seg.shots.map(s => s.id)).sort().join(','),
          updatedAt: getUpdatedAtTimestamp(avScript.updatedAt)
        });

        if (lastKnownAvScriptHashRef.current && lastKnownAvScriptHashRef.current !== currentHash) {
          // Changes detected - show sync notification and update local script
          setSyncNotification({
            message: 'New changes from AV preview synced',
            timestamp: new Date()
          });
          setTimeout(() => {
            setSyncNotification(null);
          }, 3000);
          
          // Update local script to match incoming avScript
          setScript(avScript);
        } else if (lastKnownAvScriptHashRef.current) {
          // No changes
          setSyncNotification({
            message: 'No changes made',
            timestamp: new Date()
          });
          setTimeout(() => {
            setSyncNotification(null);
          }, 2000);
        }

        // Update hash for next comparison
        lastKnownAvScriptHashRef.current = currentHash;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initialize hash on mount
    if (avScript) {
      // Helper function to safely get timestamp from updatedAt
      const getUpdatedAtTimestamp = (updatedAt: Date | string | number | undefined): number => {
        if (!updatedAt) return 0;
        if (updatedAt instanceof Date) return updatedAt.getTime();
        if (typeof updatedAt === 'number') return updatedAt;
        if (typeof updatedAt === 'string') return new Date(updatedAt).getTime();
        // Handle Firestore Timestamp
        if (updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt) {
          return (updatedAt as { toDate: () => Date }).toDate().getTime();
        }
        return 0;
      };

      lastKnownAvScriptHashRef.current = JSON.stringify({
        segmentsCount: avScript.segments.length,
        totalShots: avScript.segments.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0),
        segmentIds: avScript.segments.map(s => s.id).sort().join(','),
        shotIds: avScript.segments.flatMap(seg => seg.shots.map(s => s.id)).sort().join(','),
        updatedAt: getUpdatedAtTimestamp(avScript.updatedAt)
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [avScript]);

  useEffect(() => {
    if (isReadOnly) return;
    // Don't autosave if tab is not visible
    if (!isTabVisibleRef.current) {
      console.log('⏸️ Skipping autosave - tab is not visible');
      return;
    }

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
      // Double-check visibility before saving
      if (!isTabVisibleRef.current) {
        console.log('⏸️ Skipping autosave - tab became inactive during debounce');
        return;
      }
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
        await onSave({ ...script, stableVersions });
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
  }, [script.segments, script.title, script.version, onSave, autosaveDelay, isReadOnly]);

  const handleAddSegment = () => {
    if (isReadOnly) return;
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

  // Insert a new shot at a specific position (between existing shots)
  const handleInsertShot = (segmentId: string, afterIndex: number) => {
    if (isReadOnly) return;
    const segment = script.segments.find(s => s.id === segmentId);
    if (!segment) return;

    // Generate unique take number for this scene
    // Format: SC{segmentNumber}T{takeNumber}
    // Find the highest take number in this segment
    const existingTakes = segment.shots
      .map(shot => shot.take)
      .filter(take => take && take.startsWith(`SC${segment.segmentNumber.toString().padStart(2, '0')}T`))
      .map(take => {
        // Extract take number from format SC01T03 or SC01T03_image
        const match = take.match(/SC\d+T(\d+)(?:_image)?$/);
        return match ? parseInt(match[1], 10) : 0;
      });
    
    const nextTakeNumber = existingTakes.length > 0 
      ? Math.max(...existingTakes) + 1 
      : 1;
    
    const takeNumber = nextTakeNumber.toString().padStart(2, '0');
    const sceneNumber = segment.segmentNumber.toString().padStart(2, '0');
    const take = `SC${sceneNumber}T${takeNumber}`;

    const newShot: AVShot = {
      id: `shot-${Date.now()}`,
      segmentId,
      shotNumber: 0, // Will be recalculated below
      take: take,
      audio: '',
      visual: '',
      duration: 0,
      wordCount: 0,
      runtime: 0,
      order: afterIndex + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert the new shot after the specified index
    const shots = [...segment.shots];
    shots.splice(afterIndex + 1, 0, newShot);

    // Update order and shot numbers for all shots
    const updatedShots = shots.map((shot, index) => ({
      ...shot,
      order: index,
      shotNumber: segment.segmentNumber * 100 + (index + 1),
    }));

    const updatedScript = {
      ...script,
      segments: script.segments.map(seg => 
        seg.id === segmentId 
          ? { ...seg, shots: updatedShots, updatedAt: new Date() }
          : seg
      ),
      updatedAt: new Date(),
    };

    setScript(updatedScript);
    // Don't save immediately - let autosave handle it
  };

  const handleAddShot = (segmentId: string) => {
    if (isReadOnly) return;
    const segment = script.segments.find(s => s.id === segmentId);
    if (!segment) return;

    // Generate unique take number for this scene
    // Format: SC{segmentNumber}T{takeNumber}
    // Find the highest take number in this segment
    const existingTakes = segment.shots
      .map(shot => shot.take)
      .filter(take => take && take.startsWith(`SC${segment.segmentNumber.toString().padStart(2, '0')}T`))
      .map(take => {
        // Extract take number from format SC01T03 or SC01T03_image
        const match = take.match(/SC\d+T(\d+)(?:_image)?$/);
        return match ? parseInt(match[1], 10) : 0;
      });
    
    const nextTakeNumber = existingTakes.length > 0 
      ? Math.max(...existingTakes) + 1 
      : 1;
    
    const takeNumber = nextTakeNumber.toString().padStart(2, '0');
    const sceneNumber = segment.segmentNumber.toString().padStart(2, '0');
    const take = `SC${sceneNumber}T${takeNumber}`;

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
    if (isReadOnly) return;
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

  // Get default duration for a model if not provided
  const getDefaultDuration = (modelName: string | undefined): number => {
    if (!modelName) return 0;
    
    // Kling only supports 5 or 10 seconds
    if (modelName.startsWith('kling')) {
      return 5; // Default to 5 seconds
    }
    
    // Veo typically uses 4, 6, or 8 seconds
    if (modelName.startsWith('veo')) {
      return 8; // Default to 8 seconds
    }
    
    // Runway supports 2-10 seconds
    if (modelName.startsWith('runway')) {
      return 5; // Default to 5 seconds
    }
    
    // Sora supports variable durations
    if (modelName.startsWith('sora')) {
      return 8; // Default to 8 seconds
    }
    
    return 0;
  };

  // Calculate cost for a video generation
  const calculateVideoCost = (
    modelName: string | undefined,
    duration: number | undefined,
    resolution?: '720p' | '1080p',
    klingMode?: 'std' | 'pro'
  ): number => {
    if (!modelName) return 0;
    
    // Use default duration if not provided (for existing videos)
    const actualDuration = duration || getDefaultDuration(modelName);
    if (!actualDuration) return 0;

    // Runway API pricing (credits per second, 1 credit = $0.01)
    if (modelName === 'runway-gen4-turbo') {
      return (5 * actualDuration) * 0.01; // 5 credits/sec
    }
    if (modelName === 'runway-gen4-aleph') {
      return (15 * actualDuration) * 0.01; // 15 credits/sec
    }
    if (modelName === 'runway-gen3a-turbo') {
      return (5 * actualDuration) * 0.01; // 5 credits/sec
    }
    if (modelName === 'runway-upscale-v1') {
      return (2 * actualDuration) * 0.01; // 2 credits/sec
    }
    if (modelName === 'runway-act-two') {
      return (5 * actualDuration) * 0.01; // 5 credits/sec
    }

    // Veo 3.1 pricing
    if (modelName === 'veo-3-1-flash' || modelName === 'veo-3-1-fast-generate-preview') {
      return 0.15 * actualDuration; // $0.15/sec
    }
    if (modelName === 'veo-3-1-pro' || modelName === 'veo-3-1-generate-preview') {
      return 0.40 * actualDuration; // $0.40/sec
    }

    // Veo 3.0 pricing
    if (modelName === 'veo-3-0-fast-generate-001') {
      return 0.15 * actualDuration; // $0.15/sec
    }
    if (modelName === 'veo-3-0-generate-001') {
      return 0.40 * actualDuration; // $0.40/sec
    }

    // Kling 2.5 Turbo pricing (fixed prices based on duration and mode)
    if (modelName === 'kling-v2-5-turbo') {
      // Default to 'std' mode if not specified
      const mode = klingMode || 'std';
      if (mode === 'std') {
        if (actualDuration === 5) return 0.21;
        if (actualDuration === 10) return 0.42;
        // If duration doesn't match exactly, use closest (5s default)
        return 0.21;
      } else if (mode === 'pro') {
        if (actualDuration === 5) return 0.35;
        if (actualDuration === 10) return 0.70;
        // If duration doesn't match exactly, use closest (5s default)
        return 0.35;
      }
      return 0; // Unknown mode
    }

    // Kling 2.6 pricing (based on duration, mode, and audio)
    // Default to no audio for cost calculation (actual cost will be calculated correctly when generated)
    if (modelName === 'kling-v2-6') {
      const mode = klingMode || 'std';
      const hasAudio = false; // Default to no audio for cost estimation
      
      if (mode === 'std') {
        if (actualDuration === 5) return hasAudio ? 0.84 : 0.42;
        if (actualDuration === 10) return hasAudio ? 1.68 : 0.84;
        return 0.42; // Default 5s
      } else if (mode === 'pro') {
        if (actualDuration === 5) return hasAudio ? 1.12 : 0.56;
        if (actualDuration === 10) return hasAudio ? 2.24 : 1.12;
        return 0.56; // Default 5s
      }
      return 0;
    }

    // O1 (Omni) pricing
    // Default to no video input for cost calculation (actual cost will be calculated correctly when generated)
    if (modelName === 'kling-omni-video' || modelName === 'kling-o1') {
      const mode = klingMode || 'std';
      const hasVideoInput = false; // Default to no video input for cost estimation
      
      if (mode === 'std') {
        if (actualDuration === 5) return hasVideoInput ? 0.63 : 0.42;
        if (actualDuration === 10) return hasVideoInput ? 1.26 : 0.84;
        return 0.42; // Default 5s
      } else if (mode === 'pro') {
        if (actualDuration === 5) return hasVideoInput ? 0.84 : 0.56;
        if (actualDuration === 10) return hasVideoInput ? 1.68 : 1.12;
        return 0.56; // Default 5s
      }
      return 0;
    }

    // Sora pricing
    if (modelName === 'sora-2') {
      return 0.10 * actualDuration; // $0.10/sec
    }
    if (modelName === 'sora-2-pro') {
      if (resolution === '1080p' || resolution === '720p') {
        return 0.30 * actualDuration; // $0.30/sec for 720p/1080p
      }
      return 0.30 * actualDuration; // Default to $0.30/sec
    }

    return 0; // Unknown model
  };

  // Calculate cost for a single shot
  const calculateShotCost = (shot: AVShot): number => {
    if (!shot.imageGenerationThread?.generatedVideos) return 0;
    
    let total = 0;
    shot.imageGenerationThread.generatedVideos.forEach(video => {
      // Type guard for video with extended properties
      const videoWithExtras = video as typeof video & {
        manualCost?: number;
        duration?: number;
        resolution?: '720p' | '1080p';
        klingMode?: 'std' | 'pro';
      };
      
      // Check if manual cost is set (for both uploaded and generated videos without modelName)
      if (videoWithExtras.manualCost !== undefined && videoWithExtras.manualCost > 0) {
        total += videoWithExtras.manualCost;
      } else if (video.modelName) {
        // Calculate cost for generated videos with modelName
        total += calculateVideoCost(
          video.modelName,
          videoWithExtras.duration,
          videoWithExtras.resolution,
          videoWithExtras.klingMode
        );
      }
      // If no modelName and no manualCost, cost is 0
    });
    
    return total;
  };

  // Calculate total cost for a segment
  const calculateSegmentCost = (segment: AVSegment): number => {
    return segment.shots.reduce((total, shot) => total + calculateShotCost(shot), 0);
  };

  // Helper function to extract prompt from shot
  const getPromptFromShot = (shot: AVShot, type: 'image' | 'video'): { prompt: string; modelName?: string } | null => {
    if (!shot.imageGenerationThread) return null;

    const thread = shot.imageGenerationThread;

    if (type === 'image') {
      if (!shot.imageUrl) return null;

      // First, try to find by mainImageId
      if (thread.mainImageId) {
        // Check if it's a generated image
        const generatedImage = thread.generatedImages?.find(img => img.id === thread.mainImageId);
        if (generatedImage && generatedImage.imageUrl === shot.imageUrl) {
          return { prompt: generatedImage.prompt, modelName: generatedImage.modelName };
        }
        // Check if it's a reference image, start frame, or end frame
        if (thread.mainImageId === 'referenceImage' && thread.referenceImage === shot.imageUrl) {
          return { prompt: 'Reference image (uploaded)' };
        }
        if (thread.mainImageId === 'startFrame' && thread.startFrame === shot.imageUrl) {
          return { prompt: 'Start frame (uploaded)' };
        }
        if (thread.mainImageId === 'endFrame' && thread.endFrame === shot.imageUrl) {
          return { prompt: 'End frame (uploaded)' };
        }
      }

      // Fallback: try to find by matching URL in generatedImages
      const matchingImage = thread.generatedImages?.find(img => img.imageUrl === shot.imageUrl);
      if (matchingImage) {
        return { prompt: matchingImage.prompt, modelName: matchingImage.modelName };
      }

      // Final fallback: get the most recent generated image prompt
      if (thread.generatedImages && thread.generatedImages.length > 0) {
        const latestImage = thread.generatedImages[thread.generatedImages.length - 1];
        return { prompt: latestImage.prompt, modelName: latestImage.modelName };
      }
    } else if (type === 'video') {
      if (!shot.videoUrl) return null;

      // First, try to find by mainVideoId
      if (thread.mainVideoId) {
        // Check if it's a generated video
        const generatedVideo = thread.generatedVideos?.find(vid => vid.id === thread.mainVideoId);
        if (generatedVideo && generatedVideo.videoUrl === shot.videoUrl) {
          return { prompt: generatedVideo.prompt, modelName: generatedVideo.modelName };
        }
        // Check if it's a reference video
        if (thread.mainVideoId === 'referenceVideo' && thread.referenceVideo === shot.videoUrl) {
          return { prompt: 'Reference video (uploaded)' };
        }
      }

      // Fallback: try to find by matching URL in generatedVideos
      const matchingVideo = thread.generatedVideos?.find(vid => vid.videoUrl === shot.videoUrl);
      if (matchingVideo) {
        return { prompt: matchingVideo.prompt, modelName: matchingVideo.modelName };
      }

      // Final fallback: get the most recent generated video prompt
      if (thread.generatedVideos && thread.generatedVideos.length > 0) {
        const latestVideo = thread.generatedVideos[thread.generatedVideos.length - 1];
        return { prompt: latestVideo.prompt, modelName: latestVideo.modelName };
      }
    }

    return null;
  };

  const handleDeleteSegment = async (segmentId: string) => {
    if (isReadOnly) return;
    const updatedScript = {
      ...script,
      segments: script.segments.filter(segment => segment.id !== segmentId),
    };
    setScript(updatedScript);
    setDeleteConfirmation(null);
    // Save immediately for deletions (critical operation)
    try {
      if (onSaveImmediately) {
        await onSaveImmediately({ ...updatedScript, stableVersions });
      } else {
        await onSave({ ...updatedScript, stableVersions });
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving after deletion:', error);
    }
  };

  const handleDeleteShot = async (segmentId: string, shotId: string) => {
    if (isReadOnly) return;
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
        await onSaveImmediately({ ...updatedScript, stableVersions });
      } else {
        await onSave({ ...updatedScript, stableVersions });
      }
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error('Error saving after deletion:', error);
    }
  };

  // handleDeleteImage function removed - images can only be deleted from the popup dialog
  // Images should be deleted through the ImageGenerationDialog, not directly from the AV script


  const [draggedShot, setDraggedShot] = useState<{shot: AVShot, segmentId: string, index: number} | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [originalDragIndex, setOriginalDragIndex] = useState<number | null>(null);

  // Handle Escape key to cancel drag
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && draggedShot) {
        setDraggedShot(null);
        setDragOverIndex(null);
        setOriginalDragIndex(null);
      }
    };
    
    if (draggedShot) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [draggedShot]);

  const handleDragStart = (e: React.DragEvent, shot: AVShot, segmentId: string, index: number) => {
    setDraggedShot({ shot, segmentId, index });
    setOriginalDragIndex(index);
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
    if (isReadOnly) return;
    e.preventDefault();
    
    if (!draggedShot || draggedShot.segmentId !== segmentId) {
      setDraggedShot(null);
      setDragOverIndex(null);
      setOriginalDragIndex(null);
      return;
    }

    const segment = script.segments.find(s => s.id === segmentId);
    if (!segment) {
      setDraggedShot(null);
      setDragOverIndex(null);
      setOriginalDragIndex(null);
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
    setOriginalDragIndex(null);
  };

  // Handle drag end - if drag was cancelled (Escape), restore original position
  const handleDragEnd = () => {
    if (draggedShot && originalDragIndex !== null) {
      // If we're still dragging and Escape was pressed, the Escape handler already cleared it
      // But if drag ended without drop, we should also clear
      setDraggedShot(null);
      setDragOverIndex(null);
      setOriginalDragIndex(null);
    }
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
  }>, targetSegmentId: string | null) => {
    if (isReadOnly) return;
    // Convert imported shots to the same format as generated shots
    const convertedShots = importedShots.map(shot => ({
      shotNumber: shot.order,
      uniqueName: shot.take,
      visual: shot.visual,
      audio: shot.audio,
      time: shot.time,
      segmentNumber: shot.segmentNumber,
    }));
    
    // Use the same autopopulate logic with target segment
    await handleAutopopulate(convertedShots, targetSegmentId);
  };

  // Handle autopopulate from generated shots
  const handleAutopopulate = async (generatedShots: Array<{
    shotNumber: string;
    uniqueName: string;
    visual: string;
    audio: string;
    time: string;
    segmentNumber: number;
  }>, targetSegmentId: string | null = null) => {
    if (isReadOnly) return;
    // Update or create segments and shots
    const updatedSegments = [...script.segments];
    
    let targetSegment: AVSegment | null = null;
    if (targetSegmentId) {
      // If target segment is specified, use it for all shots
      targetSegment = updatedSegments.find(s => s.id === targetSegmentId) || null;
      if (!targetSegment) {
        // Target segment not found - this shouldn't happen, but handle gracefully
        console.warn(`Target segment ${targetSegmentId} not found`);
        targetSegmentId = null;
      }
    }

    if (targetSegment) {
      // Add all shots to the target segment (ignore segment numbers from imported data)
      const shots = generatedShots;
      
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

      // Add or update shots in target segment
      shots.forEach((generatedShot, index) => {
        // Check if shot with this unique name already exists
        const existingShot = targetSegment!.shots.find(s => s.take === generatedShot.uniqueName);
        
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
            segmentId: targetSegment!.id,
            shotNumber: 0, // Will be calculated
            take: generatedShot.uniqueName,
            audio: generatedShot.audio,
            visual: generatedShot.visual,
            duration: parseTime(generatedShot.time),
            wordCount: calculateWordCount(generatedShot.audio),
            runtime: calculateRuntime(generatedShot.audio),
            order: targetSegment!.shots.length,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          targetSegment!.shots.push(newShot);
        }
      });

      // Recalculate segment totals
      targetSegment.totalWords = targetSegment.shots.reduce((sum, s) => sum + s.wordCount, 0);
      targetSegment.totalRuntime = targetSegment.shots.reduce((sum, s) => sum + (s.duration || 0), 0);
      targetSegment.updatedAt = new Date();
    } else {
      // Original logic: Group shots by segment
      const shotsBySegment = new Map<number, typeof generatedShots>();
      generatedShots.forEach(shot => {
        if (!shotsBySegment.has(shot.segmentNumber)) {
          shotsBySegment.set(shot.segmentNumber, []);
        }
        shotsBySegment.get(shot.segmentNumber)!.push(shot);
      });
      
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
      segment.totalRuntime = segment.shots.reduce((sum, s) => sum + (s.duration || 0), 0);
      segment.updatedAt = new Date();
      });
    }

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
        {isReadOnly && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
            Viewer mode: AV script is read-only.
          </div>
        )}
        {/* Header */}
        <div className="border-b border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start justify-between gap-3 md:gap-4 w-full md:w-auto">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{script.title}</h2>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                  {script.version}
                </span>
              </div>
              <div className="md:hidden text-right">
                <div className="text-xs text-gray-500">Total RT</div>
                <div className="text-sm font-semibold text-gray-900">{formatDuration(script.totalRuntime)}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
              <div className="hidden md:block text-right">
                <div className="text-sm text-gray-500">Total RT</div>
                <div className="text-lg font-semibold text-gray-900">{formatDuration(script.totalRuntime)}</div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {/* Stable Versions Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const panel = document.getElementById('av-script-stable-versions-panel');
                    if (panel) {
                      panel.classList.toggle('hidden');
                    }
                  }}
                  title="Toggle Stable Versions"
                >
                  <History className="h-4 w-4" />
                </Button>

                {/* Save icon (always visible) */}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleManualSave}
                  disabled={isSaving || isReadOnly}
                  title="Save"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>

                {/* Last saved (always visible) */}
                <div className="text-xs text-gray-500 whitespace-nowrap">
                  {lastSavedAt ? `Last saved: ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Not saved yet'}
                </div>

                {/* Hamburger menu for the rest */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" title="More actions" disabled={isReadOnly}>
                      <Menu className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>AV Script Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setShowImportAVDialog(true)} disabled={isReadOnly}>
                      <Upload className="h-4 w-4" />
                      <span>Import AV</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setShowApiKeyDialog(true)}>
                      <Key className="h-4 w-4" />
                      <span>Get API</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        if (!isDownloadingPlugin) void handleDownloadPlugin();
                      }}
                      disabled={isDownloadingPlugin}
                    >
                      {isDownloadingPlugin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                      <span>Blender Plugin</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        if (!isDownloadingResolvePlugin) void handleDownloadResolvePlugin();
                      }}
                      disabled={isDownloadingResolvePlugin}
                    >
                      {isDownloadingResolvePlugin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                      <span>Resolve Plugin</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setShowAutoPopulateDialog(true)} disabled={!screenplayData || isReadOnly}>
                      <Sparkles className="h-4 w-4" />
                      <span>Auto-populate</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-4">
            <div>
              <span className="text-xs sm:text-sm text-gray-500">Total Words:</span>
              <span className="ml-2 text-sm sm:text-base font-medium text-gray-900">{script.totalWords}</span>
            </div>
          </div>
        </div>

        {/* Stable Versions Panel */}
        <div
          id="av-script-stable-versions-panel"
          className="hidden fixed right-4 top-20 w-80 bg-gray-900 border border-gray-800 rounded-lg shadow-lg h-fit max-h-[80vh] overflow-hidden flex flex-col z-50"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-300">Stable Versions</h3>
            <button
              onClick={handleSaveVersion}
              disabled={isReadOnly}
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

        {/* Restore Version Confirmation Dialog */}
        {versionToRestore && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Restore Stable Version</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to restore &quot;{versionToRestore.name}&quot;? This will override your current AV script state.
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

        {/* Segments */}
        <div className="p-6">
          {/* Scene Filter Dropdown */}
          <div className="mb-6 flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              Filter by Scene:
            </label>
            <select
              value={selectedSceneFilter}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedSceneFilter(next);
                // If a specific scene is selected, sync it for AVPreview too.
                if (next !== 'all') {
                  try {
                    window.sessionStorage.setItem(previewSelectedSegmentKey, next);
                  } catch {
                    // ignore storage errors
                  }
                }
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="all">All Scenes</option>
              {script.segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  Scene {segment.segmentNumber.toString().padStart(2, '0')} - {segment.title}
                </option>
              ))}
            </select>
          </div>
        {script.segments
          .filter((segment) => selectedSceneFilter === 'all' || segment.id === selectedSceneFilter)
          .map((segment) => (
          <div key={segment.id} className="mb-8">
            {/* Segment Header */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Scene {segment.segmentNumber.toString().padStart(2, '0')}
                    </h3>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-gray-600">{segment.title}</p>
                      <span className="text-sm font-semibold text-blue-700">
                        TOTAL COST: ${calculateSegmentCost(segment).toFixed(2)}
                      </span>
                    </div>
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
              <div className="hidden md:grid grid-cols-12 bg-gray-50 border-b border-gray-200">
                <div className="col-span-1 px-2 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Row</div>
                <div className="col-span-1 px-1 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Take</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Audio</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Visual</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Image</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Video</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</div>
              </div>

              <div className="min-h-[200px] bg-white">
                {segment.shots.map((shot, shotIndex) => (
                  <React.Fragment key={shot.id}>
                    <div
                      onDragOver={(e) => {
                        if (isAnyPopupOpen || !draggedShot) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        handleDragOver(e, shotIndex);
                      }}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => {
                        if (isAnyPopupOpen || !draggedShot) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        handleDrop(e, shotIndex, segment.id);
                      }}
                      onDragEnd={handleDragEnd}
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
                      segmentId={segment.id}
                      onUpdate={(updates) => handleUpdateShot(segment.id, shot.id, updates)}
                      onDragStart={handleDragStart}
                      isReadOnly={isReadOnly}
                      isAnyPopupOpen={isAnyPopupOpen}
                      calculateShotCost={calculateShotCost}
                      onImageUpload={async (file) => {
                        if (isReadOnly) return;
                        const result = await uploadFile(file, `episodes/${episodeId}/av-script/storyboards/`);
                        if (result) {
                          // Create or update the thread to include the uploaded image
                          const uploadedImgId = `uploaded-img-${Date.now()}`;
                          const uploadedImageMainId = `uploaded-image-${uploadedImgId}`;
                          const existingThread = shot.imageGenerationThread;
                          const newThread: AVShotImageGenerationThread = {
                            id: existingThread?.id || `thread-${Date.now()}`,
                            selectedAssets: existingThread?.selectedAssets || [],
                            sketchImage: existingThread?.sketchImage,
                            startFrame: existingThread?.startFrame,
                            endFrame: existingThread?.endFrame,
                            referenceImage: existingThread?.referenceImage,
                            referenceVideo: existingThread?.referenceVideo,
                            mainImageId: uploadedImageMainId, // Set uploaded image as main
                            mainVideoId: existingThread?.mainVideoId,
                            messages: existingThread?.messages || [],
                            generatedImages: [
                              ...(existingThread?.generatedImages || []),
                              {
                                id: uploadedImgId,
                                imageUrl: result.url,
                                prompt: 'Uploaded image',
                                style: 'storyboard',
                                createdAt: new Date(),
                              }
                            ],
                            generatedVideos: existingThread?.generatedVideos,
                            selectedImageId: existingThread?.selectedImageId,
                            createdAt: existingThread?.createdAt || new Date(),
                            updatedAt: new Date(),
                          };

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
                                            imageGenerationThread: newThread,
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
                          
                          // Save immediately to ensure image is persisted
                          try {
                            if (onSaveImmediately) {
                              await onSaveImmediately({ ...updatedScript, stableVersions });
                            } else {
                              await onSave({ ...updatedScript, stableVersions });
                            }
                            setLastSavedAt(Date.now());
                          } catch (error) {
                            console.error('Error saving after image upload:', error);
                          }
                        }
                      }}
                      onVideoUpload={async (file) => {
                        if (isReadOnly) return;
                        // Show progress - we'll track this in the component
                        const result = await uploadFile(file, `episodes/${episodeId}/av-script/videos/`);
                        if (result) {
                          // Get the actual video duration from the file
                          let videoDuration: number | null = null;
                          try {
                            const videoEl = document.createElement('video');
                            videoEl.preload = 'metadata';
                            const durationPromise = new Promise<number>((resolve, reject) => {
                              videoEl.onloadedmetadata = () => resolve(videoEl.duration);
                              videoEl.onerror = () => reject(new Error('Failed to load video metadata'));
                            });
                            videoEl.src = URL.createObjectURL(file);
                            videoDuration = await durationPromise;
                            URL.revokeObjectURL(videoEl.src);
                          } catch (err) {
                            console.warn('Could not read video duration from file:', err);
                          }

                          // Create or update the thread to include the uploaded video
                          const uploadedVidId = `uploaded-vid-${Date.now()}`;
                          const existingThread = shot.imageGenerationThread;
                          const newThread: AVShotImageGenerationThread = {
                            id: existingThread?.id || `thread-${Date.now()}`,
                            selectedAssets: existingThread?.selectedAssets || [],
                            sketchImage: existingThread?.sketchImage,
                            startFrame: existingThread?.startFrame,
                            endFrame: existingThread?.endFrame,
                            referenceImage: existingThread?.referenceImage,
                            referenceVideo: existingThread?.referenceVideo,
                            mainImageId: existingThread?.mainImageId,
                            mainVideoId: uploadedVidId, // Set uploaded video as main
                            messages: existingThread?.messages || [],
                            generatedImages: existingThread?.generatedImages || [],
                            generatedVideos: [
                              ...(existingThread?.generatedVideos || []),
                              {
                                id: uploadedVidId,
                                videoUrl: result.url,
                                prompt: 'Uploaded video',
                                createdAt: new Date(),
                              }
                            ],
                            selectedImageId: existingThread?.selectedImageId,
                            createdAt: existingThread?.createdAt || new Date(),
                            updatedAt: new Date(),
                          };

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
                                            videoUrl: result.url,
                                            imageGenerationThread: newThread,
                                            // Auto-set duration from uploaded video
                                            ...(videoDuration && videoDuration > 0 && isFinite(videoDuration)
                                              ? { duration: videoDuration }
                                              : {}),
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
                          
                          // Save immediately to ensure video is persisted
                          try {
                            if (onSaveImmediately) {
                              await onSaveImmediately({ ...updatedScript, stableVersions });
                            } else {
                              await onSave({ ...updatedScript, stableVersions });
                            }
                            setLastSavedAt(Date.now());
                          } catch (error) {
                            console.error('Error saving after video upload:', error);
                          }
                        }
                      }}
                      onImageGenerate={() => {
                        if (isReadOnly) return;
                        setCurrentShotForGeneration({ segmentId: segment.id, shotId: shot.id });
                        setShowImageGenerationDialog(true);
                      }}
                      onShowPrompt={(type) => {
                        const promptData = getPromptFromShot(shot, type);
                        if (promptData) {
                          setPromptModal({ type, ...promptData });
                        }
                      }}
                      onEnlargeImage={setEnlargedImage}
                      onEnlargeVideo={setEnlargedVideo}
                      onDeleteShot={() => {
                        if (isReadOnly) return;
                        setDeleteConfirmation({
                          type: 'shot',
                          id: shot.id,
                          segmentId: segment.id,
                          title: `Shot ${formatShotNumber(segment.segmentNumber, shotIndex + 1)}`
                        });
                      }}
                      // onDeleteImage removed - images can only be deleted from the popup dialog
                      formatDuration={formatDuration}
                      formatShotNumber={formatShotNumber}
                      onAudioUpload={async (file, audioFileId, voiceId, voiceName) => {
                        if (isReadOnly) return;
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
                  
                  {/* Insert Row Button - appears between rows */}
                  {shotIndex < segment.shots.length - 1 && (
                    <div className="grid grid-cols-12 border-t border-gray-100">
                      {/* Empty cells for spacing - aligns with Take column */}
                      <div className="col-span-1"></div>
                      <div className="col-span-1 flex items-center justify-center py-1">
                        <button
                          onClick={() => handleInsertShot(segment.id, shotIndex)}
                          className="group relative flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 hover:bg-indigo-100 transition-colors"
                          title={`Insert row after ${formatShotNumber(segment.segmentNumber, shotIndex + 1)}`}
                        >
                          <PlusCircle className="w-4 h-4 text-gray-400 group-hover:text-indigo-600" />
                          {/* Connecting line above */}
                          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-0.5 h-1 bg-gray-200"></div>
                          {/* Connecting line below */}
                          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0.5 h-1 bg-gray-200"></div>
                        </button>
                      </div>
                      <div className="col-span-10"></div>
                    </div>
                  )}
                </React.Fragment>
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
              disabled={isReadOnly}
              onKeyPress={(e) => e.key === 'Enter' && handleAddSegment()}
            />
            <div className="mt-3 flex space-x-2">
              <button
                onClick={handleAddSegment}
                disabled={isReadOnly}
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
              disabled={isReadOnly}
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
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setEnlargedImage(null)}>
          <div className="relative max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] p-2 sm:p-4">
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

      {enlargedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setEnlargedVideo(null)}>
          <div className="relative max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] p-2 sm:p-4">
            <button
              onClick={() => setEnlargedVideo(null)}
              className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <video
              src={enlargedVideo}
              controls
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Prompt Info Modal */}
      {promptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setPromptModal(null)}>
          <div className="relative max-w-2xl w-full bg-white rounded-lg shadow-xl m-0 sm:m-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 sm:p-4 border-b">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                Generation Prompt {promptModal.type === 'image' ? '(Image)' : '(Video)'}
              </h3>
              <button
                onClick={() => setPromptModal(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 sm:p-6">
              {promptModal.modelName && (
                <div className="mb-4">
                  <span className="text-sm font-medium text-gray-700">Model: </span>
                  <span className="text-sm text-gray-600">{promptModal.modelName}</span>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                  {promptModal.prompt || 'No prompt available'}
                </p>
              </div>
            </div>
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
            isReadOnly={isReadOnly}
            onClose={() => {
              setShowImageGenerationDialog(false);
              setCurrentShotForGeneration(null);
            }}
            initialImageUrl={initialImageUrl}
            existingThread={shot?.imageGenerationThread}
            currentShotImageUrl={shot?.imageUrl}
            currentShotVideoUrl={shot?.videoUrl}
            onImageGenerated={async (imageUrl, thread) => {
              if (isReadOnly) return;
              if (segment && shot) {
                // Extract videoUrl from thread if mainVideoId is set
                let videoUrl: string | undefined = undefined;
                if (thread.mainVideoId) {
                  if (thread.mainVideoId === 'referenceVideo') {
                    videoUrl = thread.referenceVideo;
                  } else if (thread.generatedVideos) {
                    // Handle both uploaded videos (uploaded-video-{id}) and generated videos (direct id)
                    let mainVideo = thread.generatedVideos.find(v => v.id === thread.mainVideoId);
                    // If not found, try to match by removing the 'uploaded-video-' prefix for uploaded videos
                    if (!mainVideo && thread.mainVideoId.startsWith('uploaded-video-')) {
                      const actualId = thread.mainVideoId.replace('uploaded-video-', '');
                      mainVideo = thread.generatedVideos.find(v => v.id === actualId);
                    }
                    videoUrl = mainVideo?.videoUrl;
                  }
                } else if (thread.generatedVideos && thread.generatedVideos.length > 0) {
                  // If no main video is explicitly set but videos exist, try to preserve the first one
                  // This handles the case where dialog is closed without explicitly selecting a main video
                  videoUrl = thread.generatedVideos[0]?.videoUrl;
                }
                
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
                                videoUrl,
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
              
              // Save immediately to ensure image and video are persisted
              try {
                console.log('Saving image and video to AV script:', { imageUrl, videoUrl, shotId: shot.id });
                // Use immediate save if available, otherwise use regular save
                if (onSaveImmediately) {
                  await onSaveImmediately({ ...updatedScript, stableVersions });
                } else {
                  await onSave({ ...updatedScript, stableVersions });
                }
                setLastSavedAt(Date.now());
                console.log('Image and video saved successfully');
              } catch (error) {
                console.error('Error saving image/video:', error);
                alert('Failed to save image/video. Please try again.');
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
          audioText={(() => {
            const segment = script.segments.find(s => s.id === currentShotForGeneration.segmentId);
            const shot = segment?.shots.find(s => s.id === currentShotForGeneration.shotId);
            return shot?.audio || '';
          })()}
          />
        );
      })()}

      {/* Import AV Dialog */}
      {showImportAVDialog && (
        <ImportAVDialog
          isOpen={showImportAVDialog}
          isReadOnly={isReadOnly}
          onClose={() => setShowImportAVDialog(false)}
          onImport={handleImportCSV}
          availableSegments={script.segments.map(s => ({
            id: s.id,
            segmentNumber: s.segmentNumber,
            title: s.title,
          }))}
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
          isReadOnly={isReadOnly}
          onClose={() => setShowAutoPopulateDialog(false)}
          onAutopopulate={handleAutopopulate}
          screenplayData={screenplayData}
          avScript={script}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 sm:p-6 m-0 sm:m-4">
            <div className="flex items-start space-x-3 mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-medium text-gray-900">Confirm Deletion</h3>
                <p className="text-sm text-gray-500 break-words">
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
              {/* Image deletion confirmation removed - images can only be deleted from the popup dialog */}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  if (deleteConfirmation?.type === 'segment') {
                    handleDeleteSegment(deleteConfirmation.id);
                  } else if (deleteConfirmation?.type === 'shot' && deleteConfirmation?.segmentId) {
                    handleDeleteShot(deleteConfirmation.segmentId, deleteConfirmation.id);
                  }
                  // Image deletion case removed - images can only be deleted from the popup dialog
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

      {/* Sync Notification */}
      {syncNotification && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-lg z-[200] flex items-center space-x-2 transform transition-all duration-300 ease-out">
          <Save className="w-4 h-4" />
          <div>
            <div className="text-sm font-medium">{syncNotification.message}</div>
            <div className="text-xs opacity-90">
              {syncNotification.timestamp.toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Auto-resize textarea component
interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
}

function AutoResizeTextarea({ value, onChange, placeholder, className, ...props }: AutoResizeTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight to fit content
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      style={{ minHeight: '2.5rem', overflow: 'hidden' }}
      {...props}
    />
  );
}

// Shot Row Component
interface ShotRowProps {
  shot: AVShot;
  segmentNumber: number;
  shotIndex: number;
  segmentId: string;
  onUpdate: (updates: Partial<AVShot>) => void;
  onImageUpload: (file: File) => Promise<void>;
  onVideoUpload: (file: File) => Promise<void>;
  onEnlargeImage: (imageUrl: string) => void;
  onEnlargeVideo?: (videoUrl: string) => void;
  onDeleteShot: () => void;
  // onDeleteImage removed - images can only be deleted from the popup dialog
  formatDuration: (seconds: number) => string;
  formatShotNumber: (segmentNumber: number, shotNumber: number) => string;
  onAudioUpload: (file: File, audioFileId: string, voiceId: string, voiceName: string) => Promise<void>;
  onAudioGenerate: (text: string, voiceId: string, voiceName: string) => Promise<void>;
  onImageGenerate?: () => void;
  onShowPrompt?: (type: 'image' | 'video') => void;
  onPopupStateChange?: (isOpen: boolean) => void;
  onDragStart?: (e: React.DragEvent, shot: AVShot, segmentId: string, index: number) => void;
  isAnyPopupOpen?: boolean;
  calculateShotCost?: (shot: AVShot) => number;
  isReadOnly?: boolean;
}

function ShotRow({ 
  shot, 
  segmentNumber, 
  shotIndex,
  segmentId,
  onUpdate, 
  onImageUpload,
  onVideoUpload,
  onEnlargeImage,
  onEnlargeVideo,
  onDeleteShot,
  // onDeleteImage removed - images can only be deleted from the popup dialog
  formatDuration,
  formatShotNumber,
  onAudioUpload,
  onAudioGenerate,
  onImageGenerate,
  onShowPrompt,
  onPopupStateChange,
  onDragStart,
  isAnyPopupOpen = false,
  calculateShotCost,
  isReadOnly = false
}: ShotRowProps) {
  const { user } = useAuth();
  const [showAudioPopup, setShowAudioPopup] = useState(false);
  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  
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
  
  // Paste-to-upload: track hover state on image box
  const isImageBoxHovered = useRef(false);
  const [isPasteUploading, setIsPasteUploading] = useState(false);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!isImageBoxHovered.current || isPasteUploading) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (blob) {
            setIsPasteUploading(true);
            try {
              const file = new File([blob], `pasted-${Date.now()}.png`, { type: blob.type || 'image/png' });
              await onImageUpload(file);
            } catch (err) {
              console.error('Paste upload failed:', err);
            } finally {
              setIsPasteUploading(false);
            }
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onImageUpload, isPasteUploading]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const file = event.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  const handleAudioFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const url = URL.createObjectURL(file);
      setUploadedFileUrl(url);
    }
  };

  const handleGenerateAudio = async () => {
    if (isReadOnly) return;
    if (!generateText.trim()) {
      alert('Please enter text to generate audio');
      return;
    }
    
    // Check AI access before making API call
    if (user?.aiAccessEnabled === false) {
      alert('You don\'t have permissions to use AI features on this platform.');
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    setDeleteConfirmAudioId(audioId);
  };

  const confirmDeleteAudio = () => {
    if (isReadOnly) return;
    if (deleteConfirmAudioId) {
      const currentAudioFiles = shot.audioFiles || [];
      onUpdate({
        audioFiles: currentAudioFiles.filter(af => af.id !== deleteConfirmAudioId),
      });
      setDeleteConfirmAudioId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 border-b border-gray-200 hover:bg-gray-50 gap-y-2 md:gap-y-0">
      {/* Row Number */}
      <div className="col-span-12 md:col-span-1 px-2 py-3 flex flex-col">
        <div className="flex items-center mb-1">
          <div
            draggable={!isReadOnly && !isAnyPopupOpen && !!onDragStart}
            onDragStart={(e) => {
              if (isReadOnly || isAnyPopupOpen || !onDragStart) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              onDragStart(e, shot, segmentId, shotIndex);
            }}
            className="cursor-grab active:cursor-grabbing mr-1"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600" />
          </div>
          <div className="text-sm font-medium text-gray-900">
            {formatShotNumber(segmentNumber, shotIndex + 1)}
          </div>
        </div>
        <div className="text-xs text-gray-500 mb-1">
          {shot.wordCount} words {formatDuration(shot.runtime)} RT
        </div>
        <CommentThread 
          targetType="av-shot" 
          targetId={shot.id}
          className="inline-block"
        />
      </div>

      {/* Take */}
      <div className="col-span-12 md:col-span-1 px-2 md:px-1 py-1 md:py-3 flex flex-col items-start">
        <div className="text-xs font-mono font-medium text-gray-900">
          {shot.take || `SC${segmentNumber.toString().padStart(2, '0')}T01`}
        </div>
        {(() => {
          const cost = calculateShotCost ? calculateShotCost(shot) : 0;
          return cost > 0 ? (
            <div className="text-xs font-semibold text-blue-700 mt-1">
              ${cost.toFixed(2)}
            </div>
          ) : null;
        })()}
      </div>

      {/* Audio */}
      <div className="col-span-12 md:col-span-2 px-2 md:px-4 py-1 md:py-3">
        <AutoResizeTextarea
          value={shot.audio}
          onChange={(e) => onUpdate({ audio: e.target.value })}
          placeholder="Audio..."
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          disabled={isReadOnly}
        />
        {/* Audio Controls */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              if (isReadOnly) return;
              setGenerateText(shot.audio);
              setPopupMode('generate');
              // Reset to default voice when opening popup
              setSelectedVoiceId(defaultVoice.id);
              setSelectedVoiceName(defaultVoice.name);
              setShowAudioPopup(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
            title="Generate audio"
            disabled={isReadOnly}
          >
            <Volume2 className="w-3 h-3" />
            Generate
          </button>
          <button
            onClick={() => {
              if (isReadOnly) return;
              setShowEnhanceDialog(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
            title="Enhance text"
            disabled={isReadOnly}
          >
            <Sparkles className="w-3 h-3" />
            Enhance
          </button>
          <button
            onClick={() => {
              if (isReadOnly) return;
              setPopupMode('upload');
              // Reset to default voice when opening popup
              setSelectedVoiceId(defaultVoice.id);
              setSelectedVoiceName(defaultVoice.name);
              setShowAudioPopup(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            title="Upload audio"
            disabled={isReadOnly}
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
      <div className="col-span-12 md:col-span-2 px-2 md:px-4 py-1 md:py-3">
        <AutoResizeTextarea
          value={shot.visual}
          onChange={(e) => onUpdate({ visual: e.target.value })}
          placeholder="Visual..."
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
        />
      </div>

      {/* Image */}
      <div
        className="col-span-12 md:col-span-2 px-2 md:px-4 py-1 md:py-3"
        onMouseEnter={() => { isImageBoxHovered.current = true; }}
        onMouseLeave={() => { isImageBoxHovered.current = false; }}
      >
        <div className="relative">
          {isPasteUploading && (
            <div className="absolute inset-0 bg-indigo-500/20 border-2 border-indigo-500 rounded-lg flex items-center justify-center z-20">
              <span className="text-xs font-medium text-indigo-700 animate-pulse">Uploading...</span>
            </div>
          )}
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
              {/* Delete button removed - images can only be deleted from the popup dialog */}
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
                {onShowPrompt && shot.imageGenerationThread && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowPrompt('image');
                    }}
                    className="bg-gray-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-gray-700"
                    title="Show generation prompt"
                  >
                    <Info className="w-3 h-3" />
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
                <span className="text-[10px] text-gray-400">or Ctrl+V</span>
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

      {/* Video */}
      <div className="col-span-12 md:col-span-2 px-2 md:px-4 py-1 md:py-3">
        <div className="relative">
          {shot.videoUrl ? (
            <div className="relative group">
              <video
                src={shot.videoUrl}
                className="w-full aspect-video object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => {
                  // If video generation thread exists, open dialog, otherwise enlarge
                  if (shot.imageGenerationThread && onImageGenerate) {
                    onImageGenerate();
                  } else if (onEnlargeVideo) {
                    onEnlargeVideo(shot.videoUrl!);
                  }
                }}
                controls={false}
                muted
              />
              {/* Video camera icon to indicate this is a video */}
              <div className="absolute bottom-1 right-1 bg-black bg-opacity-60 rounded-full p-1.5 pointer-events-none z-10">
                <Video className="w-3 h-3 text-white" />
              </div>
              {/* Delete button removed - videos can only be deleted from the popup dialog */}
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
                {onShowPrompt && shot.imageGenerationThread && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowPrompt('video');
                    }}
                    className="bg-gray-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-gray-700"
                    title="Show generation prompt"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                )}
                {onEnlargeVideo && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEnlargeVideo(shot.videoUrl!);
                    }}
                    className="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-blue-600"
                    title="Enlarge video"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col items-center justify-center w-full aspect-video border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 relative">
                {videoUploadProgress !== null ? (
                  <>
                    <Video className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500 mb-2">{videoUploadProgress}%</span>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${videoUploadProgress}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Video className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500">Upload</span>
                  </>
                )}
                <input
                  type="file"
                  accept="video/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setVideoUploadProgress(0);
                      // Simulate progress since useS3Upload doesn't provide real-time progress
                      const progressInterval = setInterval(() => {
                        setVideoUploadProgress(prev => {
                          if (prev === null) return 0;
                          if (prev >= 90) {
                            clearInterval(progressInterval);
                            return prev;
                          }
                          return prev + 10;
                        });
                      }, 200);
                      try {
                        await onVideoUpload(file);
                        setVideoUploadProgress(100);
                        setTimeout(() => setVideoUploadProgress(null), 500);
                      } catch (error) {
                        setVideoUploadProgress(null);
                      } finally {
                        clearInterval(progressInterval);
                      }
                    }
                  }}
                  className="hidden"
                  disabled={videoUploadProgress !== null}
                />
              </label>
              {onImageGenerate && (
                <button
                  onClick={onImageGenerate}
                  className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  title="Generate video with AI"
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
      <div className="col-span-12 md:col-span-2 px-2 md:px-4 py-2 md:py-3 border-t md:border-t-0 md:border-l border-gray-100">
        <div className="flex flex-col space-y-2">
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Duration</label>
            {(() => {
              const totalFrames = Math.floor(shot.duration * 24);
              const mins = Math.floor(totalFrames / (24 * 60));
              const remainingFrames = totalFrames % (24 * 60);
              const secs = Math.floor(remainingFrames / 24);
              const frames = remainingFrames % 24;

              const updateFromParts = (m: number, s: number, f: number) => {
                const clamped_f = Math.max(0, Math.min(23, f));
                const clamped_s = Math.max(0, Math.min(59, s));
                const clamped_m = Math.max(0, m);
                const totalSeconds = clamped_m * 60 + clamped_s + clamped_f / 24;
                onUpdate({ duration: Math.max(0, totalSeconds) });
              };

              const handleWheel = (e: React.WheelEvent, field: 'min' | 'sec' | 'frame') => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1 : -1;
                if (field === 'min') updateFromParts(mins + delta, secs, frames);
                else if (field === 'sec') {
                  const newSecs = secs + delta;
                  if (newSecs > 59) updateFromParts(mins + 1, 0, frames);
                  else if (newSecs < 0 && mins > 0) updateFromParts(mins - 1, 59, frames);
                  else updateFromParts(mins, Math.max(0, newSecs), frames);
                } else {
                  const newFrames = frames + delta;
                  if (newFrames > 23) updateFromParts(mins, secs + 1, 0);
                  else if (newFrames < 0 && (secs > 0 || mins > 0)) {
                    if (secs > 0) updateFromParts(mins, secs - 1, 23);
                    else updateFromParts(mins - 1, 59, 23);
                  } else updateFromParts(mins, secs, Math.max(0, newFrames));
                }
              };

              const fieldClass = "w-7 text-center text-xs font-mono border border-gray-300 rounded px-0 py-1 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

              return (
                <div className="flex items-center" title="Scroll to adjust values">
                  <input
                    type="number"
                    min={0}
                    value={mins.toString().padStart(2, '0')}
                    onChange={(e) => updateFromParts(parseInt(e.target.value) || 0, secs, frames)}
                    onWheel={(e) => handleWheel(e, 'min')}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); updateFromParts(mins + 1, secs, frames); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); updateFromParts(Math.max(0, mins - 1), secs, frames); }
                    }}
                    className={fieldClass}
                    title="Minutes (scroll or arrow keys)"
                  />
                  <span className="text-xs font-mono text-gray-400 mx-px">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={secs.toString().padStart(2, '0')}
                    onChange={(e) => updateFromParts(mins, parseInt(e.target.value) || 0, frames)}
                    onWheel={(e) => handleWheel(e, 'sec')}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); handleWheel({ deltaY: -1, preventDefault: () => {} } as unknown as React.WheelEvent, 'sec'); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); handleWheel({ deltaY: 1, preventDefault: () => {} } as unknown as React.WheelEvent, 'sec'); }
                    }}
                    className={fieldClass}
                    title="Seconds (scroll or arrow keys)"
                  />
                  <span className="text-xs font-mono text-gray-400 mx-px">:</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={frames.toString().padStart(2, '0')}
                    onChange={(e) => updateFromParts(mins, secs, parseInt(e.target.value) || 0)}
                    onWheel={(e) => handleWheel(e, 'frame')}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') { e.preventDefault(); handleWheel({ deltaY: -1, preventDefault: () => {} } as unknown as React.WheelEvent, 'frame'); }
                      if (e.key === 'ArrowDown') { e.preventDefault(); handleWheel({ deltaY: 1, preventDefault: () => {} } as unknown as React.WheelEvent, 'frame'); }
                    }}
                    className={fieldClass}
                    title="Frames @24fps (scroll or arrow keys)"
                  />
                </div>
              );
            })()}
          </div>
          <button
            onClick={onDeleteShot}
            className="flex items-center space-x-1 text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors self-start"
            title="Delete shot"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-xs">Delete</span>
          </button>
        </div>
      </div>

      {/* Enhance Dialog */}
      {showEnhanceDialog && (
        <AVEnhanceDialog
          isOpen={showEnhanceDialog}
          onClose={() => setShowEnhanceDialog(false)}
          isReadOnly={isReadOnly}
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
