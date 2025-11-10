'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AVScript, AVEditingSlide, AVEditingAudioTrack, AVEditingData } from '@/types';
import { 
  Play, 
  Pause, 
  Square,
  Plus,
  Trash2,
  Volume2,
  Image as ImageIcon,
  X
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

interface AVEditingProps {
  episodeId: string;
  avScript?: AVScript;
  onSave: (avScript: AVScript) => void;
}

const PIXELS_PER_SECOND = 50; // Timeline scale: 50px = 1 second
const MIN_DURATION = 0.5; // Minimum slide duration in seconds

export function AVEditing({ episodeId, avScript, onSave }: AVEditingProps) {
  const [editingData, setEditingData] = useState<AVEditingData | null>(null);
  const [slides, setSlides] = useState<AVEditingSlide[]>([]);
  const [audioTracks, setAudioTracks] = useState<AVEditingAudioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedSlide, setSelectedSlide] = useState<string | null>(null);
  const [selectedResizeHandle, setSelectedResizeHandle] = useState<'start' | 'end' | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartDuration, setResizeStartDuration] = useState(0);
  const [resizeStartTime, setResizeStartTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  
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
      if (audioContext) {
        audioContext.close();
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

  // Save editing data to Firebase
  const saveEditingData = useCallback(async (data: AVEditingData) => {
    try {
      const docRef = doc(db, 'avEditing', episodeId);
      const firestoreData = convertToFirestoreFormat(data);
      
      console.log('💾 Saving to Firebase:', {
        slidesCount: data.slides.length,
        audioTracksCount: data.audioTracks.length,
        audioTracks: data.audioTracks.map(t => ({ id: t.id, name: t.name, audioUrl: t.audioUrl })),
      });
      
      await setDoc(docRef, firestoreData, { merge: false });
      setEditingData(data);
      console.log('✅ Saved AV editing data to Firebase');
    } catch (error) {
      console.error('❌ Error saving AV editing data:', error);
      console.error('Data that failed to save:', data);
      // Try to log the problematic dates
      if (data.slides) {
        data.slides.forEach((slide, idx) => {
          if (slide.createdAt && isNaN(slide.createdAt.getTime())) {
            console.error(`Invalid createdAt in slide ${idx}:`, slide.createdAt);
          }
          if (slide.updatedAt && isNaN(slide.updatedAt.getTime())) {
            console.error(`Invalid updatedAt in slide ${idx}:`, slide.updatedAt);
          }
        });
      }
      if (data.audioTracks) {
        data.audioTracks.forEach((track, idx) => {
          if (track.createdAt && isNaN(track.createdAt.getTime())) {
            console.error(`Invalid createdAt in audio track ${idx}:`, track.createdAt);
          }
          if (track.updatedAt && isNaN(track.updatedAt.getTime())) {
            console.error(`Invalid updatedAt in audio track ${idx}:`, track.updatedAt);
          }
        });
      }
    }
  }, [episodeId, convertToFirestoreFormat]);

  // Initialize slides from AV script
  const initializeFromAVScript = useCallback(() => {
    if (!avScript) return;

    const newSlides: AVEditingSlide[] = [];
    let currentTime = 0;
    const now = new Date();

    avScript.segments.forEach(segment => {
      segment.shots.forEach(shot => {
        if (shot.imageUrl) {
          newSlides.push({
            id: `slide-${shot.id}`,
            shotId: shot.id,
            imageUrl: shot.imageUrl,
            duration: shot.duration || 3, // Default to 3 seconds if no duration
            startTime: currentTime,
            order: newSlides.length,
            isFromAVScript: true,
            createdAt: now,
            updatedAt: now,
          });
          currentTime += shot.duration || 3;
        }
      });
    });

    const newEditingData: AVEditingData = {
      id: `av-editing-${episodeId}`,
      episodeId,
      slides: newSlides,
      audioTracks: [],
      totalDuration: currentTime,
      createdAt: now,
      updatedAt: now,
    };

    setEditingData(newEditingData);
    setSlides(newSlides);
    // Save will be triggered by auto-save effect, but we can also save immediately
    saveEditingData(newEditingData).catch(err => {
      console.error('Error saving initial AV editing data:', err);
    });
  }, [avScript, episodeId, saveEditingData]);

  // Track if we've loaded data to prevent initialization from overwriting
  const hasLoadedDataRef = useRef(false);

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
          
          hasLoadedDataRef.current = true;
          setEditingData(processedData);
          setSlides(processedData.slides);
          setAudioTracks(processedData.audioTracks);
          
          console.log('✅ State updated with loaded data');
        } else {
          console.log('⚠️ No existing data found, will initialize from AV script if available');
          // Don't initialize here - let the other effect handle it
        }
      } catch (error) {
        console.error('❌ Error loading AV editing data:', error);
        // Don't initialize on error - let the other effect handle it
      }
    };

    loadEditingData();
  }, [episodeId]);

  // Initialize from AV script when it becomes available (only if no existing data was loaded)
  useEffect(() => {
    // Wait a bit to ensure loading has completed
    const timer = setTimeout(() => {
      // Only initialize if:
      // 1. We have AV script
      // 2. We haven't loaded any data from Firebase
      // 3. No editing data exists
      // 4. No slides or audio tracks exist
      if (avScript && !hasLoadedDataRef.current && !editingData && slides.length === 0 && audioTracks.length === 0) {
        console.log('🔄 Initializing from AV script (no existing data found)...');
        initializeFromAVScript();
      } else if (hasLoadedDataRef.current) {
        console.log('⏸️ Skipping AV script initialization - data already loaded from Firebase');
      }
    }, 500); // Wait 500ms for Firebase load to complete

    return () => clearTimeout(timer);
  }, [avScript, editingData, slides.length, audioTracks.length, initializeFromAVScript]);

  // Debug: Log when audio tracks change
  useEffect(() => {
    console.log('🎵 Audio tracks state changed:', {
      count: audioTracks.length,
      tracks: audioTracks.map(t => ({ id: t.id, name: t.name, audioUrl: t.audioUrl })),
    });
  }, [audioTracks]);

  // Auto-save when slides or audio tracks change
  useEffect(() => {
    // Skip saving if we're still loading initial data
    if (slides.length === 0 && audioTracks.length === 0 && !editingDataRef.current) {
      return;
    }

    // Ensure all dates are valid before saving
    const validateDates = (data: AVEditingData): AVEditingData => {
      const now = new Date();
      return {
        ...data,
        slides: data.slides.map(slide => ({
          ...slide,
          createdAt: slide.createdAt && !isNaN(slide.createdAt.getTime()) ? slide.createdAt : now,
          updatedAt: slide.updatedAt && !isNaN(slide.updatedAt.getTime()) ? slide.updatedAt : now,
        })),
        audioTracks: data.audioTracks.map(track => ({
          ...track,
          createdAt: track.createdAt && !isNaN(track.createdAt.getTime()) ? track.createdAt : now,
          updatedAt: track.updatedAt && !isNaN(track.updatedAt.getTime()) ? track.updatedAt : now,
        })),
        createdAt: data.createdAt && !isNaN(data.createdAt.getTime()) ? data.createdAt : now,
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

    const timeoutId = setTimeout(() => {
      console.log('💾 Auto-saving AV editing data...');
      saveEditingData(validatedData);
    }, 1500); // Slightly longer delay to batch rapid changes

    return () => clearTimeout(timeoutId);
  }, [slides, audioTracks, episodeId, saveEditingData]);

  // Update AV script when slide duration changes (for slides from AV script)
  useEffect(() => {
    if (!avScript) return;

    let hasChanges = false;
    const updatedScript = {
      ...avScript,
      segments: avScript.segments.map(segment => ({
        ...segment,
        shots: segment.shots.map(shot => {
          const slide = slides.find(s => s.shotId === shot.id);
          if (slide && slide.duration !== shot.duration) {
            hasChanges = true;
            return {
              ...shot,
              duration: slide.duration,
              updatedAt: new Date(),
            };
          }
          return shot;
        }),
      })),
      updatedAt: new Date(),
    };

    if (hasChanges) {
      onSave(updatedScript);
    }
  }, [slides, avScript, onSave]);

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

    audioTracks.forEach(track => {
      if (!audioElementsRef.current.has(track.id)) {
        const audio = new Audio(track.audioUrl);
        audio.volume = track.volume / 100;
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous'; // Enable CORS for waveform generation
        audioElementsRef.current.set(track.id, audio);
      } else {
        // Update volume if it changed
        const audio = audioElementsRef.current.get(track.id)!;
        audio.volume = track.volume / 100;
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

    // Initialize audio elements using refs
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
      
      // Sync audio tracks - only check every 15 frames to reduce overhead (about 4 times per second at 60fps)
      syncCounter++;
      if (syncCounter >= 15) {
        syncCounter = 0;
        
        currentAudioTracks.forEach(track => {
          const audio = audioElementsRef.current.get(track.id);
          if (!audio) return;

          const wasInRange = currentPlaybackTime >= track.startTime && 
                            currentPlaybackTime < track.startTime + track.duration;
          const isInRange = newTime >= track.startTime && newTime < track.startTime + track.duration;
          
          if (isInRange && !wasInRange) {
            // Just entered the range - start playing
            const offset = newTime - track.startTime;
            audio.currentTime = offset;
            if (audio.paused) {
              audio.play().catch(err => {
                console.error('Error playing audio:', err);
                if (audioContextRef.current?.state === 'suspended') {
                  audioContextRef.current.resume();
                }
              });
            }
          } else if (!isInRange && wasInRange) {
            // Just left the range - pause
            if (!audio.paused) {
              audio.pause();
            }
          } else if (isInRange && !audio.paused) {
            // In range and playing - only sync if drift is significant (reduced frequency)
            const expectedTime = newTime - track.startTime;
            const drift = Math.abs(audio.currentTime - expectedTime);
            // Only sync if drift is more than 0.5 seconds (less aggressive)
            if (drift > 0.5) {
              audio.currentTime = expectedTime;
            }
          }
        });
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
    
    // Start initial audio tracks if needed
    audioTracksRef.current.forEach(track => {
      const audio = audioElementsRef.current.get(track.id);
      if (!audio) return;
      
      const shouldPlay = currentTimeRef.current >= track.startTime && 
                        currentTimeRef.current < track.startTime + track.duration;
      
      if (shouldPlay && audio.paused) {
        const offset = Math.max(0, currentTimeRef.current - track.startTime);
        audio.currentTime = offset;
        audio.play().catch(err => {
          console.error('Error playing audio:', err);
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
          }
        });
      }
    });
    
    animationFrameId = requestAnimationFrame(updateTime);
    
    return () => {
      isActive = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying]); // Only depend on isPlaying

  // Update preview based on current time - ensure only one slide shows
  useEffect(() => {
    if (previewRef.current) {
      // Find the slide that should be displayed at current time
      // Sort by startTime to handle edge cases properly
      const sortedSlides = [...slides].sort((a, b) => a.startTime - b.startTime);
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
        
        if (currentSlide) {
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
  }, [currentTime, slides]);

  const handlePlay = () => {
    setIsPlaying(true);
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
      }
    };
    input.click();
  };

  const handleAddAudioTrack = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const result = await uploadFile(file, `episodes/${episodeId}/av-editing/audio/`);
        if (result) {
          console.log('✅ Audio file uploaded:', result.url);
          
          // Get audio duration - ensure high quality
          const audio = new Audio(result.url);
          audio.preload = 'metadata';
          audio.crossOrigin = 'anonymous';
          
          const loadAudioMetadata = () => {
            return new Promise<number>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Audio metadata loading timeout'));
              }, 10000); // 10 second timeout
              
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
                name: file.name,
                audioUrl: result.url,
                startTime: 0,
                duration: duration,
                volume: 100,
                order: prev.length,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              
              const updated = [...prev, newTrack];
              console.log('✅ Audio track added to state:', newTrack);
              console.log('📊 Total audio tracks after add:', updated.length);
              
              // Force immediate save using refs to get latest values
              const currentSlides = slidesRef.current;
              const currentEditingData = editingDataRef.current;
              
              const totalDuration = Math.max(
                ...(currentSlides.length > 0 ? currentSlides.map(s => s.startTime + s.duration) : [0]),
                ...(updated.length > 0 ? updated.map(t => t.startTime + t.duration) : [0]),
                0
              );
              
              const updatedData: AVEditingData = {
                id: currentEditingData?.id || `av-editing-${episodeId}`,
                episodeId,
                slides: currentSlides,
                audioTracks: updated,
                totalDuration,
                createdAt: currentEditingData?.createdAt || new Date(),
                updatedAt: new Date(),
              };
              
              console.log('💾 Saving audio track data:', {
                audioTracksCount: updated.length,
                audioTracks: updated.map(t => ({ id: t.id, name: t.name, audioUrl: t.audioUrl })),
              });
              
              // Save immediately
              saveEditingData(updatedData).catch(err => {
                console.error('❌ Error saving audio track:', err);
              });
              
              return updated;
            });
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
    input.click();
  };

  const handleDeleteSlide = (slideId: string) => {
    setSlides(prev => prev.filter(s => s.id !== slideId));
  };

  const handleDeleteAudioTrack = (trackId: string) => {
    setAudioTracks(prev => prev.filter(t => t.id !== trackId));
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

  const handleSlideDurationChange = useCallback((slideId: string, newDuration: number) => {
    if (newDuration < MIN_DURATION) return;
    
    setSlides(prev => {
      const updated = prev.map(slide => {
        if (slide.id === slideId) {
          return {
            ...slide,
            duration: newDuration,
            updatedAt: new Date(),
          };
        }
        return slide;
      });
      
      // Handle collisions and trim overlapping slides
      const collided = handleCollisions(updated);
      return collided;
    });
  }, [handleCollisions]);


  const handleDragStart = (e: React.MouseEvent, slideId: string) => {
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
    
    setIsDragging(true);
    setDraggedSlideId(slideId);
    setDragStartX(e.clientX);
    
    const slide = slides.find(s => s.id === slideId);
    if (slide) {
      setDragStartTime(slide.startTime);
    }
    
    setSelectedSlide(slideId);
  };

  const handleSlideMove = useCallback((slideId: string, newStartTime: number) => {
    setSlides(prev => {
      const updated = prev.map(slide => {
        if (slide.id === slideId) {
          return {
            ...slide,
            startTime: Math.max(0, newStartTime),
            updatedAt: new Date(),
          };
        }
        return slide;
      });
      
      // Handle collisions and trim overlapping slides
      const collided = handleCollisions(updated);
      return collided;
    });
  }, [handleCollisions]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedSlideId) return;

    e.preventDefault();

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const deltaX = e.clientX - dragStartX;
    const deltaSeconds = deltaX / PIXELS_PER_SECOND;
    const newStartTime = Math.max(0, dragStartTime + deltaSeconds);

    handleSlideMove(draggedSlideId, newStartTime);
  }, [isDragging, draggedSlideId, dragStartX, dragStartTime, handleSlideMove]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDraggedSlideId(null);
  }, []);

  const handleResizeStart = (e: React.MouseEvent, slideId: string, handle: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent text selection
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
    
    setSelectedResizeHandle(handle);
    setSelectedSlide(slideId);
    setIsResizing(true);
    setResizeStartX(e.clientX);
    
    const slide = slides.find(s => s.id === slideId);
    if (slide) {
      setResizeStartDuration(slide.duration);
      setResizeStartTime(slide.startTime);
    }
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !selectedResizeHandle || !selectedSlide) return;

    e.preventDefault();
    e.stopPropagation();

    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const deltaX = e.clientX - resizeStartX;
    const deltaSeconds = deltaX / PIXELS_PER_SECOND;

    if (selectedResizeHandle === 'end') {
      const newDuration = Math.max(MIN_DURATION, resizeStartDuration + deltaSeconds);
      handleSlideDurationChange(selectedSlide, newDuration);
    } else if (selectedResizeHandle === 'start') {
      const newStartTime = Math.max(0, resizeStartTime + deltaSeconds);
      const newDuration = Math.max(MIN_DURATION, resizeStartDuration - deltaSeconds);
      
      if (newDuration >= MIN_DURATION) {
        setSlides(prev => {
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
          // Handle collisions after resize
          const collided = handleCollisions(updated);
          return collided;
        });
      }
    }
  }, [isResizing, selectedResizeHandle, selectedSlide, resizeStartX, resizeStartDuration, resizeStartTime, handleCollisions, handleSlideDurationChange]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setSelectedResizeHandle(null);
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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = Math.max(
    ...slides.map(s => s.startTime + s.duration),
    ...audioTracks.map(t => t.startTime + t.duration),
    0
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">AV Editing</h2>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              Total Duration: <span className="font-semibold">{formatTime(totalDuration)}</span>
            </div>
            <div className="flex items-center space-x-2">
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
            {slides.length > 0 ? (
              slides.map((slide) => (
                <div
                  key={slide.id}
                  className={`relative flex-shrink-0 border-2 rounded-lg overflow-hidden cursor-pointer transition-all ${
                    selectedSlide === slide.id
                      ? 'border-indigo-500 ring-2 ring-indigo-300'
                      : 'border-gray-300 hover:border-indigo-400'
                  }`}
                  style={{ width: '150px', height: '84px' }}
                  onClick={() => setSelectedSlide(slide.id)}
                >
                  <img
                    src={slide.imageUrl}
                    alt="Slide"
                    className="w-full h-full object-cover"
                  />
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
                <p>No slides yet. Add slides from AV script or upload new ones.</p>
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
                <button
                  onClick={handleAddAudioTrack}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Add Audio</span>
                </button>
              </div>
            </div>

            {/* Timeline Ruler */}
            <div className="relative mb-4" style={{ height: '30px' }}>
              <div className="absolute inset-0 border-b border-gray-300">
                {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute border-l border-gray-300"
                    style={{ left: `${i * PIXELS_PER_SECOND}px` }}
                  >
                    <div className="absolute top-0 text-xs text-gray-500 mt-1" style={{ transform: 'translateX(-50%)' }}>
                      {formatTime(i)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Slides Track */}
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-700 mb-2">Slides</div>
              <div
                ref={timelineRef}
                className="relative border border-gray-300 rounded-lg bg-gray-50"
                style={{ minHeight: '120px', height: '120px' }}
              >
                {slides.map((slide) => {
                  const left = slide.startTime * PIXELS_PER_SECOND;
                  const width = slide.duration * PIXELS_PER_SECOND;
                  const isDraggingThis = isDragging && draggedSlideId === slide.id;
                  
                  return (
                    <div
                      key={slide.id}
                      className={`absolute top-2 bottom-2 border-2 rounded ${
                        isDraggingThis
                          ? 'cursor-grabbing z-20 shadow-lg'
                          : 'cursor-grab'
                      } ${
                        selectedSlide === slide.id
                          ? 'border-indigo-500 bg-indigo-50 z-10'
                          : 'border-gray-400 bg-white hover:border-indigo-300'
                      }`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        minWidth: `${MIN_DURATION * PIXELS_PER_SECOND}px`,
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
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
                          setSelectedSlide(slide.id);
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
                        <img
                          src={slide.imageUrl}
                          alt="Slide"
                          className="max-w-full max-h-full object-contain rounded"
                          draggable={false}
                          style={{ userSelect: 'none', pointerEvents: 'none' }}
                        />
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
                
                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                  style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}
                >
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-8 border-t-red-500 border-l-transparent border-r-transparent" />
                </div>
              </div>
            </div>

            {/* Audio Tracks */}
            {audioTracks.map((track, trackIndex) => {
              const waveform = waveformDataRef.current.get(track.id) || [];
              const trackIsPlaying = isPlaying && currentTime >= track.startTime && currentTime < track.startTime + track.duration;
              const playheadPosition = trackIsPlaying ? ((currentTime - track.startTime) / track.duration) * 100 : 0;
              
              return (
                <div key={track.id} className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-700 flex items-center space-x-2">
                      <Volume2 className="w-4 h-4" />
                      <span>Audio Track {trackIndex + 1}: {track.name}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteAudioTrack(track.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative border border-gray-300 rounded-lg bg-gray-50 overflow-hidden" style={{ height: '80px' }}>
                    <div
                      className="absolute top-2 bottom-2 bg-green-500 bg-opacity-30 border border-green-600 rounded"
                      style={{
                        left: `${track.startTime * PIXELS_PER_SECOND}px`,
                        width: `${track.duration * PIXELS_PER_SECOND}px`,
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

