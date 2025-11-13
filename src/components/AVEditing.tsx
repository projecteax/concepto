'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AVScript, AVEditingSlide, AVEditingAudioTrack, AVEditingData, AVSegment, AVShot } from '@/types';
import { 
  Play, 
  Pause, 
  Square,
  Plus,
  Trash2,
  Volume2,
  Image as ImageIcon,
  X,
  ZoomIn,
  ZoomOut,
  Download,
  Filter,
  Save
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

interface AVEditingProps {
  episodeId: string;
  avScript?: AVScript;
  onSave: (avScript: AVScript) => void;
}

const MIN_PIXELS_PER_SECOND = 10; // Minimum zoom: 10px = 1 second
const MAX_PIXELS_PER_SECOND = 500; // Maximum zoom: 500px = 1 second
const DEFAULT_PIXELS_PER_SECOND = 50; // Default zoom: 50px = 1 second
const ZOOM_STEP = 1.2; // Zoom increment/decrement factor
const MIN_DURATION = 0.5; // Minimum slide duration in seconds

export function AVEditing({ episodeId, avScript, onSave }: AVEditingProps) {
  const [editingData, setEditingData] = useState<AVEditingData | null>(null);
  const [slides, setSlides] = useState<AVEditingSlide[]>([]);
  const [audioTracks, setAudioTracks] = useState<AVEditingAudioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_PIXELS_PER_SECOND); // Zoom level
  // CRITICAL: Multi-select support - use Set for efficient lookups
  const [selectedSlides, setSelectedSlides] = useState<Set<string>>(new Set());
  // Legacy single-select for compatibility (derived from selectedSlides)
  const selectedSlide = selectedSlides.size === 1 ? Array.from(selectedSlides)[0] : null;
  
  // CRITICAL: Undo/Redo history for timeline actions
  const [history, setHistory] = useState<AVEditingSlide[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const maxHistorySize = 50;
  const [selectedResizeHandle, setSelectedResizeHandle] = useState<'start' | 'end' | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartDuration, setResizeStartDuration] = useState(0);
  const [resizeStartTime, setResizeStartTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  // CRITICAL: Track hovered slide during drag for insertion logic
  const [hoveredSlideId, setHoveredSlideId] = useState<string | null>(null);
  const [insertBeforeSlideId, setInsertBeforeSlideId] = useState<string | null>(null);
  const [isDraggingAudioTrack, setIsDraggingAudioTrack] = useState(false);
  const [draggedAudioTrackId, setDraggedAudioTrackId] = useState<string | null>(null);
  const [audioTrackDragStartTime, setAudioTrackDragStartTime] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('');
  const [showAddAudioPopup, setShowAddAudioPopup] = useState(false);
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null);
  const [newAudioVoiceName, setNewAudioVoiceName] = useState('Music');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'slide' | 'audio';
    id: string;
    name?: string;
  } | null>(null);
  
  const previewRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const waveformDataRef = useRef<Map<string, number[]>>(new Map());
  const slidesRef = useRef<AVEditingSlide[]>(slides);
  const audioTracksRef = useRef<AVEditingAudioTrack[]>(audioTracks);
  const currentTimeRef = useRef<number>(currentTime);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const editingDataRef = useRef<AVEditingData | null>(editingData);
  const saveQueueRef = useRef<AVEditingData | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autosaveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const lastSaveTimeRef = useRef<number>(0);
  const lastSavedDataRef = useRef<string>('');
  const isInitializingRef = useRef<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { uploadFile } = useS3Upload();
  
  // Keep refs in sync with state
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);
  
  useEffect(() => {
    audioTracksRef.current = audioTracks;
  }, [audioTracks]);
  
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  
  useEffect(() => {
    editingDataRef.current = editingData;
  }, [editingData]);
  
  // Initialize AudioContext
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    
    return () => {
      // Cleanup audio elements - capture current ref value
      const audioElements = audioElementsRef.current;
      audioElements.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioElements.clear();
      
      const audioContext = audioContextRef.current;
      if (audioContext && audioContext.state !== 'closed') {
        try {
          audioContext.close();
        } catch (error) {
          // Ignore errors if already closed
          console.log('AudioContext already closed or closing');
        }
      }
    };
  }, []);

  // Helper function to convert Date to Firestore Timestamp
  const dateToTimestamp = useCallback((date: Date | undefined | null): Timestamp | null => {
    if (!date) return null;
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date detected, using current date');
      return Timestamp.now();
    }
    try {
      return Timestamp.fromDate(date);
    } catch (error) {
      console.warn('Error converting date to timestamp, using current date:', error);
      return Timestamp.now();
    }
  }, []);

  // Helper function to convert AVEditingData to Firestore format
  const convertToFirestoreFormat = useCallback((data: AVEditingData): Record<string, unknown> => {
    try {
      return {
        ...data,
        slides: data.slides.map(slide => ({
          ...slide,
          createdAt: dateToTimestamp(slide.createdAt),
          updatedAt: dateToTimestamp(slide.updatedAt),
        })),
        audioTracks: data.audioTracks.map(track => ({
          ...track,
          createdAt: dateToTimestamp(track.createdAt),
          updatedAt: dateToTimestamp(track.updatedAt),
        })),
        createdAt: dateToTimestamp(data.createdAt),
        updatedAt: dateToTimestamp(data.updatedAt),
      };
    } catch (error) {
      console.error('Error converting to Firestore format:', error);
      throw error;
    }
  }, [dateToTimestamp]);

  // Save editing data to Firebase with aggressive queue management to prevent write exhaustion
  const saveEditingData = useCallback(async (data: AVEditingData, immediate = false) => {
    // CRITICAL: Skip saves during sync operations (unless immediate)
    if (skipAutoSaveRef.current && !immediate) {
      console.log('⏸️ Skipping auto-save - sync in progress');
      return;
    }
    
    // Skip saves during initialization
    if (isInitializingRef.current && !immediate) {
      return;
    }

    // Create a hash of the data to check if it actually changed
    // Sort slides by order to ensure consistent hashing
    const sortedSlides = [...data.slides].sort((a, b) => a.order - b.order);
    const dataHash = JSON.stringify({
      slides: sortedSlides.map(s => ({ id: s.id, startTime: s.startTime, duration: s.duration, order: s.order, shotId: s.shotId })),
      audioTracks: data.audioTracks.map(t => ({ id: t.id, startTime: t.startTime, duration: t.duration })),
    });

    // Skip if data hasn't changed (only for non-immediate saves)
    if (lastSavedDataRef.current === dataHash && !immediate) {
      // Silently skip - don't log to reduce console spam
      return;
    }

    // CRITICAL: Increase throttle to 90 seconds (was 30) to drastically reduce writes
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    if (!immediate && timeSinceLastSave < 90000) {
      // Queue the save for later
      saveQueueRef.current = data;
      // Schedule save after throttle period
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const remainingTime = 90000 - timeSinceLastSave;
      console.log(`⏸️ Throttling save - ${Math.round(remainingTime / 1000)}s remaining`);
      saveTimeoutRef.current = setTimeout(() => {
        if (saveQueueRef.current) {
          const queuedData = saveQueueRef.current;
          saveQueueRef.current = null;
          saveEditingData(queuedData, false);
        }
      }, Math.max(remainingTime, 1000));
      return;
    }

    // Queue the save if we're already saving
    if (isSavingRef.current && !immediate) {
      // Queue - don't log to reduce console spam
      saveQueueRef.current = data;
      return;
    }

    // If there's a pending timeout, clear it and use the latest data
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const performSave = async () => {
      if (isSavingRef.current) {
        // If still saving, queue this data
        saveQueueRef.current = data;
        return;
      }

      isSavingRef.current = true;
      lastSaveTimeRef.current = Date.now();
      setSaveStatus('saving');
      
      try {
        const docRef = doc(db, 'avEditing', episodeId);
        const firestoreData = convertToFirestoreFormat(data);
        
        console.log('💾 Saving to Firebase:', {
          slidesCount: data.slides.length,
          audioTracksCount: data.audioTracks.length,
          slidesOrder: sortedSlides.map(s => ({ id: s.id, order: s.order })),
        });
        
        // Use merge: true to reduce write conflicts
        await setDoc(docRef, firestoreData, { merge: true });
        setEditingData(data);
        lastSavedDataRef.current = dataHash;
        setSaveStatus('saved');
        console.log('✅ Saved AV editing data to Firebase');
        
        // Reset save status after 2 seconds
        setTimeout(() => {
          setSaveStatus(prev => prev === 'saved' ? 'idle' : prev);
        }, 2000);
        
        // Wait a bit before processing queued saves to avoid overwhelming Firestore
        if (saveQueueRef.current) {
          const queuedData = saveQueueRef.current;
          saveQueueRef.current = null;
          // Wait at least 2 seconds before processing next queued save
          setTimeout(() => {
            isSavingRef.current = false;
            if (saveQueueRef.current) {
              const queuedData = saveQueueRef.current;
              saveQueueRef.current = null;
              saveEditingData(queuedData, false);
            }
          }, 2000);
          return;
        }
      } catch (error) {
        console.error('❌ Error saving AV editing data:', error);
        setSaveStatus('error');
        // If it's a resource-exhausted error, wait much longer before retrying
        if (error instanceof Error && (error.message.includes('resource-exhausted') || (error as any).code === 'resource-exhausted')) {
          console.warn('⚠️ Firestore write exhausted, waiting 15 seconds before retry...');
          saveQueueRef.current = data;
          setTimeout(() => {
            isSavingRef.current = false;
            setSaveStatus('idle');
            if (saveQueueRef.current) {
              const queuedData = saveQueueRef.current;
              saveQueueRef.current = null;
              saveEditingData(queuedData, false);
            }
          }, 15000); // Wait 15 seconds before retry
          return;
        }
        // For other errors, retry after a delay
        saveQueueRef.current = data;
        setTimeout(() => {
          isSavingRef.current = false;
          setSaveStatus('idle');
          if (saveQueueRef.current) {
            const queuedData = saveQueueRef.current;
            saveQueueRef.current = null;
            saveEditingData(queuedData, false);
          }
        }, 5000);
      } finally {
        if (!saveQueueRef.current) {
          isSavingRef.current = false;
        }
      }
    };

    if (immediate) {
      await performSave();
    } else {
      // CRITICAL: Increase debounce to 90 seconds (was 30) to drastically reduce writes
      // Clear any existing timeout to reset the timer
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        performSave();
      }, 90000); // 90 seconds - much less frequent saves
    }
  }, [episodeId, convertToFirestoreFormat]);

  // Initialize slides from AV script
  const initializeFromAVScript = useCallback(() => {
    if (!avScript) {
      console.log('⚠️ Cannot initialize: no AV script available');
      return;
    }

    console.log('🔄 Initializing AV editing from AV script...', {
      segmentsCount: avScript.segments.length,
      totalShots: avScript.segments.reduce((sum, seg) => sum + seg.shots.length, 0),
    });

    const newSlides: AVEditingSlide[] = [];
    const now = new Date();

    // NEW APPROACH: Direct mapping Segment (Scene) → Shots (Rows) → Slides
    // Process each segment (scene) and create slides for each shot (row)
    avScript.segments.forEach((segment, segmentIndex) => {
      console.log(`📹 Initializing Scene ${segment.segmentNumber} (${segment.id}): "${segment.title}" - ${segment.shots.length} shots/rows`);
      
      // Each segment (scene) starts from time 0:00:00
      let segmentStartTime = 0;
      
      // Process each shot (row) in this segment (scene)
      segment.shots.forEach((shot, shotIndex) => {
        const slideDuration = shot.duration || 3;
        
        // Create slide for every shot (row), even if it doesn't have an image yet
        const slide: AVEditingSlide = {
          id: `slide-${shot.id}`, // Use shot.id as the unique identifier
          shotId: shot.id, // Direct reference to the shot (row) in AV script
          imageUrl: shot.imageUrl || undefined, // May be undefined if shot doesn't have image yet
          duration: slideDuration,
          startTime: segmentStartTime, // Each scene starts from 0:00:00
          order: segmentIndex * 1000 + shotIndex, // Order by segment then shot
          isFromAVScript: true,
          createdAt: now,
          updatedAt: now,
        };
        
        newSlides.push(slide);
        segmentStartTime += slideDuration;
        
        if (shot.imageUrl) {
          console.log(`  ✅ Slide ${shotIndex + 1}: shot ${shot.id} (with image)`);
        } else {
          console.log(`  ⚠️ Slide ${shotIndex + 1}: shot ${shot.id} (no image yet - placeholder)`);
        }
      });
      
      console.log(`  ✅ Scene ${segment.segmentNumber} initialized: ${segment.shots.length} slides`);
    });

    console.log(`✅ Created ${newSlides.length} slides from AV script`);

    // Calculate total duration (max across all segments since each starts at 0:00:00)
    const maxSegmentDuration = Math.max(...avScript.segments.map(seg => {
      return seg.shots.reduce((sum, shot) => sum + (shot.duration || 3), 0);
    }), 0);

    const newEditingData: AVEditingData = {
      id: `av-editing-${episodeId}`,
      episodeId,
      slides: newSlides,
      audioTracks: [],
      totalDuration: maxSegmentDuration,
      createdAt: now,
      updatedAt: now,
    };

    isInitializingRef.current = true;
    hasLoadedDataRef.current = true; // Mark as loaded so we don't re-initialize
    setEditingData(newEditingData);
    setSlides(newSlides);
    setAudioTracks([]);
    
    // Update refs immediately
    slidesRef.current = newSlides;
    audioTracksRef.current = [];
    editingDataRef.current = newEditingData;
    
    // Mark initialization as complete after a short delay
    setTimeout(() => {
      isInitializingRef.current = false;
      // Update last saved data hash
      lastSavedDataRef.current = JSON.stringify({
        slides: newSlides.map(s => ({ id: s.id, startTime: s.startTime, duration: s.duration, order: s.order, shotId: s.shotId })),
        audioTracks: [],
      });
      console.log('✅ Initialization from AV script complete, autosave enabled');
    }, 1000);
    // Save will be triggered by auto-save effect after initialization
  }, [avScript, episodeId]);

  // Track if we've loaded data to prevent initialization from overwriting
  const hasLoadedDataRef = useRef(false);
  // Track previous AV script to prevent unnecessary syncs
  const previousAVScriptRef = useRef<string>('');
  // Track previous slides and audio tracks to detect actual changes
  const previousSlidesHashRef = useRef<string>('');
  const previousAudioTracksHashRef = useRef<string>('');
  // Track previous slides hash for AV script updates to prevent unnecessary saves
  const previousSlidesForAVScriptRef = useRef<string>('');
  const avScriptUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL: Add sync lock to prevent multiple syncs running simultaneously
  const isSyncingRef = useRef(false);
  // CRITICAL: Add flag to skip auto-save during sync operations
  const skipAutoSaveRef = useRef(false);
  // CRITICAL: Track last sync time to prevent sync loops
  const lastSyncTimeRef = useRef<number>(0);
  const SYNC_COOLDOWN = 10000; // Minimum 10 seconds between syncs (increased from 5)
  
  // CRITICAL: Add state to trigger sync after Firebase load
  const [firebaseLoadComplete, setFirebaseLoadComplete] = useState(false);

  // Load editing data from Firebase
  useEffect(() => {
    const loadEditingData = async () => {
      try {
        console.log('🔄 Loading AV editing data from Firebase...');
        const docRef = doc(db, 'avEditing', episodeId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as Record<string, unknown>;
          console.log('📄 Raw data from Firebase:', {
            hasSlides: !!data.slides,
            slidesLength: Array.isArray(data.slides) ? data.slides.length : 0,
            hasAudioTracks: !!data.audioTracks,
            audioTracksLength: Array.isArray(data.audioTracks) ? data.audioTracks.length : 0,
            audioTracks: data.audioTracks,
          });
          
          // Convert Firestore timestamps to Date objects
          const timestampToDate = (ts: unknown): Date => {
            if (ts instanceof Date) return ts;
            if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
              return (ts as { toDate: () => Date }).toDate();
            }
            if (ts && typeof ts === 'object' && 'seconds' in ts && typeof (ts as { seconds: number }).seconds === 'number') {
              return new Date((ts as { seconds: number }).seconds * 1000);
            }
            if (typeof ts === 'string' || typeof ts === 'number') {
              return new Date(ts);
            }
            return new Date();
          };
          
          const processedData: AVEditingData = {
            ...data,
            slides: (Array.isArray(data.slides) ? data.slides : []).map((slide: Record<string, unknown>) => ({
              ...slide,
              createdAt: timestampToDate(slide.createdAt),
              updatedAt: timestampToDate(slide.updatedAt),
            })) as AVEditingSlide[],
            audioTracks: (Array.isArray(data.audioTracks) ? data.audioTracks : []).map((track: Record<string, unknown>) => ({
              ...track,
              createdAt: timestampToDate(track.createdAt),
              updatedAt: timestampToDate(track.updatedAt),
            })) as AVEditingAudioTrack[],
            createdAt: timestampToDate(data.createdAt),
            updatedAt: timestampToDate(data.updatedAt),
          } as AVEditingData;
          
          console.log('📥 Processed AV editing data:', {
            slidesCount: processedData.slides.length,
            audioTracksCount: processedData.audioTracks.length,
            audioTracks: processedData.audioTracks.map(t => ({
              id: t.id,
              name: t.name,
              audioUrl: t.audioUrl,
              startTime: t.startTime,
              duration: t.duration,
            })),
          });
          
          // CRITICAL: Validate loaded slides against current AV script structure
          // This ensures we don't use stale data from deleted segments/shots
          let hasValidData = processedData.slides && processedData.slides.length > 0;
          let invalidSlidesCount = 0;
          let missingSlidesCount = 0;
          let needsSync = false;
          
          // Always validate if AV script is available
          if (hasValidData && avScript) {
            // Get all valid shot IDs from current AV script
            const validShotIds = new Set<string>();
            avScript.segments.forEach(segment => {
              segment.shots.forEach(shot => {
                validShotIds.add(shot.id);
              });
            });
            
            // Check for invalid slides (from deleted shots)
            const invalidSlides = processedData.slides.filter(slide => {
              // Keep manual slides (not from AV script)
              if (!slide.isFromAVScript || !slide.shotId) return false;
              // Mark as invalid if shot no longer exists in AV script
              return !validShotIds.has(slide.shotId);
            });
            
            invalidSlidesCount = invalidSlides.length;
            
            // Check for missing slides (shots in AV script that don't have slides)
            const loadedSlideShotIds = new Set(
              processedData.slides
                .filter(s => s.shotId && s.isFromAVScript)
                .map(s => s.shotId!)
            );
            missingSlidesCount = Array.from(validShotIds).filter(shotId => !loadedSlideShotIds.has(shotId)).length;
            
            // Data is invalid if we have invalid slides or missing slides
            // This means the loaded data doesn't match the current AV script structure
            if (invalidSlidesCount > 0 || missingSlidesCount > 0) {
              hasValidData = false;
              needsSync = true;
              console.log(`⚠️ Loaded data doesn't match AV script structure:`, {
                invalidSlidesCount,
                missingSlidesCount,
                validShotIdsCount: validShotIds.size,
                loadedSlidesCount: processedData.slides.length,
                loadedSlideShotIdsCount: loadedSlideShotIds.size,
              });
            }
          } else if (hasValidData && !avScript) {
            // If we have data but no AV script yet, mark it as potentially invalid
            // The sync will validate once AV script becomes available
            console.log('⚠️ Loaded data but AV script not yet available - will validate on sync');
            needsSync = true;
          }
          
          if (hasValidData) {
            console.log('✅ Valid data loaded from Firebase - using it');
            hasLoadedDataRef.current = true;
            isInitializingRef.current = true; // Mark as initializing
            setEditingData(processedData);
            setSlides(processedData.slides);
            setAudioTracks(processedData.audioTracks);
            
            // Update refs immediately so sync can see the loaded data
            slidesRef.current = processedData.slides;
            audioTracksRef.current = processedData.audioTracks;
            editingDataRef.current = processedData;
            
            // Mark initialization as complete after a short delay
            setTimeout(() => {
              isInitializingRef.current = false;
              // Update last saved data hash to prevent false "unchanged" detection
              const sortedLoadedSlides = [...processedData.slides].sort((a, b) => a.order - b.order);
              lastSavedDataRef.current = JSON.stringify({
                slides: sortedLoadedSlides.map(s => ({ id: s.id, startTime: s.startTime, duration: s.duration, order: s.order, shotId: s.shotId })),
                audioTracks: processedData.audioTracks.map(t => ({ id: t.id, startTime: t.startTime, duration: t.duration })),
              });
              console.log('✅ Initialization complete, autosave enabled - sync will run after initialization');
              // CRITICAL: Force sync to run after initialization by clearing the previous hash
              // This ensures missing slides are detected and added even if AV script hasn't changed
              previousAVScriptRef.current = '';
              // Also clear the last sync time to ensure sync runs immediately
              lastSyncTimeRef.current = 0;
              // CRITICAL: Trigger sync by updating state
              setFirebaseLoadComplete(true);
              console.log('🔄 Cleared AV script hash and sync cooldown - sync will run after initialization');
            }, 2000); // Increased to 2 seconds to ensure state is fully updated
          } else {
            // Data is invalid or needs sync
            if (processedData.slides && processedData.slides.length > 0) {
              if (needsSync) {
                console.log(`⚠️ Loaded data needs sync - will re-sync from AV script:`, {
                  invalidSlidesCount,
                  missingSlidesCount,
                  loadedSlidesCount: processedData.slides.length,
                });
              } else {
                console.log(`⚠️ Firebase data doesn't match current AV script - will re-sync from AV script:`, {
                  invalidSlidesCount,
                  missingSlidesCount,
                  loadedSlidesCount: processedData.slides.length,
                });
              }
            } else {
              console.log('⚠️ Firebase document exists but has no slides - will sync from AV script');
            }
            // Document exists but is invalid/stale - don't mark as loaded, allow sync from AV script
            hasLoadedDataRef.current = false;
            // Don't set state with stale data - let sync effect handle it
            // Trigger sync to initialize from AV script
            setFirebaseLoadComplete(true);
          }
        } else {
          console.log('⚠️ No existing data found in Firebase, will initialize from AV script if available');
          // Mark that we tried to load but found nothing - this allows initialization
          hasLoadedDataRef.current = false;
          // Trigger sync to initialize from AV script
          setFirebaseLoadComplete(true);
        }
      } catch (error) {
        console.error('❌ Error loading AV editing data from Firebase:', error);
        // Check if it's a quota/resource-exhausted error
        const isQuotaError = error instanceof Error && (
          error.message.includes('resource-exhausted') || 
          error.message.includes('quota') ||
          error.message.includes('quota-exceeded') ||
          (error as any).code === 'resource-exhausted' ||
          (error as any).code === 'quota-exceeded' ||
          (error as any).code === 8 // Resource exhausted error code
        );
        
        if (isQuotaError) {
          console.warn('⚠️ Firebase quota exceeded - will initialize from AV script instead');
        } else {
          console.warn('⚠️ Firebase error (might be quota related) - will try to initialize from AV script');
        }
        
        // Mark that load failed - this allows initialization from AV script
        hasLoadedDataRef.current = false;
        // Trigger sync to initialize from AV script even if Firebase fails
        setFirebaseLoadComplete(true);
      }
    };

    loadEditingData();
  }, [episodeId, avScript]); // Re-validate when avScript changes to catch stale data

  // Initialize from AV script when it becomes available (only if no valid data was loaded)
  useEffect(() => {
    // Wait a bit to ensure loading has completed
    const timer = setTimeout(() => {
      // Check if we should initialize:
      // 1. We have AV script
      // 2. We haven't loaded valid data from Firebase (or load failed)
      // 3. No slides exist (or very few slides, which might indicate incomplete data)
      const shouldInitialize = avScript && 
        !hasLoadedDataRef.current && 
        slides.length === 0;
      
      if (shouldInitialize) {
        console.log('🔄 Initializing from AV script (no valid data found)...', {
          hasLoadedData: hasLoadedDataRef.current,
          slidesCount: slides.length,
          audioTracksCount: audioTracks.length,
          avScriptSegments: avScript.segments.length,
          avScriptShots: avScript.segments.reduce((sum, seg) => sum + seg.shots.length, 0),
        });
        initializeFromAVScript();
      } else if (hasLoadedDataRef.current) {
        console.log('⏸️ Skipping AV script initialization - valid data already loaded from Firebase', {
          slidesCount: slides.length,
          audioTracksCount: audioTracks.length,
        });
      } else if (!avScript) {
        console.log('⏸️ Skipping AV script initialization - no AV script available');
      } else if (slides.length > 0) {
        console.log('⏸️ Skipping AV script initialization - slides already exist', {
          slidesCount: slides.length,
        });
      }
    }, 1000); // Wait 1 second for Firebase load to complete (increased from 500ms)

    return () => clearTimeout(timer);
  }, [avScript, slides.length, audioTracks.length, initializeFromAVScript]);

  // Sync shots and audio tracks from AV script to AV editing (bidirectional sync)
  // This ensures AV editing always reflects the current state of AV script
  useEffect(() => {
    if (!avScript) {
      console.log('⏸️ Sync skipped - no AV script');
      return;
    }
    
    // CRITICAL: Check for missing slides FIRST, before any early returns
    // This ensures we always detect missing slides even if initialization is in progress
    const currentSlides = slidesRef.current;
    const currentAudioTracks = audioTracksRef.current;
    
    // Get all shot IDs from AV script to verify completeness
    const allShotIdsFromScript = new Set<string>();
    avScript.segments.forEach(segment => {
      segment.shots.forEach(shot => {
        allShotIdsFromScript.add(shot.id);
      });
    });

    // Find all shots that don't have corresponding slides
    // IMPORTANT: Create slides for ALL shots from AV script, not just ones with images
    const existingSlideShotIds = new Set(currentSlides.filter(s => s.shotId).map(s => s.shotId!));
    const missingShotIds = Array.from(allShotIdsFromScript).filter(shotId => !existingSlideShotIds.has(shotId));
    
    // CRITICAL: Prevent sync loops with cooldown period, BUT skip cooldown if slides are missing
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;
    if (isSyncingRef.current) {
      console.log('⏸️ Sync skipped - sync already in progress');
      return;
    }
    
    // Check if we have invalid slides (from deleted shots) - if so, force sync regardless of cooldown
    const slidesWithInvalidShots = currentSlides.filter(slide => {
      if (!slide.shotId || !slide.isFromAVScript) return false;
      return !allShotIdsFromScript.has(slide.shotId);
    });
    
    // Skip cooldown if we have invalid slides or missing slides
    const shouldSkipCooldown = missingShotIds.length > 0 || slidesWithInvalidShots.length > 0;
    
    if (!shouldSkipCooldown && timeSinceLastSync < SYNC_COOLDOWN) {
      console.log(`⏸️ Sync skipped - cooldown active (${Math.round((SYNC_COOLDOWN - timeSinceLastSync) / 1000)}s remaining)`);
      return;
    }
    
    if (shouldSkipCooldown) {
      console.log(`⚠️ Skipping cooldown - ${missingShotIds.length} missing slides, ${slidesWithInvalidShots.length} invalid slides`);
    }

    // Create a hash of the AV script to detect actual changes
    // CRITICAL: Include segment ID in hash to detect when segments are deleted/recreated
    const avScriptHash = JSON.stringify({
      segments: avScript.segments.map(seg => ({
        id: seg.id, // CRITICAL: Include segment ID to detect segment deletion/recreation
        segmentNumber: seg.segmentNumber,
        shots: seg.shots.map(shot => ({
          id: shot.id,
          imageUrl: shot.imageUrl,
          duration: shot.duration,
          audioFiles: shot.audioFiles?.map(af => ({
            id: af.id,
            audioUrl: af.audioUrl,
            voiceId: af.voiceId,
            voiceName: af.voiceName,
          })) || [],
        })),
      })),
    });

    // Log current state for debugging
    console.log('🔍 Sync check:', {
      existingSlidesCount: currentSlides.length,
      existingSlideShotIdsCount: existingSlideShotIds.size,
      allShotIdsFromScriptCount: allShotIdsFromScript.size,
      missingShotIdsCount: missingShotIds.length,
      missingShotIds: missingShotIds.slice(0, 10), // Show first 10
      previousHashExists: !!previousAVScriptRef.current,
      hashMatches: previousAVScriptRef.current === avScriptHash,
      isInitializing: isInitializingRef.current,
      isSyncing: isSyncingRef.current,
    });

    // CRITICAL: If slides are missing, FORCE sync to run regardless of initialization state
    // This ensures missing slides (like scene 02) are always added
    if (missingShotIds.length > 0) {
      console.log(`⚠️ Missing slides for ${missingShotIds.length} shots - FORCING SYNC:`, missingShotIds);
      // Group missing shots by segment for better logging
      const missingBySegment = avScript.segments.map(segment => {
        const missingInSegment = segment.shots.filter(shot => missingShotIds.includes(shot.id));
        return missingInSegment.length > 0 ? {
          segmentNumber: segment.segmentNumber,
          segmentId: segment.id,
          segmentTitle: segment.title,
          missingCount: missingInSegment.length,
          missingShotIds: missingInSegment.map(s => s.id),
        } : null;
      }).filter(Boolean);
      console.log('📊 Missing slides by segment:', missingBySegment);
      
      // Clear previous hash to FORCE sync when slides are missing
      // This ensures sync runs even if AV script hash hasn't changed
      previousAVScriptRef.current = '';
      console.log('🔄 Cleared previous hash to force sync for missing slides');
      
      // FORCE initialization to complete if slides are missing
      // This ensures sync can run to add missing slides
      if (isInitializingRef.current) {
        console.log('⚠️ Forcing initialization to complete - missing slides detected');
        isInitializingRef.current = false;
      }
    }

    // CRITICAL: Always validate that existing slides match the current AV script
    // Check if any existing slides reference shots that no longer exist
    // (slidesWithInvalidShots was already calculated above)
    
    // CRITICAL: Always check if slides match the current AV script structure
    // Even if hash matches, we need to verify slides exist for all shots
    // This handles edge cases where segments are deleted/recreated with same numbers
    
    // If AV script hash changed, we definitely need to sync
    const hashChanged = previousAVScriptRef.current !== avScriptHash;
    
    if (hashChanged) {
      console.log('🔄 AV script hash changed - sync required');
    }
    
    // If AV script hasn't changed AND all shots have slides AND no invalid slides exist, skip sync
    // BUT if slides are missing or invalid, we need to sync
    if (!hashChanged && missingShotIds.length === 0 && slidesWithInvalidShots.length === 0) {
      console.log('⏸️ Skipping sync - AV script unchanged, all shots have slides, and no invalid slides');
      // Release sync lock if we're skipping
      if (isSyncingRef.current) {
        isSyncingRef.current = false;
        skipAutoSaveRef.current = false;
      }
      return;
    }
    
    // If we have invalid slides (from deleted shots), force sync to clean them up
    if (slidesWithInvalidShots.length > 0) {
      console.log(`⚠️ Found ${slidesWithInvalidShots.length} slides for deleted shots - FORCING SYNC:`, 
        slidesWithInvalidShots.map(s => ({ slideId: s.id, shotId: s.shotId })));
      // Clear previous hash to force sync
      previousAVScriptRef.current = '';
    }
    
    // If hash changed, clear it to ensure sync runs
    if (hashChanged) {
      console.log('🔄 AV script structure changed - clearing previous hash to force sync');
      previousAVScriptRef.current = '';
    }

    // CRITICAL: If we have missing slides, we MUST sync regardless of initialization state
    // Missing slides indicate we need to sync from AV script
    if (isInitializingRef.current && missingShotIds.length === 0) {
      console.log('⏸️ Sync delayed - initialization in progress');
      const timeout = setTimeout(() => {
        console.log('⚠️ Sync timeout - forcing sync despite initialization flag');
        // Force sync to run after timeout
        isInitializingRef.current = false;
      }, 3000);
      return () => {
        clearTimeout(timeout);
        // Release sync lock if we're returning early
        if (isSyncingRef.current) {
          isSyncingRef.current = false;
          skipAutoSaveRef.current = false;
        }
      };
    }
    
    // CRITICAL: Force initialization to complete if we have missing slides
    // This ensures sync runs immediately when slides are missing from AV script
    if (missingShotIds.length > 0 && isInitializingRef.current) {
      console.log('⚠️ Forcing initialization to complete - missing slides must be synced');
      isInitializingRef.current = false;
    }
    
    // CRITICAL: Set sync lock to prevent concurrent syncs
    isSyncingRef.current = true;
    skipAutoSaveRef.current = true; // Prevent auto-save during sync
    lastSyncTimeRef.current = now;
    console.log('🔒 Sync lock acquired');
    
    // If editingData doesn't exist, create it but don't return - continue with sync
    let currentEditingData = editingData;
    if (!currentEditingData) {
      console.log('⚠️ No editingData found, creating minimal structure for sync...');
      // Create a minimal editingData structure
      currentEditingData = {
        id: `av-editing-${episodeId}`,
        episodeId,
        slides: [],
        audioTracks: [],
        totalDuration: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setEditingData(currentEditingData);
      editingDataRef.current = currentEditingData;
    }
    
    console.log('🔄 Sync effect triggered', {
      hasAVScript: !!avScript,
      hasEditingData: !!currentEditingData,
      isInitializing: isInitializingRef.current,
      segmentsCount: avScript?.segments.length,
      missingSlidesCount: missingShotIds.length,
    });

    // Update hash - will be set again after sync completes successfully
    // But we clear it above if slides are missing to force sync

    const newSlides: AVEditingSlide[] = [];
    
    // Calculate current max time - use all slides (including ones from other segments)
    // This ensures slides are placed sequentially across all segments
    let currentMaxTime = 0;
    if (currentSlides.length > 0) {
      currentMaxTime = Math.max(...currentSlides.map(s => s.startTime + s.duration), 0);
    }
    
    console.log('🔄 Starting AV script sync:', {
      segmentsCount: avScript.segments.length,
      totalShots: allShotIdsFromScript.size,
      shotsPerSegment: avScript.segments.map(seg => ({ 
        segmentNumber: seg.segmentNumber, 
        segmentId: seg.id,
        shotsCount: seg.shots.length,
        shotIds: seg.shots.map(s => s.id),
      })),
      existingSlidesCount: currentSlides.length,
      existingSlideShotIdsCount: existingSlideShotIds.size,
      missingShotsCount: missingShotIds.length,
      missingShotIds: missingShotIds,
      currentMaxTime,
    });

    // Build a map of all audio files that should exist in AV editing (from AV script)
    // Key: `${shotId}-${audioFile.id}` to uniquely identify each audio file
    const expectedAudioTracks = new Map<string, {
      audioFile: any;
      shotId: string;
      slideStartTime: number;
      voiceName: string;
    }>();

    // CRITICAL: Track processed shot IDs to prevent duplicates
    const processedShotIds = new Set<string>();
    const slidesById = new Map<string, AVEditingSlide>(); // Track slides by ID to prevent duplicates
    
    // NEW APPROACH: Direct mapping Segment (Scene) → Shots (Rows) → Slides
    // Process each segment (scene) and create/update slides for each shot (row)
    avScript.segments.forEach((segment, segmentIndex) => {
      console.log(`📹 Processing Scene ${segment.segmentNumber} (${segment.id}): "${segment.title}" - ${segment.shots.length} shots/rows`);
      
      // Each segment (scene) starts from time 0:00:00
      let segmentStartTime = 0;
      
      // Process each shot (row) in this segment (scene)
      segment.shots.forEach((shot, shotIndex) => {
        // CRITICAL: Skip if we've already processed this shot ID (prevent duplicates)
        if (processedShotIds.has(shot.id)) {
          console.warn(`⚠️ Duplicate shot ID detected: ${shot.id} - skipping to prevent duplicate slide`);
          return;
        }
        processedShotIds.add(shot.id);
        
        // Find existing slide for this shot by shotId
        // Check both currentSlides and newSlides (already processed in this sync)
        const existingSlide = currentSlides.find(s => s.shotId === shot.id) || 
                             slidesById.get(`slide-${shot.id}`);
        
        // Calculate slide start time (sequential within segment)
        const slideStartTime = segmentStartTime;
        const slideDuration = shot.duration || 3;
        
        const slideId = `slide-${shot.id}`;
        
        // CRITICAL: Skip if we've already added a slide with this ID
        if (slidesById.has(slideId)) {
          console.warn(`⚠️ Duplicate slide ID detected: ${slideId} - skipping to prevent duplicate`);
          return;
        }
        
        if (existingSlide) {
          // Slide exists - update it if needed (image, duration, etc.)
          const needsUpdate = 
            existingSlide.imageUrl !== shot.imageUrl ||
            existingSlide.duration !== slideDuration ||
            existingSlide.startTime !== slideStartTime;
          
          if (needsUpdate) {
            console.log(`  🔄 Updating slide for shot ${shot.id} (Scene ${segment.segmentNumber}, Row ${shotIndex + 1})`);
            // Update existing slide
            const updatedSlide: AVEditingSlide = {
              ...existingSlide,
              imageUrl: shot.imageUrl || undefined,
              duration: slideDuration,
              startTime: slideStartTime,
              updatedAt: new Date(),
            };
            newSlides.push(updatedSlide);
            slidesById.set(slideId, updatedSlide);
          } else {
            // Keep existing slide as-is, just update startTime to maintain segment timing
            const slideWithUpdatedTime = {
              ...existingSlide,
              startTime: slideStartTime,
            };
            newSlides.push(slideWithUpdatedTime);
            slidesById.set(slideId, slideWithUpdatedTime);
          }
        } else {
          // No slide exists - create new one
          console.log(`  ➕ Creating slide for shot ${shot.id} (Scene ${segment.segmentNumber}, Row ${shotIndex + 1})${shot.imageUrl ? ' - with image' : ' - placeholder'}`);
          const newSlide: AVEditingSlide = {
            id: slideId, // Use shot.id as the unique identifier
            shotId: shot.id, // Direct reference to the shot (row) in AV script
            imageUrl: shot.imageUrl || undefined,
            duration: slideDuration,
            startTime: slideStartTime,
            order: segmentIndex * 1000 + shotIndex, // Order by segment then shot
            isFromAVScript: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          newSlides.push(newSlide);
          slidesById.set(slideId, newSlide);
        }
        
        // Move to next position in segment timeline
        segmentStartTime += slideDuration;
      });
      
      console.log(`  ✅ Scene ${segment.segmentNumber} complete: ${segment.shots.length} slides processed`);
      
      // Collect audio files for all shots in this segment
      segment.shots.forEach((shot, shotIndex) => {
        // Find the slide for this shot (either existing or newly created)
        const slideForAudio = newSlides.find(s => s.shotId === shot.id) || currentSlides.find(s => s.shotId === shot.id);
        
        if (slideForAudio && shot.audioFiles && shot.audioFiles.length > 0) {
          const slideStartTimeForAudio = slideForAudio.startTime;
          
          shot.audioFiles.forEach(audioFile => {
            // Try to get voice name from audioFile, or infer from voiceId
            let voiceName = audioFile.voiceName;
            if (!voiceName && audioFile.voiceId) {
              // Map voiceId to voice name
              const voiceMap: { [key: string]: string } = {
                'NihbqkjwL2d2zZZUinKL': 'Churrito 1',
                'lG2MfRiKt2P404zPIFet': 'Churrito 2',
                '1ldpv8M94zJ7F9VTVyub': 'PIPI',
                '8bomXa7wMiYTu9p353B2': 'Percy',
                'OehrGYnpLxrlEfNTsKfl': 'Muffin 1',
                'music': 'Music',
                'sfx': 'SFX',
              };
              voiceName = voiceMap[audioFile.voiceId] || 'Unknown Voice';
            } else if (!voiceName) {
              voiceName = 'Unknown Voice';
            }
            
            const key = `${shot.id}-${audioFile.id}`;
            expectedAudioTracks.set(key, {
              audioFile,
              shotId: shot.id,
              slideStartTime: slideStartTimeForAudio,
              voiceName,
            });
          });
        }
      });
    });
    
    // CRITICAL: Log sync results for debugging scene 02
    console.log('📊 Sync complete - slides created:', {
      newSlidesCount: newSlides.length,
      newSlidesBySegment: avScript.segments.map(seg => {
        const segmentNewSlides = newSlides.filter(s => {
          return seg.shots.some(shot => shot.id === s.shotId);
        });
        return {
          segmentNumber: seg.segmentNumber,
          segmentId: seg.id,
          segmentTitle: seg.title,
          newSlidesCount: segmentNewSlides.length,
          shotIds: segmentNewSlides.map(s => s.shotId),
        };
      }),
    });
    
    // CRITICAL: Batch all state updates to prevent multiple auto-save triggers
    let shouldUpdateSlides = false;
    let shouldUpdateTracks = false;
    let updatedSlides = currentSlides;
    let updatedTracks = currentAudioTracks;
    
    // Check if any existing slides were updated (have images now that they didn't have before)
    const hasUpdatedSlides = currentSlides.some(slide => {
      const shot = avScript.segments
        .flatMap(seg => seg.shots)
        .find(shot => shot.id === slide.shotId);
      return shot && shot.imageUrl && !slide.imageUrl;
    });

    // CRITICAL: Remove slides for shots that were deleted from AV script
    // Only remove slides that came from AV script (isFromAVScript = true)
    // Also remove any duplicates (slides with same shotId)
    const slidesToRemove = currentSlides.filter((slide, index, self) => {
      // Remove duplicates: if there's another slide with the same shotId earlier in the array
      if (slide.shotId && slide.isFromAVScript) {
        const duplicateIndex = self.findIndex(s => s.shotId === slide.shotId && s.id === slide.id);
        if (duplicateIndex !== index) {
          console.warn(`🗑️ Removing duplicate slide: ${slide.id} (duplicate of index ${duplicateIndex})`);
          return true;
        }
      }
      
      if (!slide.isFromAVScript || !slide.shotId) return false; // Keep manual slides
      const shotExists = allShotIdsFromScript.has(slide.shotId);
      if (!shotExists) {
        console.log(`🗑️ Marking slide for removal - shot no longer exists:`, {
          slideId: slide.id,
          shotId: slide.shotId,
          segmentNumber: avScript.segments.find(seg => 
            seg.shots.some(shot => shot.id === slide.shotId)
          )?.segmentNumber || 'unknown',
        });
      }
      return !shotExists; // Remove if shot no longer exists
    });
    
    if (slidesToRemove.length > 0) {
      console.log(`🗑️ Removing ${slidesToRemove.length} slides for deleted shots:`, 
        slidesToRemove.map(s => ({ slideId: s.id, shotId: s.shotId })));
    }
    
    // Update slides if we found new ones, need to update existing ones, or need to remove deleted ones
    if (newSlides.length > 0 || hasUpdatedSlides || slidesToRemove.length > 0) {
      // First, remove slides for deleted shots
      const slidesAfterRemoval = currentSlides.filter(slide => 
        !slidesToRemove.some(toRemove => toRemove.id === slide.id)
      );
      
      // Then, update existing slides that now have images
      const updatedCurrentSlides = slidesAfterRemoval.map(slide => {
        const shot = avScript.segments
          .flatMap(seg => seg.shots)
          .find(shot => shot.id === slide.shotId);
        if (shot && shot.imageUrl && !slide.imageUrl) {
          return {
            ...slide,
            imageUrl: shot.imageUrl,
            updatedAt: new Date(),
          };
        }
        return slide;
      });
      
      // Then add new slides, but deduplicate by shotId first
      // CRITICAL: Deduplicate newSlides to prevent duplicates
      const uniqueNewSlides = new Map<string, AVEditingSlide>();
      newSlides.forEach(slide => {
        if (slide.shotId && slide.isFromAVScript) {
          // Check if we already have a slide for this shotId in updatedCurrentSlides
          const existingInCurrent = updatedCurrentSlides.find(s => s.shotId === slide.shotId);
          if (!existingInCurrent) {
            // Only add if not already present
            const slideId = slide.id;
            if (!uniqueNewSlides.has(slideId)) {
              uniqueNewSlides.set(slideId, slide);
            } else {
              console.warn(`⚠️ Skipping duplicate new slide with ID: ${slideId}`);
            }
          } else {
            console.warn(`⚠️ Skipping new slide - already exists in current slides: ${slide.id} (shotId: ${slide.shotId})`);
          }
        } else {
          // Manual slides - always add
          uniqueNewSlides.set(slide.id, slide);
        }
      });
      
      // Then add new slides
      updatedSlides = newSlides.length > 0 
        ? [...updatedCurrentSlides, ...Array.from(uniqueNewSlides.values())]
        : updatedCurrentSlides;
      
      // CRITICAL: Final deduplication pass to ensure no duplicates remain
      const finalDeduplicated = new Map<string, AVEditingSlide>();
      updatedSlides.forEach(slide => {
        if (!finalDeduplicated.has(slide.id)) {
          finalDeduplicated.set(slide.id, slide);
        } else {
          console.warn(`⚠️ Removing final duplicate slide with ID: ${slide.id}`);
        }
      });
      updatedSlides = Array.from(finalDeduplicated.values());
      
      shouldUpdateSlides = true;
      
      if (newSlides.length > 0) {
        console.log(`✅ Syncing ${newSlides.length} new slides from AV script`);
      }
      if (hasUpdatedSlides) {
        console.log(`🔄 Updated existing slides with images from AV script`);
      }
      if (slidesToRemove.length > 0) {
        console.log(`🗑️ Removed ${slidesToRemove.length} slides for deleted shots`);
      }
    }

    // Now sync audio tracks: add new, remove deleted, keep existing
    // Calculate the new tracks first, then only update if they actually changed
    const tracksFromAVScript = currentAudioTracks.filter(t => t.shotId); // Tracks that came from AV script
    const manualTracks = currentAudioTracks.filter(t => !t.shotId); // Manually added tracks (keep these)
    
    // Build a map of existing tracks by shotId and audioFile id/URL
    // Use audioUrl as primary identifier since it's more reliable
    const existingTracksMap = new Map<string, AVEditingAudioTrack>();
    tracksFromAVScript.forEach(track => {
      if (track.shotId) {
        // Primary: match by shotId and audioUrl (most reliable)
        const key = `${track.shotId}-${track.audioUrl}`;
        existingTracksMap.set(key, track);
        
        // Also try to match by audioFile id if we can extract it from track id
        // Track id format: `audio-${audioFile.id}-${timestamp}`
        const match = track.id.match(/^audio-(.+?)-/);
        if (match) {
          const audioFileId = match[1];
          const keyById = `${track.shotId}-${audioFileId}`;
          // Only set if not already set (prefer URL-based key)
          if (!existingTracksMap.has(keyById)) {
            existingTracksMap.set(keyById, track);
          }
        }
      }
    });

    const tracksToKeep: AVEditingAudioTrack[] = [];
    const tracksToAdd: AVEditingAudioTrack[] = [];

    // Define processTrackSync function before async IIFE so it can be called
    const processTrackSync = () => {
      // Remove tracks that are no longer in AV script
      // A track should be kept if it matches an expected track by shotId + audioUrl
      const expectedTrackKeys = new Set<string>();
      const expectedShotIds = new Set<string>(); // Track which shotIds still exist in AV script
      expectedAudioTracks.forEach(({ audioFile, shotId }) => {
        // Add both key formats for matching
        expectedTrackKeys.add(`${shotId}-${audioFile.id}`);
        expectedTrackKeys.add(`${shotId}-${audioFile.audioUrl}`);
        expectedShotIds.add(shotId);
      });
      
      // Use the allShotIdsFromScript that was already calculated earlier in the function
      // No need to recalculate - it's already available from line 647
      
      const tracksToRemove = tracksFromAVScript.filter(track => {
        if (!track.shotId) return false; // Keep manual tracks (no shotId)
        
        // CRITICAL: If the shot was deleted entirely, remove all tracks for that shot
        if (!allShotIdsFromScript.has(track.shotId)) {
          console.log(`🗑️ Removing audio track for deleted shot: ${track.shotId}`);
          return true; // Remove it - shot no longer exists
        }
        
        // Remove any "Unknown Voice" tracks - they're orphaned or invalid
        if (track.voiceName === 'Unknown Voice') {
          return true; // Remove it
        }
        
        // Check if this track matches any expected track
        const keyByUrl = `${track.shotId}-${track.audioUrl}`;
        if (expectedTrackKeys.has(keyByUrl)) {
          return false; // Keep it - matches by URL
        }
        
        // Try to match by shotId and audioFile id
        const match = track.id.match(/^audio-(.+?)-/);
        if (match) {
          const audioFileId = match[1];
          const keyById = `${track.shotId}-${audioFileId}`;
          if (expectedTrackKeys.has(keyById)) {
            return false; // Keep it - matches by ID
          }
        }
        
        // Track doesn't match any expected track - remove it (audio file was deleted from shot)
        console.log(`🗑️ Removing audio track that no longer exists in AV script: ${track.shotId} - ${track.audioUrl}`);
        return true;
      });

      // Combine: keep existing (updated), add new, keep manual tracks
      const newTracks = [...tracksToKeep, ...tracksToAdd, ...manualTracks];
      
      // Reorder to maintain proper order
      const reorderedTracks = newTracks.map((track, index) => ({
        ...track,
        order: index,
      }));

      // Only update state if tracks actually changed (compare hash to prevent unnecessary updates)
      const currentTracksHash = JSON.stringify(currentAudioTracks
        .filter(t => t.shotId) // Only compare AV script tracks
        .map(t => ({ id: t.id, audioUrl: t.audioUrl, voiceName: t.voiceName, shotId: t.shotId }))
        .sort((a, b) => a.id.localeCompare(b.id)));
      const newTracksHash = JSON.stringify(reorderedTracks
        .filter(t => t.shotId) // Only compare AV script tracks
        .map(t => ({ id: t.id, audioUrl: t.audioUrl, voiceName: t.voiceName, shotId: t.shotId }))
        .sort((a, b) => a.id.localeCompare(b.id)));
      
      if (currentTracksHash !== newTracksHash) {
        updatedTracks = reorderedTracks;
        shouldUpdateTracks = true;
        
        if (tracksToAdd.length > 0 || tracksToRemove.length > 0) {
          console.log(`🔄 Syncing audio tracks: +${tracksToAdd.length} new, -${tracksToRemove.length} removed`);
        }
      }
      
      // CRITICAL: Batch all state updates together to prevent multiple auto-save triggers
      if (shouldUpdateSlides || shouldUpdateTracks) {
        // Update refs first
        if (shouldUpdateSlides) {
          slidesRef.current = updatedSlides;
        }
        if (shouldUpdateTracks) {
          audioTracksRef.current = updatedTracks;
        }
        
        // Calculate total duration
        const maxDuration = updatedSlides.length > 0
          ? Math.max(...updatedSlides.map(s => s.startTime + s.duration), 0)
          : 0;
        
        // Update editingData
        const updatedEditingData: AVEditingData = {
          ...(currentEditingData || {
            id: `av-editing-${episodeId}`,
            episodeId,
            slides: [],
            audioTracks: [],
            totalDuration: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          slides: updatedSlides,
          audioTracks: updatedTracks,
          totalDuration: maxDuration,
          updatedAt: new Date(),
        };
        editingDataRef.current = updatedEditingData;
        
        // CRITICAL: Batch all state updates together in a single React update
        // This prevents multiple auto-save triggers
        // React will batch these automatically, but we're being explicit
        setEditingData(updatedEditingData);
        if (shouldUpdateSlides) {
          setSlides(updatedSlides);
        }
        if (shouldUpdateTracks) {
          setAudioTracks(updatedTracks);
        }
        
        console.log(`✅ Sync complete - ${shouldUpdateSlides ? `${updatedSlides.length} slides` : ''} ${shouldUpdateTracks ? `${updatedTracks.length} tracks` : ''}`);
      } else {
        console.log('⏸️ Sync complete - no changes needed');
      }
      
      // CRITICAL: Update AV script hash after sync completes successfully
      // This prevents unnecessary syncs when the AV script hasn't actually changed
      previousAVScriptRef.current = avScriptHash;
      console.log('✅ AV script hash updated after sync');
      
      // CRITICAL: Release sync lock and re-enable auto-save after a delay
      // This prevents auto-save from triggering immediately after sync
      setTimeout(() => {
        isSyncingRef.current = false;
        skipAutoSaveRef.current = false;
        console.log('✅ Sync lock released, auto-save re-enabled');
      }, 3000); // Wait 3 seconds before allowing auto-save to prevent immediate triggers
    };

    // Helper function to load audio duration
    const loadAudioDuration = (audioUrl: string): Promise<number> => {
      return new Promise<number>((resolve) => {
        try {
          const tempAudio = new Audio(audioUrl);
          tempAudio.preload = 'metadata';
          
          const timeout = setTimeout(() => {
            console.warn(`⚠️ Timeout loading audio metadata for ${audioUrl} - using default duration`);
            resolve(3); // Default fallback
          }, 2000); // 2 second timeout
          
          tempAudio.addEventListener('loadedmetadata', () => {
            clearTimeout(timeout);
            if (tempAudio.duration && isFinite(tempAudio.duration)) {
              console.log(`✅ Loaded actual audio duration: ${tempAudio.duration}s for ${audioUrl}`);
              resolve(tempAudio.duration);
            } else {
              console.warn(`⚠️ Invalid audio duration for ${audioUrl} - using default`);
              resolve(3);
            }
          });
          
          tempAudio.addEventListener('error', (e) => {
            clearTimeout(timeout);
            console.error(`❌ Error loading audio metadata for ${audioUrl}:`, e);
            resolve(3);
          });
          
          // Try to load metadata
          tempAudio.load();
        } catch (err) {
          console.error(`❌ Error getting audio duration for ${audioUrl}:`, err);
          resolve(3);
        }
      });
    };

    // Process audio tracks - use async IIFE since useEffect can't be async
    (async () => {
      // Process all tracks in parallel for better performance
      const trackProcessingPromises = Array.from(expectedAudioTracks.entries()).map(async ([key, { audioFile, shotId, slideStartTime, voiceName }]) => {
        // Try to find existing track by key (shotId-audioFile.id) or by URL
        const keyByUrl = `${shotId}-${audioFile.audioUrl}`;
        const existingTrack = existingTracksMap.get(key) || existingTracksMap.get(keyByUrl);
        
        if (existingTrack) {
          // Track exists - update duration if it's still the default 3s or if URL changed
          const needsDurationUpdate = existingTrack.duration === 3 || existingTrack.audioUrl !== audioFile.audioUrl;
          const needsUpdate = 
            existingTrack.audioUrl !== audioFile.audioUrl ||
            existingTrack.voiceName !== voiceName ||
            existingTrack.shotId !== shotId ||
            needsDurationUpdate;
          
          if (needsUpdate) {
            let duration = existingTrack.duration;
            
            // Load actual duration if needed
            if (needsDurationUpdate && audioFile.audioUrl) {
              duration = await loadAudioDuration(audioFile.audioUrl);
            }
            
            return {
              type: 'keep' as const,
              track: {
                ...existingTrack,
                audioUrl: audioFile.audioUrl,
                voiceName: voiceName,
                shotId: shotId,
                duration: duration,
                updatedAt: new Date(),
              },
            };
          } else {
            return {
              type: 'keep' as const,
              track: existingTrack,
            };
          }
        } else {
          // New track - create it with actual duration
          const actualDuration = await loadAudioDuration(audioFile.audioUrl);
          
          const newTrack: AVEditingAudioTrack = {
            id: `audio-${audioFile.id}-${Date.now()}`,
            name: `${voiceName} - ${audioFile.id.substring(0, 8)}`,
            audioUrl: audioFile.audioUrl,
            startTime: slideStartTime,
            duration: actualDuration,
            volume: 100,
            order: 0, // Will be set later
            shotId: shotId,
            voiceName: voiceName,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          return {
            type: 'add' as const,
            track: newTrack,
          };
        }
      });
      
      // Wait for all track processing to complete
      const trackProcessingResults = await Promise.all(trackProcessingPromises);
      
      // Separate kept and added tracks
      trackProcessingResults.forEach((result) => {
        if (result.type === 'keep') {
          tracksToKeep.push(result.track);
        } else {
          result.track.order = tracksToKeep.length + tracksToAdd.length;
          tracksToAdd.push(result.track);
        }
      });
      
      // Continue with rest of sync logic after tracks are processed
      processTrackSync();
    })().catch(err => {
      console.error('❌ Error processing audio tracks:', err);
      // Still try to process tracks even if duration loading failed
      processTrackSync();
    });
    
    }, [avScript, editingData?.id, episodeId, firebaseLoadComplete]); // Sync when AV script, editing data, episode, or Firebase load completes

  // Auto-save when slides or audio tracks change (30-second debounce)
  useEffect(() => {
    // CRITICAL: Skip auto-save during sync operations
    if (skipAutoSaveRef.current) {
      console.log('⏸️ Auto-save skipped - sync in progress');
      return;
    }
    
    // Skip saving if we're still loading initial data or initializing
    if (isInitializingRef.current) {
      return;
    }

    // Skip saving if we're actively dragging or resizing
    if (isDragging || isResizing) {
      return;
    }

    // Skip saving if we have no data
    if (slides.length === 0 && audioTracks.length === 0 && !editingDataRef.current) {
      return;
    }

    // Create hashes to detect actual changes (only compare essential properties)
    const slidesHash = JSON.stringify(slides.map(s => ({
      id: s.id,
      startTime: s.startTime,
      duration: s.duration,
      order: s.order,
      shotId: s.shotId,
      imageUrl: s.imageUrl,
    })).sort((a, b) => a.order - b.order));

    const audioTracksHash = JSON.stringify(audioTracks.map(t => ({
      id: t.id,
      startTime: t.startTime,
      duration: t.duration,
      audioUrl: t.audioUrl,
      shotId: t.shotId,
      voiceName: t.voiceName,
    })).sort((a, b) => a.id.localeCompare(b.id)));

    // Skip if nothing has changed
    if (previousSlidesHashRef.current === slidesHash && previousAudioTracksHashRef.current === audioTracksHash) {
      return;
    }

    // Update previous hashes (AV script hash is updated in sync effect)
    previousSlidesHashRef.current = slidesHash;
    previousAudioTracksHashRef.current = audioTracksHash;

    // Clear any existing debounce timeout
    if (autosaveDebounceRef.current) {
      clearTimeout(autosaveDebounceRef.current);
    }

    // Debounce: wait 30 seconds before saving
    autosaveDebounceRef.current = setTimeout(() => {
      // Helper function to safely convert any date-like value to a Date object
      const safeToDate = (dateValue: unknown): Date => {
        const now = new Date();
        
        // If it's already a Date object, validate it
        if (dateValue instanceof Date) {
          return !isNaN(dateValue.getTime()) ? dateValue : now;
        }
        
        // If it's null or undefined, return now
        if (!dateValue) {
          return now;
        }
        
        // If it's a Firestore Timestamp with toDate method
        if (dateValue && typeof dateValue === 'object' && 'toDate' in dateValue && typeof (dateValue as { toDate: () => Date }).toDate === 'function') {
          try {
            const date = (dateValue as { toDate: () => Date }).toDate();
            return !isNaN(date.getTime()) ? date : now;
          } catch {
            return now;
          }
        }
        
        // If it's an object with seconds property (Firestore Timestamp format)
        if (dateValue && typeof dateValue === 'object' && 'seconds' in dateValue && typeof (dateValue as { seconds: number }).seconds === 'number') {
          try {
            const date = new Date((dateValue as { seconds: number }).seconds * 1000);
            return !isNaN(date.getTime()) ? date : now;
          } catch {
            return now;
          }
        }
        
        // If it's a string or number, try to convert it
        if (typeof dateValue === 'string' || typeof dateValue === 'number') {
          try {
            const date = new Date(dateValue);
            return !isNaN(date.getTime()) ? date : now;
          } catch {
            return now;
          }
        }
        
        // Fallback to current time
        return now;
      };

      // Ensure all dates are valid before saving
      const validateDates = (data: AVEditingData): AVEditingData => {
        const now = new Date();
        return {
          ...data,
          slides: data.slides.map(slide => ({
            ...slide,
            createdAt: safeToDate(slide.createdAt),
            updatedAt: safeToDate(slide.updatedAt),
          })),
          audioTracks: data.audioTracks.map(track => ({
            ...track,
            createdAt: safeToDate(track.createdAt),
            updatedAt: safeToDate(track.updatedAt),
          })),
          createdAt: safeToDate(data.createdAt),
          updatedAt: now, // Always use current time for updatedAt
        };
      };

      const totalDuration = Math.max(
        ...(slides.length > 0 ? slides.map(s => s.startTime + s.duration) : [0]),
        ...(audioTracks.length > 0 ? audioTracks.map(t => t.startTime + t.duration) : [0]),
        0
      );

      const updatedData: AVEditingData = {
        id: editingDataRef.current?.id || `av-editing-${episodeId}`,
        episodeId,
        slides,
        audioTracks,
        totalDuration,
        createdAt: editingDataRef.current?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      const validatedData = validateDates(updatedData);

      // Use the improved save function with aggressive throttling
      saveEditingData(validatedData);
    }, 30000); // 30-second debounce

    // Cleanup on unmount
    return () => {
      if (autosaveDebounceRef.current) {
        clearTimeout(autosaveDebounceRef.current);
        autosaveDebounceRef.current = null;
      }
    };
  }, [slides, audioTracks, episodeId, saveEditingData, isDragging, isResizing]);

  // Update AV script when slide order, duration, or new slides change
  // This effect is debounced to prevent excessive Firebase writes
  useEffect(() => {
    if (!avScript) return;
    
    // Skip if we're initializing or actively dragging/resizing
    if (isInitializingRef.current || isDragging || isResizing) {
      return;
    }

    // Clear any pending timeout
    if (avScriptUpdateTimeoutRef.current) {
      clearTimeout(avScriptUpdateTimeoutRef.current);
    }

    // CRITICAL: Increase debounce to 30 seconds (was 5) to reduce writes
    // Debounce: wait 30 seconds before updating AV script
    avScriptUpdateTimeoutRef.current = setTimeout(() => {
      // Create a hash of slide changes that affect AV script
      const slidesHash = JSON.stringify(slides
        .filter(s => s.shotId) // Only slides with shotIds affect AV script
        .map(s => ({ shotId: s.shotId, order: s.order, duration: s.duration }))
        .sort((a, b) => a.order - b.order));

      // Skip if nothing has changed
      if (previousSlidesForAVScriptRef.current === slidesHash) {
        return;
      }
      previousSlidesForAVScriptRef.current = slidesHash;

      let hasChanges = false;
      const updatedScript = {
        ...avScript,
        segments: avScript.segments.map(segment => {
          // Get all slides from this segment (sorted by order)
          const segmentSlides = slides
            .filter(s => {
              if (!s.shotId) return false;
              const shot = segment.shots.find(sh => sh.id === s.shotId);
              return shot !== undefined;
            })
            .sort((a, b) => a.order - b.order);

          // Update shots based on slide order and duration
          const updatedShots = segment.shots.map(shot => {
            const slide = slides.find(s => s.shotId === shot.id);
            if (slide) {
              const newOrder = slide.order;
              const newDuration = slide.duration;
              
              if (shot.order !== newOrder || shot.duration !== newDuration) {
                hasChanges = true;
                return {
                  ...shot,
                  order: newOrder,
                  duration: newDuration,
                  updatedAt: new Date(),
                };
              }
            }
            return shot;
          });

          // Reorder shots based on slide order
          const reorderedShots = [...updatedShots].sort((a, b) => {
            const slideA = slides.find(s => s.shotId === a.id);
            const slideB = slides.find(s => s.shotId === b.id);
            const orderA = slideA?.order ?? a.order;
            const orderB = slideB?.order ?? b.order;
            return orderA - orderB;
          });

          // Update shot numbers based on new order
          const finalShots = reorderedShots.map((shot, index) => ({
            ...shot,
            shotNumber: segment.segmentNumber * 100 + (index + 1),
          }));

          return {
            ...segment,
            shots: finalShots,
            updatedAt: new Date(),
          };
        }),
        updatedAt: new Date(),
      };

      // Only save if there are actual changes
      if (hasChanges) {
        console.log('💾 Saving AV script changes to Firebase');
        onSave(updatedScript);
      } else {
        console.log('⏸️ AV script update skipped - no changes');
      }
    }, 60000); // 60 second debounce - drastically reduced Firebase writes

    // Cleanup
    return () => {
      if (avScriptUpdateTimeoutRef.current) {
        clearTimeout(avScriptUpdateTimeoutRef.current);
      }
    };
  }, [slides, avScript, onSave, isDragging, isResizing]);

  // Generate waveform data for audio track
  const generateWaveform = async (audioUrl: string, trackId: string): Promise<number[]> => {
    // Return empty waveform if not in browser
    if (typeof window === 'undefined') {
      return [];
    }

    if (waveformDataRef.current.has(trackId)) {
      return waveformDataRef.current.get(trackId)!;
    }

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        if (typeof window === 'undefined') {
          return [];
        }
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) {
          console.warn('AudioContext not available');
          return [];
        }
        audioContextRef.current = new AudioContextClass();
      }

      // Resume AudioContext if suspended (required by browser autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const response = await fetch(audioUrl, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      
      const rawData = audioBuffer.getChannelData(0); // Get first channel
      const samples = 200; // Number of samples for waveform (more samples = better detail)
      const blockSize = Math.floor(rawData.length / samples);
      const waveform: number[] = [];

      for (let i = 0; i < samples; i++) {
        let sum = 0;
        let maxVal = 0;
        for (let j = 0; j < blockSize; j++) {
          const idx = i * blockSize + j;
          if (idx < rawData.length) {
            const absValue = Math.abs(rawData[idx]);
            sum += absValue;
            maxVal = Math.max(maxVal, absValue);
          }
        }
        // Use RMS (root mean square) for better waveform representation
        const rms = Math.sqrt(sum / blockSize);
        waveform.push(rms);
      }

      // Normalize waveform
      const max = Math.max(...waveform);
      if (max > 0) {
        const normalizedWaveform = waveform.map(value => Math.min(1, value / max));
        waveformDataRef.current.set(trackId, normalizedWaveform);
        return normalizedWaveform;
      } else {
        // Silent audio
        const flatWaveform = new Array(samples).fill(0.1);
        waveformDataRef.current.set(trackId, flatWaveform);
        return flatWaveform;
      }
    } catch (error) {
      console.error('Error generating waveform:', error);
      // Return a flat waveform on error
      const flatWaveform = new Array(200).fill(0.3);
      waveformDataRef.current.set(trackId, flatWaveform);
      return flatWaveform;
    }
  };

  // Load waveforms for all audio tracks (only in browser)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    
    audioTracks.forEach(track => {
      if (!waveformDataRef.current.has(track.id)) {
        generateWaveform(track.audioUrl, track.id).catch(err => {
          console.error(`Error generating waveform for track ${track.id}:`, err);
        });
      }
    });
  }, [audioTracks]);

  // Initialize audio elements for all tracks (only in browser)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    console.log('🎵 Initializing audio elements:', {
      tracksCount: audioTracks.length,
      tracks: audioTracks.map(t => ({
        id: t.id,
        name: t.name,
        audioUrl: t.audioUrl,
        startTime: t.startTime,
        duration: t.duration,
        volume: t.volume,
      })),
    });

    audioTracks.forEach(track => {
      if (!track.audioUrl) {
        console.warn(`⚠️ Track ${track.id} (${track.name}) has no audioUrl - skipping`);
        return;
      }

      if (!audioElementsRef.current.has(track.id)) {
        const audio = new Audio(track.audioUrl);
        audio.volume = track.volume / 100;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous'; // Enable CORS for waveform generation
        
        // Add error handler
        audio.addEventListener('error', (e) => {
          // Safely extract error information
          let errorInfo: any = null;
          if (audio.error) {
            errorInfo = {};
            if (audio.error.code !== undefined) {
              errorInfo.code = audio.error.code;
            }
            if (audio.error.message !== undefined) {
              errorInfo.message = audio.error.message;
            }
            // If error object is empty or has no useful info, use the event
            if (Object.keys(errorInfo).length === 0) {
              errorInfo = { event: e.type, target: e.target };
            }
          }
          
          console.error(`❌ Audio error for track ${track.name}:`, {
            audioUrl: track.audioUrl,
            error: errorInfo,
            errorType: e.type,
          });
        });
        
        // Add loaded handler
        audio.addEventListener('loadeddata', () => {
          console.log(`✅ Audio loaded for track ${track.name}`, {
            duration: audio.duration,
            readyState: audio.readyState,
          });
        });
        
        audioElementsRef.current.set(track.id, audio);
        console.log(`✅ Audio element created for track ${track.id} (${track.name})`, {
          audioUrl: track.audioUrl,
          volume: track.volume,
        });
      } else {
        // Update volume if it changed
        const audio = audioElementsRef.current.get(track.id)!;
        audio.volume = track.volume / 100;
        
        // Update URL if it changed
        if (audio.src !== track.audioUrl) {
          console.log(`🔄 Updating audio URL for track ${track.name}`, {
            oldUrl: audio.src,
            newUrl: track.audioUrl,
          });
          audio.src = track.audioUrl;
          audio.load();
        }
      }
    });

    // Cleanup removed tracks
    const trackIds = new Set(audioTracks.map(t => t.id));
    audioElementsRef.current.forEach((audio, id) => {
      if (!trackIds.has(id)) {
        audio.pause();
        audio.src = '';
        audioElementsRef.current.delete(id);
      }
    });
  }, [audioTracks]);

  // Playback control with audio - optimized to reduce lag (only in browser)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isPlaying) {
      // Pause all audio when not playing
      audioElementsRef.current.forEach(audio => {
        audio.pause();
      });
      return;
    }

    // Initialize audio elements using refs (for all tracks, but playback will be filtered)
    audioTracksRef.current.forEach(track => {
      let audio = audioElementsRef.current.get(track.id);
      if (!audio) {
        audio = new Audio(track.audioUrl);
        audio.volume = track.volume / 100;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audioElementsRef.current.set(track.id, audio);
      }
    });
    
    // Use all tracks for playback - don't filter by segment
    // This ensures audio plays regardless of segment selection
    const currentFilteredTracks = audioTracksRef.current; // Play all tracks

    // Use requestAnimationFrame for smoother playback at 1x speed
    let animationFrameId: number;
    let lastFrameTimestamp = typeof window !== 'undefined' ? performance.now() / 1000 : 0; // Timestamp of last frame
    let currentPlaybackTime = currentTimeRef.current; // Current timeline position
    let syncCounter = 0;
    let isActive = true;
    
    const updateTime = () => {
      if (!isActive || !isPlayingRef.current || typeof window === 'undefined') {
        return;
      }

      const now = performance.now() / 1000; // Current real-world time
      const frameDelta = now - lastFrameTimestamp; // Real time elapsed since last frame (in seconds)
      const newTime = currentPlaybackTime + frameDelta; // Timeline advances by real time delta (1x speed)
      
      // Use refs to get latest values
      const currentSlides = slidesRef.current;
      const currentAudioTracks = audioTracksRef.current;
      
      const totalDuration = Math.max(
        ...(currentSlides.length > 0 ? currentSlides.map(s => s.startTime + s.duration) : [0]),
        ...(currentAudioTracks.length > 0 ? currentAudioTracks.map(t => t.startTime + t.duration) : [0]),
        0
      );
      
      if (newTime >= totalDuration) {
        isActive = false;
        setIsPlaying(false);
        setCurrentTime(0);
        currentTimeRef.current = 0;
        audioElementsRef.current.forEach(audio => {
          audio.pause();
          audio.currentTime = 0;
        });
        return;
      }
      
      setCurrentTime(newTime);
      currentTimeRef.current = newTime;
      
      // Sync audio tracks - check every frame for better responsiveness
      // Use all tracks for playback - don't filter by segment
      // This ensures audio plays regardless of segment selection
      const filteredTracks = currentAudioTracks; // Play all tracks, not just filtered ones
      
      // Use for loop instead of forEach to avoid async issues
      for (const track of filteredTracks) {
        const audio = audioElementsRef.current.get(track.id);
        if (!audio) {
          console.warn(`⚠️ Audio element not found for track: ${track.id} (${track.name})`);
          continue;
        }

        // Check if audio URL is valid
        if (!track.audioUrl || !audio.src) {
          console.warn(`⚠️ Invalid audio URL for track: ${track.id} (${track.name})`, {
            audioUrl: track.audioUrl,
            audioSrc: audio.src,
          });
          continue;
        }

        const wasInRange = currentPlaybackTime >= track.startTime && 
                          currentPlaybackTime < track.startTime + track.duration;
        const isInRange = newTime >= track.startTime && newTime < track.startTime + track.duration;
        
        if (isInRange && !wasInRange) {
          // Just entered the range - start playing
          const offset = newTime - track.startTime;
          console.log(`🔊 Starting audio track: ${track.name}`, {
            trackId: track.id,
            startTime: track.startTime,
            duration: track.duration,
            currentTime: newTime,
            offset: offset,
            audioUrl: track.audioUrl,
            audioState: audio.readyState,
            audioPaused: audio.paused,
            audioContextState: audioContextRef.current?.state,
          });
          
          audio.currentTime = offset;
          
          // CRITICAL: Resume audio context before playing
          if (audioContextRef.current) {
            if (audioContextRef.current.state === 'suspended' || audioContextRef.current.state === 'interrupted') {
              audioContextRef.current.resume().catch(err => {
                console.error('❌ Error resuming audio context:', err);
              });
            }
          }
          
          // Ensure audio is loaded
          if (audio.readyState < 2) {
            console.log(`⏳ Loading audio for track: ${track.name}`);
            audio.load();
          }
          
          // Try to play audio
          audio.play().then(() => {
            console.log(`✅ Audio playing: ${track.name}`);
          }).catch(err => {
            console.error(`❌ Error playing audio for track ${track.name}:`, err);
            // Try to resume audio context if play failed
            if (audioContextRef.current) {
              if (audioContextRef.current.state === 'suspended' || audioContextRef.current.state === 'interrupted') {
                audioContextRef.current.resume().then(() => {
                  console.log(`✅ Audio context resumed, retrying play for: ${track.name}`);
                  return audio.play();
                }).then(() => {
                  console.log(`✅ Audio playing after resume: ${track.name}`);
                }).catch(err2 => {
                  console.error(`❌ Error resuming audio context or playing after resume:`, err2);
                });
              }
            }
          });
        } else if (!isInRange && wasInRange) {
          // Just left the range - pause
          console.log(`⏸️ Pausing audio track: ${track.name}`);
          if (!audio.paused) {
            audio.pause();
          }
        } else if (isInRange && !audio.paused) {
          // In range and playing - sync timing
          const expectedTime = newTime - track.startTime;
          const drift = Math.abs(audio.currentTime - expectedTime);
          // Sync if drift is more than 0.2 seconds
          if (drift > 0.2) {
            audio.currentTime = expectedTime;
          }
        }
      }
      
      // Update for next frame
      currentPlaybackTime = newTime;
      lastFrameTimestamp = now;
      
      if (isActive) {
        animationFrameId = requestAnimationFrame(updateTime);
      }
    };
    
    // Initialize playback state
    currentPlaybackTime = currentTimeRef.current;
    lastFrameTimestamp = typeof window !== 'undefined' ? performance.now() / 1000 : 0;
    
    // Start initial audio tracks if needed - play all tracks
    const initialFilteredTracks = audioTracksRef.current; // Play all tracks, not just filtered ones
    
    console.log('🎵 Starting initial audio tracks:', {
      currentTime: currentTimeRef.current,
      tracksCount: initialFilteredTracks.length,
      tracks: initialFilteredTracks.map(t => ({
        id: t.id,
        name: t.name,
        startTime: t.startTime,
        duration: t.duration,
        audioUrl: t.audioUrl,
        shouldPlay: currentTimeRef.current >= t.startTime && currentTimeRef.current < t.startTime + t.duration,
      })),
    });
    
    initialFilteredTracks.forEach(track => {
      if (!track.audioUrl) {
        console.warn(`⚠️ Track ${track.id} (${track.name}) has no audioUrl - skipping initial play`);
        return;
      }

      const audio = audioElementsRef.current.get(track.id);
      if (!audio) {
        console.warn(`⚠️ Audio element not found for track ${track.id} (${track.name}) - creating it`);
        // Create audio element on the fly
        const newAudio = new Audio(track.audioUrl);
        newAudio.volume = track.volume / 100;
        newAudio.preload = 'auto';
        newAudio.crossOrigin = 'anonymous';
        audioElementsRef.current.set(track.id, newAudio);
        // Use the newly created audio
        const audioToUse = audioElementsRef.current.get(track.id)!;
        
        const shouldPlay = currentTimeRef.current >= track.startTime && 
                          currentTimeRef.current < track.startTime + track.duration;
        
        if (shouldPlay) {
          const offset = Math.max(0, currentTimeRef.current - track.startTime);
          audioToUse.currentTime = offset;
          console.log(`🔊 Starting initial audio track: ${track.name}`, {
            offset: offset,
            audioUrl: track.audioUrl,
          });
          
          // Ensure audio context is resumed
          if (audioContextRef.current) {
            if (audioContextRef.current.state === 'suspended' || audioContextRef.current.state === 'interrupted') {
              audioContextRef.current.resume().then(() => {
                return audioToUse.play();
              }).then(() => {
                console.log(`✅ Initial audio playing: ${track.name}`);
              }).catch(err => {
                console.error(`❌ Error playing initial audio for ${track.name}:`, err);
              });
            } else {
              audioToUse.play().then(() => {
                console.log(`✅ Initial audio playing: ${track.name}`);
              }).catch(err => {
                console.error(`❌ Error playing initial audio for ${track.name}:`, err);
              });
            }
          } else {
            audioToUse.play().then(() => {
              console.log(`✅ Initial audio playing: ${track.name}`);
            }).catch(err => {
              console.error(`❌ Error playing initial audio for ${track.name}:`, err);
            });
          }
        }
        return;
      }
      
      const shouldPlay = currentTimeRef.current >= track.startTime && 
                        currentTimeRef.current < track.startTime + track.duration;
      
      if (shouldPlay && audio.paused) {
        const offset = Math.max(0, currentTimeRef.current - track.startTime);
        audio.currentTime = offset;
        console.log(`🔊 Starting initial audio track: ${track.name}`, {
          offset: offset,
          audioUrl: track.audioUrl,
          readyState: audio.readyState,
        });
        
        // Ensure audio context is resumed
        if (audioContextRef.current) {
          if (audioContextRef.current.state === 'suspended' || audioContextRef.current.state === 'interrupted') {
            audioContextRef.current.resume().then(() => {
              return audio.play();
            }).then(() => {
              console.log(`✅ Initial audio playing: ${track.name}`);
            }).catch(err => {
              console.error(`❌ Error playing initial audio for ${track.name}:`, err);
            });
          } else {
            audio.play().then(() => {
              console.log(`✅ Initial audio playing: ${track.name}`);
            }).catch(err => {
              console.error(`❌ Error playing initial audio for ${track.name}:`, err);
            });
          }
        } else {
          audio.play().then(() => {
            console.log(`✅ Initial audio playing: ${track.name}`);
          }).catch(err => {
            console.error(`❌ Error playing initial audio for ${track.name}:`, err);
          });
        }
      }
    });
    
    animationFrameId = requestAnimationFrame(updateTime);
    
      return () => {
        isActive = false;
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
  }, [isPlaying, selectedSegmentId, avScript]); // Include selectedSegmentId and avScript for filtering

  // Update preview based on current time - ensure only one slide shows
  // When a segment is selected, use relative time within that segment (starts from 0:00:00)
  useEffect(() => {
    if (previewRef.current) {
      // Filter slides by selected segment
      const currentFilteredSlides = slides.filter(slide => {
        if (!slide.shotId || !avScript || !selectedSegmentId) return false;
        const segment = avScript.segments.find(seg => seg.id === selectedSegmentId);
        return segment?.shots.some(shot => shot.id === slide.shotId) ?? false;
      });

      // When a segment is selected, use relative time (currentTime is already relative to segment start)
      // Find the slide that should be displayed at current time
      // Sort by startTime to handle edge cases properly
      const sortedSlides = [...currentFilteredSlides].sort((a, b) => a.startTime - b.startTime);
      const currentSlide = sortedSlides.find(s => {
        const slideStart = s.startTime;
        const slideEnd = s.startTime + s.duration;
        return currentTime >= slideStart && currentTime < slideEnd;
      });
      
      // Clear any existing content
      if (previewRef.current) {
        // Remove all child elements
        while (previewRef.current.firstChild) {
          previewRef.current.removeChild(previewRef.current.firstChild);
        }
        
        if (currentSlide && currentSlide.imageUrl) {
          // Use img element instead of background for better control
          const img = document.createElement('img');
          img.src = currentSlide.imageUrl;
          img.alt = 'Preview';
          img.className = 'w-full h-full object-contain';
          img.style.display = 'block';
          previewRef.current.appendChild(img);
        } else {
          // Show placeholder
          const placeholder = document.createElement('div');
          placeholder.className = 'w-full h-full flex items-center justify-center text-gray-500';
          placeholder.innerHTML = `
            <div class="text-center">
              <svg class="w-16 h-16 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>No slide at current time</p>
            </div>
          `;
          previewRef.current.appendChild(placeholder);
        }
      }
    }
  }, [currentTime, slides, selectedSegmentId, avScript]);

  const handlePlay = async () => {
    // CRITICAL: Initialize audio context if it doesn't exist
    if (!audioContextRef.current && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass();
        console.log('✅ Audio context created');
      }
    }
    
    // CRITICAL: Resume audio context if suspended (required by browser autoplay policy)
    // This must be done on user interaction (button click)
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended' || audioContextRef.current.state === 'interrupted') {
        try {
          await audioContextRef.current.resume();
          console.log('✅ Audio context resumed');
        } catch (err) {
          console.error('❌ Error resuming audio context:', err);
        }
      }
    }
    
    // CRITICAL: Pre-load all audio tracks and ensure they're ready to play
    for (const track of audioTracks) {
      let audio = audioElementsRef.current.get(track.id);
      if (!audio) {
        audio = new Audio(track.audioUrl);
        audio.volume = track.volume / 100;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audioElementsRef.current.set(track.id, audio);
        console.log(`✅ Audio element created for track ${track.id}`);
      }
      // Ensure audio is ready
      if (audio.readyState < 2) {
        audio.load();
      }
      // Wait for audio to be ready
      if (audio.readyState < 2) {
        await new Promise((resolve) => {
          audio.addEventListener('canplaythrough', resolve, { once: true });
          audio.addEventListener('error', resolve, { once: true });
        });
      }
    }
    
    setIsPlaying(true);
    console.log('▶️ Playback started');
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    // Stop all audio and reset
    audioElementsRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  };

  const handleAddSlide = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const result = await uploadFile(file, `episodes/${episodeId}/av-editing/slides/`);
      if (result) {
        const totalDuration = Math.max(...slides.map(s => s.startTime + s.duration), 0);
        const newSlide: AVEditingSlide = {
          id: `slide-${Date.now()}`,
          imageUrl: result.url,
          duration: 3, // Default duration
          startTime: totalDuration,
          order: slides.length,
          isFromAVScript: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setSlides(prev => [...prev, newSlide]);

        // Add to AV script if available
        if (avScript && selectedSegmentId) {
          const segment = avScript.segments.find(s => s.id === selectedSegmentId);
          if (segment) {
            // Generate unique take number for this scene
            const existingTakes = segment.shots
              .map(shot => shot.take)
              .filter(take => take && take.startsWith(`SC${segment.segmentNumber.toString().padStart(2, '0')}T`))
              .map(take => {
                const match = take?.match(/SC\d+T(\d+)_image/);
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
              segmentId: segment.id,
              shotNumber: segment.segmentNumber * 100 + (segment.shots.length + 1),
              take: take,
              audio: '',
              visual: '',
              imageUrl: result.url,
              duration: 3,
              wordCount: 0,
              runtime: 0,
              order: segment.shots.length,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const updatedScript: AVScript = {
              ...avScript,
              segments: avScript.segments.map(s =>
                s.id === segment.id
                  ? {
                      ...s,
                      shots: [...s.shots, newShot],
                      updatedAt: new Date(),
                    }
                  : s
              ),
              updatedAt: new Date(),
            };

            // Link the slide to the shot
            newSlide.shotId = newShot.id;
            newSlide.isFromAVScript = true;
            setSlides(prev => prev.map(s => s.id === newSlide.id ? newSlide : s));

            onSave(updatedScript);
          }
        }
      }
    };
    input.click();
  };

  const handleAddAudioTrack = () => {
    setShowAddAudioPopup(true);
  };

  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewAudioFile(file);
    }
  };

  const handleSaveNewAudioTrack = async () => {
    if (!newAudioFile) return;

    try {
      const result = await uploadFile(newAudioFile, `episodes/${episodeId}/av-editing/audio/`);
      if (result) {
        console.log('✅ Audio file uploaded:', result.url);
        
        // Get audio duration
        const audio = new Audio(result.url);
        audio.preload = 'metadata';
        audio.crossOrigin = 'anonymous';
        
        const loadAudioMetadata = () => {
          return new Promise<number>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Audio metadata loading timeout'));
            }, 10000);
            
            audio.addEventListener('loadedmetadata', () => {
              clearTimeout(timeout);
              const duration = audio.duration || 0;
              console.log('✅ Audio duration loaded:', duration);
              resolve(duration);
            }, { once: true });
            
            audio.addEventListener('error', (err) => {
              clearTimeout(timeout);
              console.error('❌ Error loading audio metadata:', err);
              reject(err);
            }, { once: true });
            
            audio.load();
          });
        };
        
        try {
          const duration = await loadAudioMetadata();
          
          setAudioTracks(prev => {
            const newTrack: AVEditingAudioTrack = {
              id: `audio-${Date.now()}`,
              name: `${newAudioVoiceName} - ${newAudioFile.name}`,
              audioUrl: result.url,
              startTime: 0,
              duration: duration,
              volume: 100,
              order: prev.length,
              voiceName: newAudioVoiceName,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            
            return [...prev, newTrack];
          });
          
          setShowAddAudioPopup(false);
          setNewAudioFile(null);
          setNewAudioVoiceName('Music');
        } catch (error) {
          console.error('❌ Error loading audio metadata:', error);
          alert('Failed to load audio file. Please try again.');
        }
      } else {
        console.error('❌ Audio upload failed');
        alert('Failed to upload audio file. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error uploading audio file:', error);
      alert('Failed to upload audio file. Please try again.');
    }
  };

  const handleDeleteSlide = (slideId: string) => {
    const slide = slides.find(s => s.id === slideId);
    if (slide) {
      setDeleteConfirm({
        type: 'slide',
        id: slideId,
        name: slide.shotId ? `Slide from shot ${slide.shotId}` : 'Slide',
      });
    }
  };

  const handleDeleteAudioTrack = (trackId: string) => {
    const track = audioTracks.find(t => t.id === trackId);
    if (track) {
      setDeleteConfirm({
        type: 'audio',
        id: trackId,
        name: track.name || track.voiceName || 'Audio track',
      });
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    
    if (deleteConfirm.type === 'slide') {
      setSlides(prev => prev.filter(s => s.id !== deleteConfirm.id));
      // Also remove from selection if it was selected
      setSelectedSlides(prev => {
        const newSelected = new Set(prev);
        newSelected.delete(deleteConfirm.id);
        return newSelected;
      });
    } else if (deleteConfirm.type === 'audio') {
      setAudioTracks(prev => prev.filter(t => t.id !== deleteConfirm.id));
    }
    
    setDeleteConfirm(null);
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  // Handle collisions and trim overlapping slides
  const handleCollisions = useCallback((updatedSlides: AVEditingSlide[]): AVEditingSlide[] => {
    if (updatedSlides.length === 0) return [];
    
    // Sort slides by startTime
    const sorted = [...updatedSlides].sort((a, b) => a.startTime - b.startTime);
    const result: AVEditingSlide[] = [];
    
    sorted.forEach((slide, index) => {
      if (index === 0) {
        // First slide - ensure it starts at 0
        result.push({
          ...slide,
          startTime: Math.max(0, slide.startTime),
          updatedAt: new Date(),
        });
      } else {
        const previousSlide = result[result.length - 1];
        const previousEnd = previousSlide.startTime + previousSlide.duration;
        
        if (slide.startTime < previousEnd) {
          // Collision detected - trim the current slide
          const overlap = previousEnd - slide.startTime;
          const newDuration = Math.max(MIN_DURATION, slide.duration - overlap);
          const newStartTime = previousEnd;
          
          result.push({
            ...slide,
            startTime: newStartTime,
            duration: newDuration,
            updatedAt: new Date(),
          });
        } else {
          result.push({
            ...slide,
            startTime: Math.max(0, slide.startTime),
            updatedAt: new Date(),
          });
        }
      }
    });
    
    return result;
  }, []);

  // Helper function to find adjacent slides that could conflict when resizing
  // Moved before handleSlideDurationChange to fix initialization order
  const findAdjacentSlides = useCallback((slideId: string, slidesList: AVEditingSlide[]): {
    previous: AVEditingSlide | null;
    next: AVEditingSlide | null;
  } => {
    const currentSlide = slidesList.find(s => s.id === slideId);
    if (!currentSlide) {
      return { previous: null, next: null };
    }

    const currentSlideStart = currentSlide.startTime;
    const currentSlideEnd = currentSlide.startTime + currentSlide.duration;

    // Find the closest slide that ends before or at the current slide's start
    // (this is the slide we shouldn't overlap with when resizing the start handle)
    let previous: AVEditingSlide | null = null;
    let previousEnd = -Infinity;
    
    // Find the closest slide that starts after or at the current slide's end
    // (this is the slide we shouldn't overlap with when resizing the end handle)
    let next: AVEditingSlide | null = null;
    let nextStart = Infinity;

    for (const slide of slidesList) {
      if (slide.id === slideId) continue; // Skip the current slide

      const slideStart = slide.startTime;
      const slideEnd = slide.startTime + slide.duration;

      // Check for previous slide (ends before or at current slide's start)
      if (slideEnd <= currentSlideStart && slideEnd > previousEnd) {
        previous = slide;
        previousEnd = slideEnd;
      }

      // Check for next slide (starts after or at current slide's end)
      if (slideStart >= currentSlideEnd && slideStart < nextStart) {
        next = slide;
        nextStart = slideStart;
      }
    }

    return { previous, next };
  }, []);

  const handleSlideDurationChange = useCallback((slideId: string, newDuration: number) => {
    if (newDuration < MIN_DURATION) return;
    
    setSlides(prev => {
      const currentSlide = prev.find(s => s.id === slideId);
      if (!currentSlide) return prev;

      // Find adjacent slides to check for overlaps
      const { next } = findAdjacentSlides(slideId, prev);
      
      // Calculate the new end time
      const newEndTime = currentSlide.startTime + newDuration;
      
      // If there's a next slide, ensure we don't overlap with it
      let clampedDuration = newDuration;
      if (next) {
        const nextSlideStart = next.startTime;
        const maxEndTime = nextSlideStart; // Can go up to but not overlap with next slide
        const maxDuration = maxEndTime - currentSlide.startTime;
        clampedDuration = Math.min(newDuration, maxDuration);
      }
      
      // Ensure minimum duration
      clampedDuration = Math.max(MIN_DURATION, clampedDuration);
      
      const updated = prev.map(slide => {
        if (slide.id === slideId) {
          return {
            ...slide,
            duration: clampedDuration,
            updatedAt: new Date(),
          };
        }
        // Don't modify other slides
        return slide;
      });
      
      // Update ref immediately
      slidesRef.current = updated;
      
      return updated;
    });
  }, [findAdjacentSlides]);


  // CRITICAL: Save current state to history before making changes
  const saveToHistory = useCallback((newSlides: AVEditingSlide[]) => {
    setHistory(prev => {
      // Remove any history after current index (when undoing and then making new changes)
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add new state
      newHistory.push(JSON.parse(JSON.stringify(newSlides))); // Deep copy
      // Limit history size
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex(prev => {
      const newIndex = prev + 1;
      // Limit history index to max size
      return Math.min(newIndex, maxHistorySize - 1);
    });
  }, [historyIndex, maxHistorySize]);

  // CRITICAL: Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex > 0 && history.length > 0) {
      const previousState = history[historyIndex - 1];
      setSlides(previousState);
      slidesRef.current = previousState;
      setHistoryIndex(prev => prev - 1);
    }
  }, [history, historyIndex]);

  // CRITICAL: Redo function
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1 && history.length > 0) {
      const nextState = history[historyIndex + 1];
      setSlides(nextState);
      slidesRef.current = nextState;
      setHistoryIndex(prev => prev + 1);
    }
  }, [history, historyIndex]);

  // CRITICAL: Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      if (isInput) return;
      
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        handleRedo();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // CRITICAL: Initialize history with initial slides state
  useEffect(() => {
    if (slides.length > 0 && history.length === 0) {
      setHistory([JSON.parse(JSON.stringify(slides))]);
      setHistoryIndex(0);
    }
  }, [slides.length]); // Only run once on initial load

  const handleDragStart = (e: React.MouseEvent, slideId: string) => {
    // CRITICAL: Check if the clicked slide is already selected
    const isSelected = selectedSlides.has(slideId);
    
    // CRITICAL: If Ctrl/Cmd is held, toggle selection instead of starting drag
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedSlides(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(slideId)) {
          // Deselect if already selected
          newSelection.delete(slideId);
        } else {
          // Add to selection
          newSelection.add(slideId);
        }
        return newSelection;
      });
      return;
    }
    
    // Prevent drag if clicking on resize handle
    const target = e.target as HTMLElement;
    if (target.classList.contains('resize-handle')) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent text selection
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
    
    // CRITICAL: If clicking on unselected slide, select only that slide
    if (!isSelected) {
      setSelectedSlides(new Set([slideId]));
    }
    
    // CRITICAL: Save current state to history before dragging
    saveToHistory(slides);
    
    setIsDragging(true);
    setDraggedSlideId(slideId);
    setDragStartX(e.clientX);
    
    const slide = slides.find(s => s.id === slideId);
    if (slide) {
      setDragStartTime(slide.startTime);
    }
  };

  // Helper function to check if two slides overlap
  const slidesOverlap = useCallback((slide1: AVEditingSlide, slide2: AVEditingSlide): boolean => {
    const slide1End = slide1.startTime + slide1.duration;
    const slide2End = slide2.startTime + slide2.duration;
    // Check if slides overlap (with a small epsilon to handle edge cases)
    return !(slide1End <= slide2.startTime || slide2End <= slide1.startTime);
  }, []);

  // Helper function to adjust slide position to prevent overlaps
  // Returns the minimum start time that prevents all overlaps
  const adjustSlidePositionToPreventOverlaps = useCallback((
    slide: AVEditingSlide,
    newStartTime: number,
    otherSlides: AVEditingSlide[],
    excludeSlideIds: Set<string>
  ): number => {
    let adjustedStartTime = newStartTime;
    const slideDuration = slide.duration;
    
    // Check for overlaps with all other slides (excluding selected slides)
    for (const otherSlide of otherSlides) {
      if (excludeSlideIds.has(otherSlide.id)) continue;
      
      const otherSlideStart = otherSlide.startTime;
      const otherSlideEnd = otherSlide.startTime + otherSlide.duration;
      const slideEnd = adjustedStartTime + slideDuration;
      
      // If the new position overlaps with this slide
      if (adjustedStartTime < otherSlideEnd && slideEnd > otherSlideStart) {
        // Snap to the end of this slide (push to the right)
        // This ensures we don't overlap with this particular slide
        adjustedStartTime = Math.max(adjustedStartTime, otherSlideEnd);
      }
    }
    
    return Math.max(0, adjustedStartTime);
  }, []);

  // CRITICAL: Calculate slide positions during drag (for preview) or after drop (for actual update)
  // Now supports moving multiple selected slides together
  const calculateSlidePositions = useCallback((
    slideId: string,
    newStartTime: number,
    targetSlideId: string | null | undefined,
    insertBefore: boolean | undefined,
    currentSlidesList: AVEditingSlide[],
    selectedSlideIds: Set<string> // CRITICAL: Multi-select support
  ): { draggedSlide: AVEditingSlide; updatedSlides: AVEditingSlide[] } => {
    // Find the dragged slide (primary slide being dragged)
    const draggedSlide = currentSlidesList.find(s => s.id === slideId);
    if (!draggedSlide) {
      return { draggedSlide: currentSlidesList[0], updatedSlides: currentSlidesList };
    }
    
    // CRITICAL: Get all selected slides (including the dragged slide)
    const selectedSlidesList = currentSlidesList.filter(s => selectedSlideIds.has(s.id));
    
    // CRITICAL: Calculate relative positions of selected slides to the dragged slide
    // This maintains the relative spacing between selected slides
    const draggedSlideOriginalTime = draggedSlide.startTime;
    const selectedSlidesRelativePositions = selectedSlidesList.map(slide => ({
      slide,
      relativeOffset: slide.startTime - draggedSlideOriginalTime,
    }));
    
    // Sort selected slides by original position
    selectedSlidesRelativePositions.sort((a, b) => a.relativeOffset - b.relativeOffset);
    
    // Remove selected slides from the list
    const otherSlides = currentSlidesList.filter(s => !selectedSlideIds.has(s.id));
    
    // Sort other slides by startTime
    const sortedOtherSlides = [...otherSlides].sort((a, b) => a.startTime - b.startTime);
    
    let insertIndex: number;
    let insertionTime: number;
    
    // CRITICAL: Industry-standard insertion logic (like CapCut/Premiere Pro)
    // If we have a target slide, insert relative to it based on insertBefore flag
    if (targetSlideId && targetSlideId !== slideId && !selectedSlideIds.has(targetSlideId)) {
      const targetSlide = sortedOtherSlides.find(s => s.id === targetSlideId);
      if (targetSlide) {
        if (insertBefore) {
          // Insert BEFORE target slide (left 50% hover)
          // Selected slides go before target, target and all slides to the right shift forward
          insertIndex = sortedOtherSlides.findIndex(s => s.id === targetSlideId);
          insertionTime = targetSlide.startTime;
        } else {
          // Insert AFTER target slide (right 50% hover)
          // Selected slides go after target, only slides to the right of target shift forward
          insertIndex = sortedOtherSlides.findIndex(s => s.id === targetSlideId) + 1;
          insertionTime = targetSlide.startTime + targetSlide.duration;
        }
      } else {
        // Target slide not found, fall back to position-based insertion
        insertIndex = sortedOtherSlides.findIndex(slide => slide.startTime >= newStartTime);
        if (insertIndex === -1) {
          insertIndex = sortedOtherSlides.length;
        }
        insertionTime = newStartTime;
      }
    } else {
      // No target slide - use position-based insertion (fallback)
      insertIndex = sortedOtherSlides.findIndex(slide => slide.startTime >= newStartTime);
      if (insertIndex === -1) {
        insertIndex = sortedOtherSlides.length;
      }
      insertionTime = Math.max(0, newStartTime);
    }
    
    // Calculate new positions for all slides
    const updatedSlides: AVEditingSlide[] = [];
    const clampedInsertionTime = Math.max(0, insertionTime);
    
    // CRITICAL: Calculate total duration of selected slides (for pushing other slides)
    const totalSelectedDuration = selectedSlidesRelativePositions.reduce((sum, { slide }) => sum + slide.duration, 0);
    
    // Add slides before the insertion point (keep their positions unchanged)
    for (let i = 0; i < insertIndex; i++) {
      updatedSlides.push(sortedOtherSlides[i]);
    }
    
    // CRITICAL: Insert all selected slides at their new positions (maintaining relative spacing)
    selectedSlidesRelativePositions.forEach(({ slide, relativeOffset }) => {
      const newStartTimeForSlide = clampedInsertionTime + relativeOffset;
      updatedSlides.push({
        ...slide,
        startTime: Math.max(0, newStartTimeForSlide),
        updatedAt: new Date(),
      });
    });
    
    // CRITICAL: Push all subsequent slides forward by the total duration of selected slides
    // This creates a contiguous, non-overlapping timeline
    const lastSelectedSlideEnd = Math.max(...selectedSlidesRelativePositions.map(({ slide, relativeOffset }) => 
      clampedInsertionTime + relativeOffset + slide.duration
    ), clampedInsertionTime);
    let currentTime = lastSelectedSlideEnd;
    
    for (let i = insertIndex; i < sortedOtherSlides.length; i++) {
      const slide = sortedOtherSlides[i];
      // Push this slide forward to make room for the selected slides
      updatedSlides.push({
        ...slide,
        startTime: currentTime,
        updatedAt: new Date(),
      });
      currentTime += slide.duration;
    }
    
    // Update order based on final startTime (should match timeline order)
    const finalSorted = [...updatedSlides].sort((a, b) => a.startTime - b.startTime);
    const reordered = finalSorted.map((slide, index) => ({
      ...slide,
      order: index,
      updatedAt: slide.order !== index ? new Date() : slide.updatedAt,
    }));
    
    return { draggedSlide: draggedSlide, updatedSlides: reordered };
  }, []);

  // CRITICAL: Preview state for slides during drag (shows where slides will be after drop)
  const [previewSlides, setPreviewSlides] = useState<AVEditingSlide[] | null>(null);

  const handleSlideMove = useCallback((slideId: string, newStartTime: number, targetSlideId?: string | null, insertBefore?: boolean, isPreview: boolean = false) => {
    if (isPreview) {
      // CRITICAL: During drag, only update preview state - don't move actual slides yet
      // This allows the dragged slide to move freely while showing where other slides will be
      const currentSlidesList = slidesRef.current;
      const { updatedSlides } = calculateSlidePositions(slideId, newStartTime, targetSlideId, insertBefore, currentSlidesList, selectedSlides);
      setPreviewSlides(updatedSlides);
    } else {
      // CRITICAL: On drop, actually update the slides
      setSlides(prev => {
        const { updatedSlides } = calculateSlidePositions(slideId, newStartTime, targetSlideId, insertBefore, prev, selectedSlides);
        // CRITICAL: Save to history after dropping
        saveToHistory(updatedSlides);
        return updatedSlides;
      });
      setPreviewSlides(null);
    }
  }, [calculateSlidePositions, selectedSlides, saveToHistory]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedSlideId) return;

    e.preventDefault();

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    // Calculate mouse position relative to timeline
    const mouseX = e.clientX - timelineRect.left + timelineScrollLeft;
    const mouseTime = mouseX / pixelsPerSecond;
    
    // CRITICAL: Find which slide (if any) the mouse is hovering over
    // This determines where to insert the dragged slide
    const currentSlides = slidesRef.current;
    const otherSlides = currentSlides.filter(s => s.id !== draggedSlideId);
    
    // Find the slide that the mouse is over
    let hoveredSlide: AVEditingSlide | null = null;
    let insertBefore = false;
    
    for (const slide of otherSlides) {
      const slideLeft = slide.startTime * pixelsPerSecond;
      const slideWidth = slide.duration * pixelsPerSecond;
      const slideRight = slideLeft + slideWidth;
      
      // Check if mouse is within this slide's bounds
      if (mouseX >= slideLeft && mouseX <= slideRight) {
        hoveredSlide = slide;
        // CRITICAL: Check if mouse is in left 50% (insert before) or right 50% (insert after)
        const slideMidpoint = slideLeft + (slideWidth / 2);
        insertBefore = mouseX < slideMidpoint;
        break;
      }
    }
    
    // Update hovered slide state for visual feedback
    if (hoveredSlide) {
      setHoveredSlideId(hoveredSlide.id);
      setInsertBeforeSlideId(insertBefore ? hoveredSlide.id : null);
    } else {
      setHoveredSlideId(null);
      setInsertBeforeSlideId(null);
    }
    
    // CRITICAL: Calculate new start time for dragged slide
    // If hovering over a slide, use insertion position (before/after)
    // Otherwise, use mouse position (free drag)
    let newStartTime: number;
    
    if (hoveredSlide) {
      // CRITICAL: Hovering over a slide - calculate insertion position
      if (insertBefore) {
        // Will be inserted before hovered slide (left 50%)
        newStartTime = hoveredSlide.startTime;
      } else {
        // Will be inserted after hovered slide (right 50%)
        newStartTime = hoveredSlide.startTime + hoveredSlide.duration;
      }
      // CRITICAL: Update preview to show where slides will be after drop
      handleSlideMove(draggedSlideId, newStartTime, hoveredSlide.id, insertBefore, true);
    } else {
      // CRITICAL: Not hovering over any slide - use mouse position (free drag)
      // Only update dragged slide position, don't show preview for other slides
      const deltaX = e.clientX - dragStartX;
      const deltaSeconds = deltaX / pixelsPerSecond;
      newStartTime = Math.max(0, dragStartTime + deltaSeconds);
      
      // CRITICAL: Update all selected slides' positions (maintaining relative spacing)
      // But prevent overlaps with non-selected slides
      setPreviewSlides(null);
      setSlides(prev => {
        // CRITICAL: Calculate relative offsets for all selected slides
        const draggedSlide = prev.find(s => s.id === draggedSlideId);
        if (!draggedSlide) return prev;
        
        // Get all non-selected slides (these are the obstacles we need to avoid)
        const nonSelectedSlides = prev.filter(s => !selectedSlides.has(s.id));
        
        // Sort selected slides by their original position to maintain order
        const selectedSlidesList = prev.filter(s => selectedSlides.has(s.id))
          .sort((a, b) => a.startTime - b.startTime);
        
        // Calculate new positions for all selected slides, checking for overlaps
        const updatedSelectedSlides: AVEditingSlide[] = [];
        
        // Calculate relative offset of dragged slide from the first selected slide
        const draggedSlideRelativeOffset = selectedSlidesList.length > 0 
          ? draggedSlide.startTime - selectedSlidesList[0].startTime 
          : 0;
        
        // Calculate where the first selected slide should start based on dragged slide position
        let firstSelectedStartTime = newStartTime - draggedSlideRelativeOffset;
        
        // Position selected slides one by one, preventing overlaps
        // This ensures slides are positioned sequentially and overlaps are resolved
        selectedSlidesList.forEach((slide, index) => {
          // Calculate ideal position maintaining relative spacing
          const relativeOffset = slide.startTime - selectedSlidesList[0].startTime;
          let slideStartTime = firstSelectedStartTime + relativeOffset;
          
          // Combine all obstacles: non-selected slides + previously positioned selected slides
          // Only exclude the current slide being positioned (we want to check against previously positioned selected slides)
          const allObstacles = [...nonSelectedSlides, ...updatedSelectedSlides];
          slideStartTime = adjustSlidePositionToPreventOverlaps(
            slide,
            slideStartTime,
            allObstacles,
            new Set([slide.id]) // Only exclude the current slide, check against all others
          );
          
          // Additional safety check: ensure this slide doesn't overlap with immediately previous selected slide
          // This handles edge cases and ensures slides are placed sequentially
          if (index > 0 && updatedSelectedSlides.length > 0) {
            const previousSelectedSlide = updatedSelectedSlides[updatedSelectedSlides.length - 1];
            const previousEnd = previousSelectedSlide.startTime + previousSelectedSlide.duration;
            
            // If there's any overlap, push this slide to just after the previous one
            if (slideStartTime < previousEnd) {
              slideStartTime = previousEnd;
            }
          }
          
          // If the first slide was adjusted, update the base position for subsequent slides
          // This helps maintain relative spacing when possible
          if (index === 0) {
            const adjustment = slideStartTime - (firstSelectedStartTime + relativeOffset);
            if (adjustment !== 0) {
              // Adjust the base start time so subsequent slides maintain spacing
              firstSelectedStartTime = slideStartTime;
            }
          }
          
          updatedSelectedSlides.push({
            ...slide,
            startTime: Math.max(0, slideStartTime),
            updatedAt: new Date(),
          });
        });
        
        // Create a map of updated selected slides for quick lookup
        const updatedSelectedMap = new Map(updatedSelectedSlides.map(s => [s.id, s]));
        
        // Build the final updated slides array
        const updated = prev.map(s => {
          if (selectedSlides.has(s.id)) {
            return updatedSelectedMap.get(s.id) || s;
          }
          return s;
        });
        
        // Update ref immediately
        slidesRef.current = updated;
        return updated;
      });
    }
  }, [isDragging, draggedSlideId, dragStartX, dragStartTime, handleSlideMove, pixelsPerSecond, timelineScrollLeft, selectedSlides, adjustSlidePositionToPreventOverlaps]);

  const handleDragEnd = useCallback(() => {
    if (!draggedSlideId) return;
    
    // CRITICAL: On drop, apply the actual slide positions from preview
    if (previewSlides && hoveredSlideId) {
      // CRITICAL: If we were hovering over a slide, apply preview positions
      setSlides(previewSlides);
      // Update refs immediately
      slidesRef.current = previewSlides;
      // CRITICAL: Save to history after dropping
      saveToHistory(previewSlides);
    } else {
      // CRITICAL: If we weren't hovering (free drag), save current state to history
      const currentSlides = slidesRef.current;
      saveToHistory(currentSlides);
    }
    
    // Clear drag state
    setIsDragging(false);
    setDraggedSlideId(null);
    setHoveredSlideId(null);
    setInsertBeforeSlideId(null);
    setPreviewSlides(null);
    
    // Don't save immediately - let the 30-second autosave handle it
    // This prevents excessive writes during rapid drag operations
  }, [draggedSlideId, previewSlides, hoveredSlideId, saveToHistory]);

  const handleAudioTrackDragMove = useCallback((e: MouseEvent) => {
    if (!isDraggingAudioTrack || !draggedAudioTrackId) return;

    e.preventDefault();

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const deltaX = e.clientX - dragStartX;
    const deltaSeconds = deltaX / pixelsPerSecond;
    const newStartTime = Math.max(0, audioTrackDragStartTime + deltaSeconds);

    setAudioTracks(prev => prev.map(track => 
      track.id === draggedAudioTrackId
        ? { ...track, startTime: newStartTime, updatedAt: new Date() }
        : track
    ));
  }, [isDraggingAudioTrack, draggedAudioTrackId, dragStartX, audioTrackDragStartTime, pixelsPerSecond]);

  const handleAudioTrackDragEnd = useCallback(() => {
    setIsDraggingAudioTrack(false);
    setDraggedAudioTrackId(null);
  }, []);

  const handleResizeStart = (e: React.MouseEvent, slideId: string, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent text selection
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
    
    // CRITICAL: Save to history before resizing
    saveToHistory(slides);
    
    setSelectedResizeHandle(handle);
    // CRITICAL: Select only this slide when resizing (single select)
    setSelectedSlides(new Set([slideId]));
    setIsResizing(true);
    setResizeStartX(e.clientX);
    
    const slide = slides.find(s => s.id === slideId);
    if (slide) {
      setResizeStartDuration(slide.duration);
      setResizeStartTime(slide.startTime);
    }
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !selectedResizeHandle || selectedSlides.size !== 1) return;
    const selectedSlide = Array.from(selectedSlides)[0];

    e.preventDefault();
    e.stopPropagation();

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const deltaX = e.clientX - resizeStartX;
    const deltaSeconds = deltaX / pixelsPerSecond;

    if (selectedResizeHandle === 'end') {
      // Resizing the end handle - check for overlap with next slide
      const newDuration = Math.max(MIN_DURATION, resizeStartDuration + deltaSeconds);
      handleSlideDurationChange(selectedSlide, newDuration);
    } else if (selectedResizeHandle === 'start') {
      // Resizing the start handle - check for overlap with previous slide and next slide
      // When resizing the start handle, the end time stays fixed (end handle doesn't move)
      setSlides(prev => {
        const currentSlide = prev.find(s => s.id === selectedSlide);
        if (!currentSlide) return prev;

        // Find adjacent slides to check for overlaps
        const { previous, next } = findAdjacentSlides(selectedSlide, prev);
        
        // Calculate the fixed end time (doesn't change when resizing start handle)
        const fixedEndTime = resizeStartTime + resizeStartDuration;
        
        // Calculate ideal new start time based on mouse movement
        let newStartTime = Math.max(0, resizeStartTime + deltaSeconds);
        let newDuration = resizeStartDuration; // Default to original duration
        
        // Constraint 1: Ensure the fixed end time doesn't overlap with next slide
        // If it does, we can't resize without changing the end time, so prevent resize
        if (next && fixedEndTime > next.startTime) {
          // Fixed end time would overlap with next slide - prevent resize
          // Keep original values
          newStartTime = resizeStartTime;
          newDuration = resizeStartDuration;
        } else {
          // Fixed end time is safe - proceed with resize
          
          // Constraint 2: Ensure we don't overlap with previous slide
          if (previous) {
            const previousEnd = previous.startTime + previous.duration;
            newStartTime = Math.max(newStartTime, previousEnd);
          }
          
          // Constraint 3: Calculate duration based on the new start time and fixed end time
          newDuration = fixedEndTime - newStartTime;
          
          // Constraint 4: Ensure minimum duration is maintained
          if (newDuration < MIN_DURATION) {
            // Duration would be too small - adjust start time back
            newStartTime = fixedEndTime - MIN_DURATION;
            newDuration = MIN_DURATION;
            
            // Re-check constraint 2: ensure we still don't overlap with previous slide
            if (previous) {
              const previousEnd = previous.startTime + previous.duration;
              if (newStartTime < previousEnd) {
                // Can't maintain minimum duration without overlapping previous slide
                // Prevent resize - keep original values
                newStartTime = resizeStartTime;
                newDuration = resizeStartDuration;
              }
            }
            
            // Ensure start time is not negative
            if (newStartTime < 0) {
              newStartTime = 0;
              newDuration = Math.max(MIN_DURATION, fixedEndTime);
            }
          }
        }
        
        const updated = prev.map(slide => {
          if (slide.id === selectedSlide) {
            return {
              ...slide,
              startTime: newStartTime,
              duration: newDuration,
              updatedAt: new Date(),
            };
          }
          return slide;
        });
        
        // Update ref immediately
        slidesRef.current = updated;
        
        return updated;
      });
    }
  }, [isResizing, selectedResizeHandle, selectedSlide, resizeStartX, resizeStartDuration, resizeStartTime, handleSlideDurationChange, pixelsPerSecond, findAdjacentSlides]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setSelectedResizeHandle(null);
    // Don't save immediately - let the 30-second autosave handle it
    // This prevents excessive writes during rapid resize operations
  }, []);

  // Handle drag and resize events
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Handle audio track drag events
  useEffect(() => {
    if (isDraggingAudioTrack) {
      window.addEventListener('mousemove', handleAudioTrackDragMove);
      window.addEventListener('mouseup', handleAudioTrackDragEnd);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      return () => {
        window.removeEventListener('mousemove', handleAudioTrackDragMove);
        window.removeEventListener('mouseup', handleAudioTrackDragEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDraggingAudioTrack, handleAudioTrackDragMove, handleAudioTrackDragEnd]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      // Prevent text selection during resize
      document.body.style.userSelect = 'none';
      document.body.style.cursor = selectedResizeHandle === 'start' ? 'w-resize' : 'e-resize';
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd, selectedResizeHandle]);

  // Format time as MM:SS:FF (minutes:seconds:frames) at 24 fps
  const formatTime = (seconds: number): string => {
    const totalFrames = Math.floor(seconds * 24); // 24 fps
    const mins = Math.floor(totalFrames / (24 * 60));
    const remainingFrames = totalFrames % (24 * 60);
    const secs = Math.floor(remainingFrames / 24);
    const frames = remainingFrames % 24;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  // Filter slides by selected segment
  const filteredSlides = React.useMemo(() => {
    console.log('🔍 Filtering slides:', {
      totalSlides: slides.length,
      selectedSegmentId,
      hasAVScript: !!avScript,
      segmentsCount: avScript?.segments.length || 0,
    });
    
    return slides.filter(slide => {
      // If no AV script, show all slides (shouldn't happen, but safety check)
      if (!avScript) {
        return true;
      }
      // If no segment is selected yet, show all slides temporarily until segment is selected
      if (!selectedSegmentId || selectedSegmentId === '') {
        console.log('⚠️ No segment selected, showing all slides temporarily', { slideId: slide.id, shotId: slide.shotId });
        return true;
      }
      // If slide doesn't have shotId, don't show it (it's a manual slide without AV script connection)
      if (!slide.shotId) {
        console.log('🔍 Slide filtered out (no shotId):', { slideId: slide.id });
        return false;
      }
      const segment = avScript.segments.find(seg => seg.id === selectedSegmentId);
      if (!segment) {
        console.log('⚠️ Selected segment not found:', { selectedSegmentId, slideId: slide.id });
        return false;
      }
      const belongsToSegment = segment.shots.some(shot => shot.id === slide.shotId);
      if (!belongsToSegment) {
        console.log('🔍 Slide filtered out (not in segment):', { 
          slideId: slide.id, 
          shotId: slide.shotId, 
          selectedSegmentId, 
          segmentNumber: segment.segmentNumber,
          segmentShotIds: segment.shots.map(s => s.id),
        });
      }
      return belongsToSegment;
    });
  }, [slides, selectedSegmentId, avScript]);

  // Filter audio tracks by selected segment
  const filteredAudioTracks = audioTracks.filter(track => {
    if (!track.shotId || !avScript || !selectedSegmentId) return true; // Show tracks without shotId (manually added)
    const segment = avScript.segments.find(seg => seg.id === selectedSegmentId);
    return segment?.shots.some(shot => shot.id === track.shotId) ?? false;
  });

  // CRITICAL: Show ALL segments in dropdown, not just ones with content
  // This ensures scene 02 is visible even if it doesn't have slides yet
  const allSegments = avScript ? avScript.segments : [];

  // Initialize selectedSegmentId to first segment by default
  // CRITICAL: Use a separate effect that runs immediately when avScript changes
  useEffect(() => {
    if (avScript && avScript.segments.length > 0) {
      // Auto-select first segment if we haven't selected one yet
      // CRITICAL: Check both empty string and falsy to catch all cases
      if (!selectedSegmentId || selectedSegmentId === '') {
        console.log('🎯 Auto-selecting first segment:', avScript.segments[0].id, avScript.segments[0].segmentNumber);
        setSelectedSegmentId(avScript.segments[0].id);
      } else {
        // Verify that selectedSegmentId still exists in avScript
        const segmentExists = avScript.segments.some(seg => seg.id === selectedSegmentId);
        if (!segmentExists) {
          console.log('⚠️ Selected segment no longer exists, selecting first segment:', avScript.segments[0].id);
          setSelectedSegmentId(avScript.segments[0].id);
        }
      }
    }
  }, [avScript, selectedSegmentId]);

  // Calculate total duration based on filtered slides and audio tracks
  const totalDuration = Math.max(
    ...filteredSlides.map(s => s.startTime + s.duration),
    ...filteredAudioTracks.map(t => t.startTime + t.duration),
    0
  );

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setPixelsPerSecond(prev => Math.min(MAX_PIXELS_PER_SECOND, prev * ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPixelsPerSecond(prev => Math.max(MIN_PIXELS_PER_SECOND, prev / ZOOM_STEP));
  }, []);

  const handleZoomReset = useCallback(() => {
    setPixelsPerSecond(DEFAULT_PIXELS_PER_SECOND);
  }, []);

  // Mouse wheel zoom
  const handleTimelineWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  }, [handleZoomIn, handleZoomOut]);

  // Playhead dragging
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPlayhead(true);
    setIsPlaying(false); // Pause when dragging playhead
    
    const timelineContainer = timelineRef.current?.parentElement;
    if (timelineContainer) {
      const containerRect = timelineContainer.getBoundingClientRect();
      const scrollLeft = timelineContainer.scrollLeft;
      const x = e.clientX - containerRect.left + scrollLeft;
      const newTime = Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
      setCurrentTime(newTime);
      currentTimeRef.current = newTime;
    }
  }, [pixelsPerSecond, totalDuration]);

  const handlePlayheadDrag = useCallback((e: MouseEvent) => {
    if (!isDraggingPlayhead) return;

    const timelineContainer = timelineRef.current?.parentElement;
    if (!timelineContainer) return;

    const containerRect = timelineContainer.getBoundingClientRect();
    const scrollLeft = timelineContainer.scrollLeft;
    const x = e.clientX - containerRect.left + scrollLeft;
    const newTime = Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    
    // Auto-scroll to keep playhead visible
    const playheadX = newTime * pixelsPerSecond;
    const containerWidth = containerRect.width;
    const currentScroll = scrollLeft;
    
    if (playheadX < currentScroll + 50) {
      timelineContainer.scrollLeft = Math.max(0, playheadX - 50);
    } else if (playheadX > currentScroll + containerWidth - 50) {
      timelineContainer.scrollLeft = playheadX - containerWidth + 50;
    }
  }, [isDraggingPlayhead, pixelsPerSecond, totalDuration]);

  const handlePlayheadDragEnd = useCallback(() => {
    setIsDraggingPlayhead(false);
  }, []);

  // Handle playhead drag events
  useEffect(() => {
    if (isDraggingPlayhead) {
      window.addEventListener('mousemove', handlePlayheadDrag);
      window.addEventListener('mouseup', handlePlayheadDragEnd);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      return () => {
        window.removeEventListener('mousemove', handlePlayheadDrag);
        window.removeEventListener('mouseup', handlePlayheadDragEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDraggingPlayhead, handlePlayheadDrag, handlePlayheadDragEnd]);

  // Export to FCP XML
  const handleExportToFCPXML = useCallback(async () => {
    try {
      console.log('📦 Starting FCP XML export (server-side)...');
      
      // Call server-side API to handle export (avoids CORS issues)
      const response = await fetch('/api/av-editing/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slides,
          audioTracks,
          totalDuration,
          episodeId,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      // Get the ZIP blob from the response
      const zipBlob = await response.blob();
      
      // Download the ZIP file
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `av-editing-export-${episodeId}-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      
      console.log('✅ Export completed successfully!');
    } catch (error) {
      console.error('❌ Error exporting to FCP XML:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to export: ${errorMessage}\n\nPlease check the console for more details.`);
    }
  }, [slides, audioTracks, totalDuration, episodeId]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-gray-900">AV Editing</h2>
            {avScript && allSegments.length > 0 && (
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedSegmentId}
                  onChange={(e) => setSelectedSegmentId(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {allSegments.map(segment => {
                    // Count slides and audio tracks for this segment
                    const slideCount = slides.filter(slide => 
                      slide.shotId && segment.shots.some(shot => shot.id === slide.shotId)
                    ).length;
                    const audioCount = audioTracks.filter(track => 
                      track.shotId && segment.shots.some(shot => shot.id === track.shotId)
                    ).length;
                    const hasContent = slideCount > 0 || audioCount > 0;
                    
                    return (
                      <option key={segment.id} value={segment.id}>
                        Scene {segment.segmentNumber.toString().padStart(2, '0')}: {segment.title} 
                        {hasContent && ` (${slideCount} slides, ${audioCount} audio)`}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              Total Duration: <span className="font-semibold">{formatTime(totalDuration)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  if (editingDataRef.current) {
                    const totalDuration = Math.max(
                      ...(slides.length > 0 ? slides.map(s => s.startTime + s.duration) : [0]),
                      ...(audioTracks.length > 0 ? audioTracks.map(t => t.startTime + t.duration) : [0]),
                      0
                    );
                    const updatedData: AVEditingData = {
                      id: editingDataRef.current.id,
                      episodeId,
                      slides,
                      audioTracks,
                      totalDuration,
                      createdAt: editingDataRef.current.createdAt,
                      updatedAt: new Date(),
                    };
                    saveEditingData(updatedData, true).catch(err => {
                      console.error('Error manually saving:', err);
                    });
                  }
                }}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  saveStatus === 'saving' 
                    ? 'bg-yellow-600 text-white cursor-wait' 
                    : saveStatus === 'saved'
                    ? 'bg-green-600 text-white'
                    : saveStatus === 'error'
                    ? 'bg-red-600 text-white'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
                disabled={saveStatus === 'saving'}
                title={saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error saving' : 'Save now'}
              >
                <Save className="w-4 h-4" />
                <span>
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
                </span>
              </button>
              <button
                onClick={isPlaying ? handlePause : handlePlay}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button
                onClick={handleStop}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </button>
              <button
                onClick={handleExportToFCPXML}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                title="Export to Final Cut Pro XML"
              >
                <Download className="w-4 h-4" />
                <span>Export FCP XML</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview Area (16:9) */}
        <div className="bg-black flex items-center justify-center p-4">
          <div
            ref={previewRef}
            className="w-full max-w-4xl aspect-video bg-gray-900 rounded-lg overflow-hidden relative"
            style={{
              aspectRatio: '16/9',
            }}
          >
            {/* Time indicator */}
            <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded text-sm">
              {formatTime(currentTime)}
            </div>
          </div>
        </div>

        {/* Slides Row - All images in one row */}
        <div className="bg-white border-t border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900">All Slides</h3>
            <button
              onClick={handleAddSlide}
              className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Slide</span>
            </button>
          </div>
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {filteredSlides.length > 0 ? (
              filteredSlides.map((slide) => (
                <div
                  key={slide.id}
                  className={`relative flex-shrink-0 border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                    selectedSlide === slide.id
                      ? 'border-indigo-500 ring-2 ring-indigo-300'
                      : 'border-gray-300 hover:border-indigo-400'
                  }`}
                  style={{ width: '150px', height: '84px' }}
                  onClick={() => {
                    const newSelected = new Set(selectedSlides);
                    if (newSelected.has(slide.id)) {
                      newSelected.delete(slide.id);
                    } else {
                      newSelected.add(slide.id);
                    }
                    setSelectedSlides(newSelected);
                  }}
                >
                  {slide.imageUrl ? (
                    <img
                      src={slide.imageUrl}
                      alt="Slide"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs">
                      No image
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 text-center">
                    {formatTime(slide.duration)}
                  </div>
                  {slide.isFromAVScript && (
                    <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-1 rounded">
                      AV
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSlide(slide.id);
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-8 w-full">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>
                  No slides in this scene. Add slides from AV script or upload new ones.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white border-t border-gray-200 flex-1 overflow-auto">
          <div className="p-4">
            {/* Timeline Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
              <div className="flex items-center space-x-2">
                {/* Zoom Controls */}
                <div className="flex items-center space-x-1 border border-gray-300 rounded-lg p-1">
                  <button
                    onClick={handleZoomOut}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Zoom Out (Ctrl/Cmd + Scroll)"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleZoomReset}
                    className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    title="Reset Zoom"
                  >
                    {Math.round(pixelsPerSecond)}px/s
                  </button>
                  <button
                    onClick={handleZoomIn}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Zoom In (Ctrl/Cmd + Scroll)"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={handleAddAudioTrack}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Add Audio</span>
                </button>
                {/* Add Audio Popup */}
                {showAddAudioPopup && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Add Audio Track</h3>
                        <button
                          onClick={() => {
                            setShowAddAudioPopup(false);
                            setNewAudioFile(null);
                            setNewAudioVoiceName('Music');
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="space-y-4">
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
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Character/Voice
                          </label>
                          <select
                            value={newAudioVoiceName}
                            onChange={(e) => setNewAudioVoiceName(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          >
                            <option value="Music">Music</option>
                            <option value="SFX">SFX</option>
                            <option value="Churrito 1">Churrito 1</option>
                            <option value="Churrito 2">Churrito 2</option>
                            <option value="PIPI">PIPI</option>
                            <option value="Percy">Percy</option>
                            <option value="Muffin 1">Muffin 1</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveNewAudioTrack}
                            disabled={!newAudioFile}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => {
                              setShowAddAudioPopup(false);
                              setNewAudioFile(null);
                              setNewAudioVoiceName('Music');
                            }}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline Ruler with Scrollable Container */}
            <div 
              className="relative mb-4 overflow-x-auto" 
              style={{ height: '30px' }}
              onWheel={handleTimelineWheel}
              onClick={(e) => {
                // Click on ruler to jump playhead
                const container = e.currentTarget;
                const containerRect = container.getBoundingClientRect();
                const scrollLeft = container.scrollLeft;
                const x = e.clientX - containerRect.left + scrollLeft;
                const newTime = Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
                setCurrentTime(newTime);
                currentTimeRef.current = newTime;
              }}
            >
              <div 
                className="absolute inset-0 border-b border-gray-300 cursor-pointer"
                style={{ width: `${totalDuration * pixelsPerSecond}px`, minWidth: '100%' }}
              >
                {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute border-l border-gray-300"
                    style={{ left: `${i * pixelsPerSecond}px` }}
                  >
                    <div className="absolute top-0 text-xs text-gray-500 mt-1 whitespace-nowrap" style={{ transform: 'translateX(-50%)' }}>
                      {formatTime(i)}
                    </div>
                  </div>
                ))}
                {/* Playhead time indicator on ruler */}
                <div
                  className="absolute top-0 pointer-events-none z-20"
                  style={{ left: `${currentTime * pixelsPerSecond}px`, transform: 'translateX(-50%)' }}
                >
                  <div className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-b whitespace-nowrap font-medium">
                    {formatTime(currentTime)}
                  </div>
                </div>
              </div>
            </div>

            {/* Slides Track */}
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-700 mb-2">Slides</div>
              <div
                className="relative border border-gray-300 rounded-lg bg-gray-50 overflow-x-auto"
                style={{ minHeight: '120px', height: '120px' }}
                onWheel={handleTimelineWheel}
                onScroll={(e) => {
                  // CRITICAL: Track scroll position for accurate mouse position calculation during drag
                  setTimelineScrollLeft(e.currentTarget.scrollLeft);
                }}
              >
                <div
                  ref={timelineRef}
                  className="relative"
                  style={{ width: `${totalDuration * pixelsPerSecond}px`, minWidth: '100%', height: '100%' }}
                >
                {/* CRITICAL: Drop indicator line - shows where dragged slide will be inserted */}
                {isDragging && draggedSlideId && hoveredSlideId && (() => {
                  const hoveredSlide = filteredSlides.find(s => s.id === hoveredSlideId);
                  if (!hoveredSlide) return null;
                  
                  const indicatorLeft = insertBeforeSlideId === hoveredSlideId
                    ? hoveredSlide.startTime * pixelsPerSecond
                    : (hoveredSlide.startTime + hoveredSlide.duration) * pixelsPerSecond;
                  
                  return (
                    <div
                      key="drop-indicator"
                      className="absolute top-0 bottom-0 w-0.5 bg-indigo-500 z-30 pointer-events-none shadow-lg"
                      style={{ left: `${indicatorLeft}px` }}
                    >
                      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full bg-indigo-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap mb-1">
                        {insertBeforeSlideId === hoveredSlideId ? 'Insert Before' : 'Insert After'}
                      </div>
                    </div>
                  );
                })()}
                
                {/* CRITICAL: During drag with preview (hovering over slide), show preview positions */}
                {/* Otherwise, show actual slide positions (only dragged slide moves) */}
                {(isDragging && previewSlides && hoveredSlideId 
                  ? previewSlides.filter(s => filteredSlides.some(fs => fs.id === s.id))
                  : filteredSlides
                ).map((slide) => {
                    // CRITICAL: Get position from preview if hovering, otherwise use actual position
                    const left = slide.startTime * pixelsPerSecond;
                    const width = slide.duration * pixelsPerSecond;
                    const isDraggingThis = isDragging && draggedSlideId === slide.id;
                    const isHoveredDuringDrag = isDragging && !isDraggingThis && hoveredSlideId === slide.id;
                    const isInPreview = isDragging && previewSlides && hoveredSlideId && !isDraggingThis;
                    
                    return (
                      <div
                        key={slide.id}
                        className={`absolute top-2 bottom-2 border-2 rounded transition-all duration-150 ${
                          isDraggingThis
                            ? 'cursor-grabbing z-30 shadow-2xl'
                            : isDragging
                            ? 'cursor-grab z-10'
                            : 'cursor-grab'
                        } ${
                          selectedSlide === slide.id && !isDragging
                            ? 'border-indigo-500 bg-indigo-50'
                            : isHoveredDuringDrag
                            ? insertBeforeSlideId === slide.id
                              ? 'border-blue-500 bg-blue-100 z-20'
                              : 'border-green-500 bg-green-100 z-20'
                            : isInPreview
                            ? 'border-gray-300 bg-gray-50 opacity-70'
                            : 'border-gray-400 bg-white hover:border-indigo-300'
                        }`}
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                          minWidth: `${MIN_DURATION * pixelsPerSecond}px`,
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none',
                          pointerEvents: isDraggingThis ? 'auto' : isDragging ? 'none' : 'auto',
                        }}
                      onMouseDown={(e) => {
                        // Only start drag if not clicking on resize handle or delete button
                        const target = e.target as HTMLElement;
                        const isResizeHandle = target.classList.contains('resize-handle') || 
                                              target.closest('.resize-handle');
                        const isButton = target.closest('button');
                        
                        if (!isResizeHandle && !isButton) {
                          handleDragStart(e, slide.id);
                        }
                      }}
                      onClick={(e) => {
                        // Don't select if we were dragging or clicking on interactive elements
                        const target = e.target as HTMLElement;
                        const isResizeHandle = target.classList.contains('resize-handle') || 
                                              target.closest('.resize-handle');
                        const isButton = target.closest('button');
                        
                        if (!isDragging && !isResizeHandle && !isButton) {
                          // CRITICAL: Handle multi-select with Ctrl/Cmd
                          if (e.ctrlKey || e.metaKey) {
                            // Toggle selection
                            setSelectedSlides(prev => {
                              const newSelection = new Set(prev);
                              if (newSelection.has(slide.id)) {
                                newSelection.delete(slide.id);
                              } else {
                                newSelection.add(slide.id);
                              }
                              return newSelection;
                            });
                          } else {
                            // Single select (clear other selections)
                            setSelectedSlides(new Set([slide.id]));
                          }
                        }
                      }}
                    >
                      {/* Resize handles - more visible when selected */}
                      <div
                        className="resize-handle absolute left-0 top-0 bottom-0 w-4 cursor-w-resize z-30 transition-all"
                        onMouseDown={(e) => handleResizeStart(e, slide.id, 'start')}
                        style={{ 
                          userSelect: 'none',
                          backgroundColor: selectedSlide === slide.id ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.1)',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedSlide === slide.id) {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.6)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedSlide === slide.id) {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.3)';
                          }
                        }}
                        title="Drag to resize start"
                      />
                      <div
                        className="resize-handle absolute right-0 top-0 bottom-0 w-4 cursor-e-resize z-30 transition-all"
                        onMouseDown={(e) => handleResizeStart(e, slide.id, 'end')}
                        style={{ 
                          userSelect: 'none',
                          backgroundColor: selectedSlide === slide.id ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.1)',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedSlide === slide.id) {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.6)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedSlide === slide.id) {
                            e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.3)';
                          }
                        }}
                        title="Drag to resize end"
                      />
                      
                      {/* Slide content */}
                      <div 
                        className="h-full flex items-center justify-center p-1"
                        style={{ userSelect: 'none', pointerEvents: 'auto' }}
                      >
                        {slide.imageUrl ? (
                          <img
                            src={slide.imageUrl}
                            alt="Slide"
                            className="max-w-full max-h-full object-contain rounded"
                            draggable={false}
                            style={{ userSelect: 'none', pointerEvents: 'none' }}
                          />
                        ) : (
                          // CRITICAL: Show placeholder for slides without images (like scene 02)
                          <div className="flex flex-col items-center justify-center text-gray-400 text-xs">
                            <ImageIcon className="w-8 h-8 mb-1 opacity-50" />
                            <div className="text-center">
                              <div>No image</div>
                              {slide.shotId && (
                                <div className="text-[10px] mt-1">Shot: {slide.shotId.substring(0, 8)}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Duration label */}
                      <div 
                        className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 text-center pointer-events-none"
                        style={{ userSelect: 'none' }}
                      >
                        {formatTime(slide.duration)}
                      </div>
                      
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteSlide(slide.id);
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 hover:opacity-100 transition-opacity -mt-2 -mr-2 z-40"
                        title="Delete slide"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                
                {/* Playhead - Draggable */}
                <div
                  className={`absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 ${
                    isDraggingPlayhead ? 'cursor-col-resize' : 'cursor-col-resize'
                  }`}
                  style={{ left: `${currentTime * pixelsPerSecond}px` }}
                  onMouseDown={handlePlayheadMouseDown}
                >
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-8 border-t-red-500 border-l-transparent border-r-transparent" />
                </div>
                </div>
              </div>
            </div>

            {/* Audio Tracks - Grouped by Voice/Character */}
            <div className="space-y-4">
              {/* Group audio tracks by voice name */}
              {(() => {
                const tracksByVoice = new Map<string, AVEditingAudioTrack[]>();
                filteredAudioTracks.forEach(track => {
                  // Use voiceName from track, or extract from name, or default to 'Other'
                  const voiceName = track.voiceName || (() => {
                    const voiceMatch = track.name.match(/^([^-]+)/);
                    return voiceMatch ? voiceMatch[1].trim() : 'Other';
                  })();
                  
                  if (!tracksByVoice.has(voiceName)) {
                    tracksByVoice.set(voiceName, []);
                  }
                  tracksByVoice.get(voiceName)!.push(track);
                });

                const voiceGroups = Array.from(tracksByVoice.entries());
                
                // Only show voice layers that have tracks
                if (voiceGroups.length === 0) {
                  return (
                    <div className="text-center text-gray-500 py-4">
                      No audio tracks. Add audio files in AV script to see them here.
                    </div>
                  );
                }

                return voiceGroups.map(([voiceName, tracks]) => (
                  <div key={voiceName} className="mb-6">
                    <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                      <Volume2 className="w-4 h-4" />
                      <span>{voiceName}</span>
                      <span className="text-xs text-gray-500">({tracks.length} audio{tracks.length !== 1 ? 's' : ''})</span>
                    </div>
                    <div 
                      className="relative border border-gray-300 rounded-lg bg-gray-50 overflow-x-auto"
                      style={{ height: '80px', minHeight: '80px' }}
                      onWheel={handleTimelineWheel}
                    >
                      <div
                        className="relative"
                        style={{ width: `${totalDuration * pixelsPerSecond}px`, minWidth: '100%', height: '100%' }}
                      >
                        {tracks.map((track) => {
                          const waveform = waveformDataRef.current.get(track.id) || [];
                          const trackIsPlaying = isPlaying && currentTime >= track.startTime && currentTime < track.startTime + track.duration;
                          const playheadPosition = trackIsPlaying ? ((currentTime - track.startTime) / track.duration) * 100 : 0;
                          
                          return (
                            <div
                              key={track.id}
                              className={`absolute top-2 bottom-2 bg-green-500 bg-opacity-30 border border-green-600 rounded cursor-grab ${
                                isDraggingAudioTrack && draggedAudioTrackId === track.id
                                  ? 'cursor-grabbing z-20 shadow-lg'
                                  : 'hover:bg-opacity-40'
                              }`}
                              style={{
                                left: `${track.startTime * pixelsPerSecond}px`,
                                width: `${track.duration * pixelsPerSecond}px`,
                                userSelect: 'none',
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDraggingAudioTrack(true);
                                setDraggedAudioTrackId(track.id);
                                setDragStartX(e.clientX);
                                setAudioTrackDragStartTime(track.startTime);
                              }}
                            >
                              {/* Waveform visualization */}
                              {waveform.length > 0 ? (
                                <div className="relative h-full w-full">
                                  <svg
                                    className="absolute inset-0 w-full h-full"
                                    viewBox={`0 0 ${waveform.length * 2} 100`}
                                    preserveAspectRatio="none"
                                  >
                                    {/* Waveform bars */}
                                    {waveform.map((amplitude, index) => {
                                      const barHeight = amplitude * 80;
                                      const x = index * 2;
                                      const isBeforePlayhead = (index / waveform.length) * 100 < playheadPosition;
                                      
                                      return (
                                        <rect
                                          key={index}
                                          x={x}
                                          y={50 - barHeight / 2}
                                          width="1.5"
                                          height={barHeight}
                                          fill={isBeforePlayhead && trackIsPlaying ? '#10b981' : '#059669'}
                                          opacity={0.8}
                                        />
                                      );
                                    })}
                                    
                                    {/* Center line */}
                                    <line
                                      x1="0"
                                      y1="50"
                                      x2={waveform.length * 2}
                                      y2="50"
                                      stroke="#374151"
                                      strokeWidth="0.5"
                                      opacity={0.3}
                                    />
                                    
                                    {/* Playhead indicator */}
                                    {trackIsPlaying && (
                                      <line
                                        x1={(playheadPosition / 100) * waveform.length * 2}
                                        y1="0"
                                        x2={(playheadPosition / 100) * waveform.length * 2}
                                        y2="100"
                                        stroke="#ef4444"
                                        strokeWidth="2"
                                      />
                                    )}
                                  </svg>
                                </div>
                              ) : (
                                <div className="h-full flex items-center justify-center text-xs text-gray-500">
                                  Loading waveform...
                                </div>
                              )}
                              
                              {/* Duration label */}
                              <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 py-0.5 rounded">
                                {formatTime(track.duration)}
                              </div>
                              
                              {/* Delete button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleDeleteAudioTrack(track.id);
                                }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }}
                                className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 hover:opacity-100 transition-opacity -mt-2 -mr-2 z-40"
                                title="Delete audio"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                        
                        {/* Playhead on audio track */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                          style={{ left: `${currentTime * pixelsPerSecond}px` }}
                        >
                          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-8 border-t-red-500 border-l-transparent border-r-transparent" />
                        </div>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm Delete
            </h3>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this {deleteConfirm.type === 'slide' ? 'slide' : 'audio track'}?
              {deleteConfirm.name && (
                <span className="block mt-2 text-sm text-gray-500">
                  {deleteConfirm.name}
                </span>
              )}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

