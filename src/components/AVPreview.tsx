'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Episode, AVScript, AVPreviewData, AVPreviewTrack, GlobalAsset, AVShot, AVSegment, AVPreviewClip } from '@/types';
import { Play, Pause, Save, Upload, Plus, Trash2, Volume2, VolumeX, Music, Mic, Image as ImageIcon, Film, SkipBack, GripVertical, Video, Loader2, Download, Edit3, GripVertical as DragHandle } from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import { useSessionStorageState } from '@/hooks/useSessionStorageState';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import JSZip from 'jszip';

interface AVPreviewProps {
  episodeId: string;
  avScript?: AVScript;
  avPreviewData?: AVPreviewData;
  onSave: (data: AVPreviewData, avScript?: AVScript) => void;
  globalAssets: GlobalAsset[];
}

interface VisualClip {
  id: string;
  shotId: string; // Original shot ID for reference
  startTime: number; // Timeline position (0-based for scene)
  duration: number; // Duration on timeline
  offset: number; // Start offset in source file (for trimming)
  type: 'video' | 'image' | 'placeholder';
  url?: string;
  label: string;
  shotNumber: string;
  take: string; // Take name from AV script
  segmentId: string;
  sourceDuration?: number; // Actual duration of the source video file (for videos only)
}

interface ClipEdit {
  duration: number;
  offset: number; // For video trimming
}

export function AVPreview({
  episodeId,
  avScript,
  avPreviewData,
  onSave,
  globalAssets
}: AVPreviewProps) {
  // Session-only persistence for the current episode (survives component switches, clears on tab close)
  const scriptSceneFilterKey = `concepto:av:scriptSceneFilter:${episodeId}`;
  const previewSelectedSegmentKey = `concepto:av:selectedSegmentId:${episodeId}`;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tracks, setTracks] = useState<AVPreviewTrack[]>(avPreviewData?.audioTracks || []);
  const [scale, setScale] = useState(20); // pixels per second
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [isExportingFCPXML, setIsExportingFCPXML] = useState(false);
  
  // Scene Selection - must select a scene, no "all"
  const [selectedSegmentId, setSelectedSegmentId] = useSessionStorageState<string>(
    previewSelectedSegmentKey,
    '',
    {
      serialize: (v) => v,
      deserialize: (raw) => raw,
    }
  );
  
  // Clip Edits - track duration and offset per shot
  const [clipEdits, setClipEdits] = useState<{[shotId: string]: ClipEdit}>({});
  
  // Video source durations - track actual video file durations
  const [videoDurations, setVideoDurations] = useState<{[url: string]: number}>({});
  
  // Audio waveform data - store waveform samples for each clip
  const [waveformData, setWaveformData] = useState<{[clipId: string]: number[]}>({});
  
  // Muted shots - track which video shots have muted audio
  const [mutedShots, setMutedShots] = useState<Set<string>>(new Set());
  
  // Resizing State - simpler approach
  const [resizeState, setResizeState] = useState<{
    clipId: string;
    shotId: string;
    edge: 'left' | 'right';
    startX: number;
    originalDuration: number;
    originalOffset: number;
    sourceDuration?: number; // Max duration for videos (actual video file length)
    clipType: 'video' | 'image' | 'placeholder';
    trackId?: string; // For audio clips
  } | null>(null);

  // Audio clip dragging state
  const [audioDragState, setAudioDragState] = useState<{
    clipId: string;
    trackId: string;
    startX: number;
    originalStartTime: number;
  } | null>(null);

  // Track renaming state
  const [editingTrackName, setEditingTrackName] = useState<string | null>(null);
  const [tempTrackName, setTempTrackName] = useState<string>('');

  // Audio source durations - track actual audio file durations
  const [audioDurations, setAudioDurations] = useState<{[url: string]: number}>({});

  // Volume editing state
  const [editingVolume, setEditingVolume] = useState<{
    clipId: string;
    trackId: string;
  } | null>(null);

  // Volume line dragging state
  const [volumeDragState, setVolumeDragState] = useState<{
    clipId: string;
    trackId: string;
    startY: number;
    startVolume: number;
  } | null>(null);

  // Auto-save debounce ref
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Delete track confirmation
  const [trackToDelete, setTrackToDelete] = useState<string | null>(null);

  // Delete clip confirmation
  const [clipToDelete, setClipToDelete] = useState<{trackId: string; clipId: string} | null>(null);

  // Compact mode toggle
  const [isCompactMode, setIsCompactMode] = useState(false);

  // Multi-select state for audio clips
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());
  const [multiDragState, setMultiDragState] = useState<{
    startX: number;
    originalStartTimes: {[clipId: string]: number};
  } | null>(null);

  // Video clip selection and drag state
  const [selectedVideoClips, setSelectedVideoClips] = useState<Set<string>>(new Set());
  const [videoDragState, setVideoDragState] = useState<{
    clipId: string;
    startX: number;
    originalStartTime: number;
  } | null>(null);
  const [videoMultiDragState, setVideoMultiDragState] = useState<{
    startX: number;
    originalStartTimes: {[clipId: string]: number};
  } | null>(null);
  // Store custom start times for video clips (overrides sequential calculation)
  const [videoClipStartTimes, setVideoClipStartTimes] = useState<{[clipId: string]: number}>({});

  // Track reordering state
  const [trackDragState, setTrackDragState] = useState<{
    trackId: string;
    startY: number;
    originalIndex: number;
  } | null>(null);

  // Undo/Redo history
  interface HistoryState {
    tracks: AVPreviewTrack[];
    clipEdits: {[shotId: string]: ClipEdit};
    videoClipStartTimes: {[clipId: string]: number};
  }
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef<{ history: HistoryState[]; index: number }>({ history: [], index: -1 });

  const timelineRef = useRef<HTMLDivElement>(null);
  const playStartTimeRef = useRef<number | null>(null);
  const playStartOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<{[key: string]: HTMLAudioElement}>({});
  const durationRef = useRef(0);
  const scaleRef = useRef(scale);
  const loadingWaveformsRef = useRef<Set<string>>(new Set());
  const ffmpegRef = useRef(new FFmpeg());
  const messageRef = useRef<HTMLParagraphElement>(null);
  
  const { uploadFile } = useS3Upload();

  // Initialize selected segment to saved scene (session) or first scene if available
  useEffect(() => {
    if (!avScript || avScript.segments.length === 0) return;

    const isValid =
      selectedSegmentId &&
      selectedSegmentId !== 'all' &&
      avScript.segments.some(s => s.id === selectedSegmentId);

    if (!isValid) {
      const first = avScript.segments[0].id;
      setSelectedSegmentId(first);
    }
  }, [avScript, selectedSegmentId, setSelectedSegmentId]);

  // Initialize tracks if empty
  useEffect(() => {
    if (tracks.length === 0) {
      const initialTracks: AVPreviewTrack[] = [
        { id: 'track-voice', name: 'Voice Over', type: 'audio' as const, clips: [] },
        { id: 'track-sfx', name: 'Sound Effects', type: 'sfx' as const, clips: [] },
        { id: 'track-music', name: 'Music', type: 'music' as const, clips: [] },
      ];
      setTracks(initialTracks);
      // Initialize history with initial state
      const initialState: HistoryState = {
        tracks: JSON.parse(JSON.stringify(initialTracks)),
        clipEdits: {},
        videoClipStartTimes: {}
      };
      setHistory([initialState]);
      setHistoryIndex(0);
      historyRef.current = { history: [initialState], index: 0 };
    }
  }, []);

  // Initialize history with current state on mount
  useEffect(() => {
    if (history.length === 0 && tracks.length > 0) {
      const initialState: HistoryState = {
        tracks: JSON.parse(JSON.stringify(tracks)),
        clipEdits: JSON.parse(JSON.stringify(clipEdits)),
        videoClipStartTimes: JSON.parse(JSON.stringify(videoClipStartTimes))
      };
      setHistory([initialState]);
      setHistoryIndex(0);
      historyRef.current = { history: [initialState], index: 0 };
    }
  }, []);

  // Create stable list of clip IDs for dependency tracking
  const clipIds = useMemo(() => {
    return tracks.flatMap(track => track.clips.map(clip => clip.id)).sort().join(',');
  }, [tracks]);
  
  // Load waveform data for existing clips
  useEffect(() => {
    const loadWaveforms = async () => {
      const clipsToLoad: {clipId: string, url: string}[] = [];
      
      // Collect all clips from all tracks
      const allClips = tracks.flatMap(track => 
        track.clips.map(clip => ({ clipId: clip.id, url: clip.url }))
      );
      
      for (const { clipId, url } of allClips) {
        if (url && !waveformData[clipId] && !loadingWaveformsRef.current.has(clipId)) {
          clipsToLoad.push({ clipId, url });
          loadingWaveformsRef.current.add(clipId);
        }
      }
      
      // Load waveforms for all clips that need them
      if (clipsToLoad.length > 0) {
        const waveformPromises = clipsToLoad.map(async ({ clipId, url }) => {
          try {
            const waveform = await generateWaveform(url, clipId);
            setWaveformData(prev => ({ ...prev, [clipId]: waveform }));
          } catch (error) {
            console.error(`Failed to load waveform for clip ${clipId}:`, error);
          } finally {
            loadingWaveformsRef.current.delete(clipId);
          }
        });
        
        await Promise.all(waveformPromises);
      }
    };
    
    loadWaveforms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipIds]);

  // Initialize clip edits from AV Script
  useEffect(() => {
    if (avScript) {
      const edits: {[shotId: string]: ClipEdit} = {};
      avScript.segments.forEach(seg => {
        seg.shots.forEach(shot => {
          edits[shot.id] = {
            duration: shot.duration || 3,
            offset: shot.videoOffset || 0 // Initialize from saved offset
          };
        });
      });
      setClipEdits(prev => {
        // Merge with existing edits to preserve user changes
        return { ...edits, ...prev };
      });
    }
  }, [avScript]);

  // Load video durations
  useEffect(() => {
    if (!avScript) return;
    
    const loadVideoDurations = async () => {
      const durations: {[url: string]: number} = {};
      const videoUrls = new Set<string>();
      
      // Collect all unique video URLs
      avScript.segments.forEach(seg => {
        seg.shots.forEach(shot => {
          if (shot.videoUrl) {
            videoUrls.add(shot.videoUrl);
          }
        });
      });
      
      // Load duration for each video
      const promises = Array.from(videoUrls).map(url => {
        return new Promise<void>((resolve) => {
          // Skip if we already have this duration
          if (videoDurations[url]) {
            resolve();
            return;
          }
          
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => {
            durations[url] = video.duration;
            resolve();
          };
          video.onerror = () => {
            // If we can't load metadata, set a default or skip
            console.warn(`Could not load duration for video: ${url}`);
            resolve();
          };
          video.src = url;
        });
      });
      
      await Promise.all(promises);
      
      if (Object.keys(durations).length > 0) {
        setVideoDurations(prev => ({ ...prev, ...durations }));
      }
    };
    
    loadVideoDurations();
  }, [avScript]);

  // Sync duration ref
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Sync scale ref
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Build visual playlist for selected scene only (starts at 0:00)
  const { playlist: visualPlaylist, totalDuration } = useMemo(() => {
    if (!avScript || !selectedSegmentId) return { playlist: [], totalDuration: 0 };
    
    const segment = avScript.segments.find(s => s.id === selectedSegmentId);
    if (!segment) return { playlist: [], totalDuration: 0 };
    
    let currentStartTime = 0;
    const playlist: VisualClip[] = [];

    segment.shots.forEach((shot, index) => {
      const edit = clipEdits[shot.id] || { duration: shot.duration || 3, offset: 0 };
      const shotDuration = edit.duration;
      
      let type: 'video' | 'image' | 'placeholder' = 'placeholder';
      let url: string | undefined = undefined;

      if (shot.videoUrl) {
        type = 'video';
        url = shot.videoUrl;
      } else if (shot.imageUrl) {
        type = 'image';
        url = shot.imageUrl;
      }

      // Get source duration for videos
      const sourceDuration = type === 'video' && url ? videoDurations[url] : undefined;

      // Use unique key: segmentId-shotId-index to avoid duplicates
      const clipId = `${segment.id}-${shot.id}-${index}`;
      const customStartTime = videoClipStartTimes[clipId];
      // Use custom start time if available, otherwise use sequential positioning
      const clipStartTime = customStartTime !== undefined ? customStartTime : currentStartTime;
      
      playlist.push({
        id: clipId, // Unique key
        shotId: shot.id,
        startTime: clipStartTime,
        duration: shotDuration,
        offset: edit.offset,
        type,
        url,
        label: shot.visual,
        shotNumber: `${segment.segmentNumber}.${shot.shotNumber}`,
        take: shot.take || `${segment.segmentNumber}.${shot.shotNumber}`, // Use take name from AV script
        segmentId: segment.id,
        sourceDuration
      });

      // Always increment for sequential positioning (used as fallback for clips without custom positions)
      currentStartTime += shotDuration;
    });

    // Calculate total duration based on all clips (including custom positioned ones)
    const allEndTimes = playlist.map(clip => clip.startTime + clip.duration);
    const maxEndTime = allEndTimes.length > 0 ? Math.max(...allEndTimes) : currentStartTime;

    return { playlist, totalDuration: maxEndTime };
  }, [avScript, selectedSegmentId, clipEdits, videoDurations, videoClipStartTimes]);

  // Update global duration state
  useEffect(() => {
    setDuration(totalDuration);
  }, [totalDuration]);

  // Current visual clip based on time
  const currentVisualClip = useMemo(() => {
    return visualPlaylist.find(
      clip => currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
    );
  }, [currentTime, visualPlaylist]);

  // Playback Loop
  const updatePlayback = useCallback(() => {
    if (playStartTimeRef.current === null) return;

    const now = performance.now();
    const elapsed = (now - playStartTimeRef.current) / 1000;
    const newTime = playStartOffsetRef.current + elapsed;

    if (newTime >= durationRef.current) {
      setIsPlaying(false);
      setCurrentTime(durationRef.current);
      playStartTimeRef.current = null;
      return;
    }

    setCurrentTime(newTime);
    rafRef.current = requestAnimationFrame(updatePlayback);
  }, []); 

  useEffect(() => {
    if (isPlaying) {
      playStartTimeRef.current = performance.now();
      playStartOffsetRef.current = currentTime;
      rafRef.current = requestAnimationFrame(updatePlayback);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      playStartTimeRef.current = null;
    }
    
    return () => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
        }
    };
  }, [isPlaying, updatePlayback]);

  // Sync Media Elements
  useEffect(() => {
    // Sync Video with offset support
    if (videoRef.current && currentVisualClip?.type === 'video' && currentVisualClip.url) {
      const video = videoRef.current;
      // Calculate time in clip accounting for offset
      const timeInClip = currentTime - currentVisualClip.startTime;
      const sourceTime = currentVisualClip.offset + timeInClip;
      
      // Check if this shot is muted
      const isMuted = mutedShots.has(currentVisualClip.shotId);
      video.muted = isMuted;
      
      if (video.src !== currentVisualClip.url) {
        video.src = currentVisualClip.url;
        video.load();
      }
      
      if (Math.abs(video.currentTime - sourceTime) > 0.3) {
        video.currentTime = sourceTime;
      }

      if (isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!isPlaying && !video.paused) {
        video.pause();
      }
    } else if (videoRef.current) {
       videoRef.current.pause();
    }

    // Sync Audio Tracks
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        const audioKey = `${track.id}-${clip.id}`;
        let audio = audioRefs.current[audioKey];
        
        if (!audio) {
          audio = new Audio(clip.url);
          audioRefs.current[audioKey] = audio;
        }

        const clipEndTime = clip.startTime + clip.duration;
        const isWithinClip = currentTime >= clip.startTime && currentTime < clipEndTime;

        if (isWithinClip && isPlaying && !track.isMuted) {
          const timeInClip = currentTime - clip.startTime + clip.offset;
          
          if (Math.abs(audio.currentTime - timeInClip) > 0.3) {
            audio.currentTime = timeInClip;
          }
          
          audio.volume = (clip.volume ?? 1) * (track.volume ?? 1);
          
          if (audio.paused) {
            audio.play().catch(e => console.warn("Audio play failed", e));
          }
        } else {
          if (!audio.paused) {
            audio.pause();
          }
        }
      });
    });

  }, [currentTime, isPlaying, currentVisualClip, tracks, mutedShots]);

  // Handlers
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't seek if we're resizing or if the click is on a clip
    if (resizeState) return;
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    if ((e.target as HTMLElement).closest('[data-clip-container]')) return;
    
    // Ctrl/Cmd+click on empty timeline area deselects all (industry standard)
    if (e.ctrlKey || e.metaKey) {
      setSelectedVideoClips(new Set());
      setSelectedClips(new Set());
      return;
    }
    
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 192; 
    const time = Math.max(0, Math.min(duration, x / scale));
    setCurrentTime(time);
    if (isPlaying) {
      playStartOffsetRef.current = time;
      playStartTimeRef.current = performance.now();
    }
    
    // Click on empty timeline clears selection
    setSelectedVideoClips(new Set());
    setSelectedClips(new Set());
  };

  const handlePlayFromBeginning = () => {
    setCurrentTime(0);
    if (isPlaying) {
        playStartOffsetRef.current = 0;
        playStartTimeRef.current = performance.now();
    }
  };

  // Generate waveform data from audio file
  const generateWaveform = async (audioUrl: string, clipId: string, samples: number = 200): Promise<number[]> => {
    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      // Handle both standard AudioContext and webkitAudioContext for browser compatibility
      let audioContext: AudioContext;
      if (window.AudioContext) {
        audioContext = new window.AudioContext();
      } else {
        const WebKitAudioContext = (window as typeof window & { webkitAudioContext: new () => AudioContext }).webkitAudioContext;
        if (!WebKitAudioContext) {
          throw new Error('AudioContext is not supported in this browser');
        }
        audioContext = new WebKitAudioContext();
      }
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const rawData = audioBuffer.getChannelData(0); // Get first channel
      const blockSize = Math.floor(rawData.length / samples);
      const waveform: number[] = [];
      
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[i * blockSize + j]);
        }
        waveform.push(sum / blockSize);
      }
      
      // Normalize to 0-1 range
      const max = Math.max(...waveform);
      return waveform.map(val => max > 0 ? val / max : 0);
    } catch (error) {
      console.error('Failed to generate waveform:', error);
      // Return empty waveform on error
      return Array(samples).fill(0);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, trackId: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    try {
        const result = await uploadFile(file, `audio-clips/${episodeId}/${Date.now()}-${file.name}`);
        if (result) {
            const audio = new Audio(result.url);
            await new Promise(resolve => {
                audio.addEventListener('loadedmetadata', resolve);
                audio.addEventListener('error', resolve); 
            });

            const audioDuration = audio.duration || 5;
            const clipId = `clip-${Date.now()}`;
            const newClip: AVPreviewClip = {
                id: clipId,
                name: file.name,
                url: result.url,
                startTime: currentTime,
                duration: audioDuration,
                offset: 0,
                volume: 1
            };

            // Store audio duration
            setAudioDurations(prev => ({ ...prev, [result.url]: audioDuration }));

            setTracks(prev => prev.map(t => {
                if (t.id === trackId) {
                    return { ...t, clips: [...t.clips, newClip] };
                }
                return t;
            }));

            // Generate waveform data for the new clip
            const waveform = await generateWaveform(result.url, clipId);
            setWaveformData(prev => ({ ...prev, [clipId]: waveform }));
            triggerAutoSave();
        }
    } catch (error) {
        console.error("Upload failed", error);
    }
  };

  // Auto-save function (debounced) - defined early so it can be used by handlers
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      if (!avScript) {
        console.warn('No AV Script to save');
        return;
      }

      // Construct updated AV Script with new durations and offsets
      const updatedAvScript = {
        ...avScript,
        segments: avScript.segments.map(seg => ({
          ...seg,
          shots: seg.shots.map(shot => {
            const edit = clipEdits[shot.id];
            const newDuration = edit?.duration ?? shot.duration;
            const newOffset = edit?.offset ?? shot.videoOffset ?? 0;
            return {
              ...shot,
              duration: newDuration,
              videoOffset: newOffset
            };
          })
        })),
        updatedAt: new Date()
      };

      const avPreviewData: AVPreviewData = {
        audioTracks: tracks
      };

      onSave(avPreviewData, updatedAvScript);
    }, 1000); // Auto-save after 1 second of inactivity
  }, [tracks, clipEdits, avScript, onSave]);

  const handleRemoveClip = (trackId: string, clipId: string) => {
      setClipToDelete({ trackId, clipId });
  };

  const confirmDeleteClip = () => {
      if (!clipToDelete) return;
      
      saveToHistory(); // Save to history before removal
      setTracks(prev => prev.map(t => {
          if (t.id === clipToDelete.trackId) {
              return { ...t, clips: t.clips.filter(c => c.id !== clipToDelete.clipId) };
          }
          return t;
      }));
      // Clean up waveform data
      setWaveformData(prev => {
          const { [clipToDelete.clipId]: removed, ...rest } = prev;
          return rest;
      });
      // Remove from selection if selected
      setSelectedClips(prev => {
          const newSet = new Set(prev);
          newSet.delete(clipToDelete.clipId);
          return newSet;
      });
      triggerAutoSave();
      setClipToDelete(null);
  };

  const cancelDeleteClip = () => {
      setClipToDelete(null);
  };

  // Toggle mute for a video shot
  const handleToggleMute = (shotId: string) => {
      setMutedShots(prev => {
          const newSet = new Set(prev);
          if (newSet.has(shotId)) {
              newSet.delete(shotId);
          } else {
              newSet.add(shotId);
          }
          return newSet;
      });
  };

  // Create new audio track
  const handleAddTrack = () => {
    saveToHistory(); // Save to history before adding
    const newTrack: AVPreviewTrack = {
      id: `track-${Date.now()}`,
      name: `Track ${tracks.length + 1}`,
      type: 'audio',
      clips: [],
      volume: 1
    };
    setTracks(prev => [...prev, newTrack]);
    triggerAutoSave();
  };

  // Start renaming track
  const handleStartRenameTrack = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      setEditingTrackName(trackId);
      setTempTrackName(track.name);
    }
  };

  // Save track name
  const handleSaveTrackName = (trackId: string) => {
    if (tempTrackName.trim()) {
      setTracks(prev => prev.map(t => 
        t.id === trackId ? { ...t, name: tempTrackName.trim() } : t
      ));
      triggerAutoSave();
    }
    setEditingTrackName(null);
    setTempTrackName('');
  };

  // Cancel track name edit
  const handleCancelTrackName = () => {
    setEditingTrackName(null);
    setTempTrackName('');
  };

  // Delete track
  const handleDeleteTrack = (trackId: string) => {
    setTrackToDelete(trackId);
  };

  const confirmDeleteTrack = () => {
    if (trackToDelete) {
      const trackToDeleteData = tracks.find(t => t.id === trackToDelete);
      if (trackToDeleteData) {
        // Save to history before deletion
        saveToHistory();
        setTracks(prev => prev.filter(t => t.id !== trackToDelete));
        triggerAutoSave();
      }
      setTrackToDelete(null);
    }
  };

  const cancelDeleteTrack = () => {
    setTrackToDelete(null);
  };

  // Save current state to history
  const saveToHistory = useCallback(() => {
    // Access current state via refs/state
    const currentState: HistoryState = {
      tracks: JSON.parse(JSON.stringify(tracks)), // Deep clone
      clipEdits: JSON.parse(JSON.stringify(clipEdits)), // Deep clone
      videoClipStartTimes: JSON.parse(JSON.stringify(videoClipStartTimes)) // Deep clone
    };
    
    setHistory(prev => {
      const currentIndex = historyRef.current.index;
      const newHistory = prev.slice(0, currentIndex + 1);
      newHistory.push(currentState);
      // Limit history to 50 states
      const finalIndex = newHistory.length - 1;
      if (newHistory.length > 50) {
        newHistory.shift();
        setHistoryIndex(finalIndex - 1);
        historyRef.current = { history: newHistory, index: finalIndex - 1 };
      } else {
        setHistoryIndex(finalIndex);
        historyRef.current = { history: newHistory, index: finalIndex };
      }
      return newHistory;
    });
      }, [tracks, clipEdits, videoClipStartTimes]);

  // Undo
  const handleUndo = useCallback(() => {
    const currentHistory = historyRef.current.history;
    const currentIndex = historyRef.current.index;
    if (currentIndex > 0 && currentHistory.length > 0) {
      const newIndex = currentIndex - 1;
      const previousState = currentHistory[newIndex];
      if (previousState) {
        setTracks(previousState.tracks);
        setClipEdits(previousState.clipEdits);
        setVideoClipStartTimes(previousState.videoClipStartTimes || {});
        setHistoryIndex(newIndex);
        historyRef.current.index = newIndex;
        triggerAutoSave();
      }
    }
  }, [triggerAutoSave]);

  // Redo
  const handleRedo = useCallback(() => {
    const currentHistory = historyRef.current.history;
    const currentIndex = historyRef.current.index;
    if (currentIndex < currentHistory.length - 1 && currentHistory.length > 0) {
      const newIndex = currentIndex + 1;
      const nextState = currentHistory[newIndex];
      if (nextState) {
        setTracks(nextState.tracks);
        setClipEdits(nextState.clipEdits);
        setVideoClipStartTimes(nextState.videoClipStartTimes || {});
        setHistoryIndex(newIndex);
        historyRef.current.index = newIndex;
        triggerAutoSave();
      }
    }
  }, [triggerAutoSave]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
      // Escape to clear selection
      if (e.key === 'Escape' && selectedClips.size > 0) {
        setSelectedClips(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedClips]);

  // Start dragging audio clip
  const handleAudioClipMouseDown = (e: React.MouseEvent, clip: AVPreviewClip, trackId: string) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent default to avoid focus issues
    
    // Don't handle if clicking on volume line (it has its own handler)
    if ((e.target as HTMLElement).closest('[data-volume-line]')) {
      return;
    }
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const timelineRect = timelineRef.current?.getBoundingClientRect();
    if (!timelineRect) return;

    const offsetX = e.clientX - rect.left;
    const edgeThreshold = 8; // pixels from edge
    
    // Check if clicking on left edge - adjust start/offset
    if (offsetX < edgeThreshold) {
      const sourceDuration = audioDurations[clip.url] || clip.duration;
      setResizeState({
        clipId: clip.id,
        shotId: clip.id,
        edge: 'left',
        startX: e.clientX,
        originalDuration: clip.duration,
        originalOffset: clip.offset,
        sourceDuration,
        clipType: 'video', // Use video type for audio to enable trimming
        trackId
      });
      return;
    }
    
    // Check if clicking on right edge - trim ending
    if (offsetX > rect.width - edgeThreshold) {
      const sourceDuration = audioDurations[clip.url] || clip.duration;
      setResizeState({
        clipId: clip.id,
        shotId: clip.id,
        edge: 'right',
        startX: e.clientX,
        originalDuration: clip.duration,
        originalOffset: clip.offset,
        sourceDuration,
        clipType: 'video',
        trackId
      });
      return;
    }

    // Otherwise, drag the entire clip
    // Check if we have mixed selections (both video and audio clips selected)
    const hasVideoSelection = selectedVideoClips.size > 0;
    const hasAudioSelection = selectedClips.size > 0;
    const hasMixedSelection = hasVideoSelection && hasAudioSelection;
    
    if (hasMixedSelection) {
      // Prepare for mixed drag
      const videoOriginalStartTimes: {[clipId: string]: number} = {};
      const audioOriginalStartTimes: {[clipId: string]: number} = {};
      
      visualPlaylist.forEach(c => {
        if (selectedVideoClips.has(c.id)) {
          videoOriginalStartTimes[c.id] = c.startTime;
        }
      });
      
      tracks.forEach(t => {
        t.clips.forEach(c => {
          if (selectedClips.has(c.id)) {
            audioOriginalStartTimes[c.id] = c.startTime;
          }
        });
      });
      
      // Set up for mixed drag - both handlers will be active
      // Video handler will track video clips, audio handler will track audio clips
      setVideoMultiDragState({
        startX: e.clientX,
        originalStartTimes: videoOriginalStartTimes
      });
      
      // Also set up audio multi-drag
      setMultiDragState({
        startX: e.clientX,
        originalStartTimes: audioOriginalStartTimes
      });
      
      // Set video drag state to activate video handler
      const firstVideoClip = visualPlaylist.find(c => selectedVideoClips.has(c.id));
      if (firstVideoClip) {
        setVideoDragState({
          clipId: firstVideoClip.id,
          startX: e.clientX,
          originalStartTime: firstVideoClip.startTime
        });
      }
      
      setAudioDragState({
        clipId: clip.id,
        trackId,
        startX: e.clientX,
        originalStartTime: clip.startTime
      });
      
      // Prevent text selection and set cursor
      (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
      return;
    }
    
    // If multiple audio clips are selected, prepare to move them all
    if (selectedClips.size > 1 && selectedClips.has(clip.id)) {
      const originalStartTimes: {[clipId: string]: number} = {};
      tracks.forEach(t => {
        t.clips.forEach(c => {
          if (selectedClips.has(c.id)) {
            originalStartTimes[c.id] = c.startTime;
          }
        });
      });
      setMultiDragState({
        startX: e.clientX,
        originalStartTimes
      });
    }
    
    // Prevent text selection and set cursor
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
    
    setAudioDragState({
      clipId: clip.id,
      trackId,
      startX: e.clientX,
      originalStartTime: clip.startTime
    });
  };

  // Audio clip dragging handler
  const audioDragStateRef = useRef(audioDragState);
  useEffect(() => {
    audioDragStateRef.current = audioDragState;
  }, [audioDragState]);

  useEffect(() => {
    if (!audioDragState) {
      return;
    }

    // Prevent text selection and improve drag smoothness
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    
    const currentDragState = audioDragStateRef.current;
    if (!currentDragState) return;

    // Get all clip DOM elements that need to be moved
    const clipElements = new Map<string, HTMLElement>();
    const currentMultiDrag = multiDragState;
    
    if (selectedClips.size > 1 && selectedClips.has(currentDragState.clipId) && currentMultiDrag) {
      // Multi-select: get all selected clip elements
      selectedClips.forEach(clipId => {
        const el = document.querySelector(`[data-clip-id="${clipId}"]`) as HTMLElement;
        if (el) {
          clipElements.set(clipId, el);
          el.style.willChange = 'transform';
          el.style.zIndex = '100';
        }
      });
    } else {
      // Single clip: get just this clip element
      const el = document.querySelector(`[data-clip-id="${currentDragState.clipId}"]`) as HTMLElement;
      if (el) {
        clipElements.set(currentDragState.clipId, el);
        el.style.willChange = 'transform';
        el.style.zIndex = '100';
      }
    }

    // Store original left positions (from computed styles, not getBoundingClientRect for better performance)
    const originalLeftPositions = new Map<string, number>();
    clipElements.forEach((el, clipId) => {
      const computedStyle = window.getComputedStyle(el);
      const left = parseFloat(computedStyle.left) || 0;
      originalLeftPositions.set(clipId, left);
    });

    // Store drag positions in refs (not state) to avoid React re-renders during drag
    const dragPositions = new Map<string, number>();

    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentDragState = audioDragStateRef.current;
      if (!currentDragState) return;
      
      const deltaX = e.clientX - currentDragState.startX;
      const deltaTime = deltaX / scaleRef.current;
      const newStartTime = Math.max(0, currentDragState.originalStartTime + deltaTime);

      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use RAF for smooth visual updates - NO React state updates during drag
      rafId = requestAnimationFrame(() => {
        const hasMixedSelection = selectedVideoClips.size > 0 && selectedClips.size > 0;
        const deltaTimeForAll = newStartTime - currentDragState.originalStartTime;
        
        // Move audio clips
        if ((selectedClips.size > 1 || hasMixedSelection) && selectedClips.has(currentDragState.clipId) && currentMultiDrag) {
          clipElements.forEach((el, clipId) => {
            if (selectedClips.has(clipId)) {
              const originalTime = currentMultiDrag.originalStartTimes[clipId] ?? 0;
              const newTime = Math.max(0, originalTime + deltaTimeForAll);
              const newLeftPx = newTime * scaleRef.current;
              const originalLeft = originalLeftPositions.get(clipId) || 0;
              const translateX = newLeftPx - originalLeft;
              el.style.transform = `translateX(${translateX}px)`;
              dragPositions.set(clipId, newTime);
            }
          });
        } else {
          const el = clipElements.get(currentDragState.clipId);
          if (el) {
            const newLeftPx = newStartTime * scaleRef.current;
            const originalLeft = originalLeftPositions.get(currentDragState.clipId) || 0;
            const translateX = newLeftPx - originalLeft;
            el.style.transform = `translateX(${translateX}px)`;
            dragPositions.set(currentDragState.clipId, newStartTime);
          }
        }
        
        // If mixed selection, also move video clips using the same delta
        if (hasMixedSelection && videoMultiDragState) {
          selectedVideoClips.forEach(clipId => {
            const el = document.querySelector(`[data-clip-id="${clipId}"]`) as HTMLElement;
            if (el && videoMultiDragState.originalStartTimes[clipId] !== undefined) {
              const originalTime = videoMultiDragState.originalStartTimes[clipId];
              const newTime = Math.max(0, originalTime + deltaTimeForAll);
              const newLeftPx = newTime * scaleRef.current;
              const computedStyle = window.getComputedStyle(el);
              const originalLeft = parseFloat(computedStyle.left) || 0;
              const translateX = newLeftPx - originalLeft;
              el.style.transform = `translateX(${translateX}px)`;
              el.style.willChange = 'transform';
              el.style.zIndex = '100';
            }
          });
        }
        
        rafId = null;
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      // Only NOW update React state with final positions
      const currentDragState = audioDragStateRef.current;
      if (!currentDragState) return;

      const hasMixedSelection = selectedVideoClips.size > 0 && selectedClips.size > 0;
      const deltaX = e.clientX - currentDragState.startX;
      const deltaTime = deltaX / scaleRef.current;
      const newStartTime = Math.max(0, currentDragState.originalStartTime + deltaTime);
      const deltaTimeForAll = newStartTime - currentDragState.originalStartTime;

      if ((selectedClips.size > 1 || hasMixedSelection) && selectedClips.has(currentDragState.clipId) && currentMultiDrag) {
        // Use dragPositions map if available, otherwise calculate
        setTracks(prev => prev.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (selectedClips.has(c.id)) {
              const finalTime = dragPositions.get(c.id) ?? (currentMultiDrag.originalStartTimes[c.id] ?? c.startTime) + deltaTimeForAll;
              return { ...c, startTime: Math.max(0, finalTime) };
            }
            return c;
          })
        })));
      } else {
        const finalTime = dragPositions.get(currentDragState.clipId);
        if (finalTime !== undefined) {
          setTracks(prev => prev.map(t =>
            t.id === currentDragState.trackId ? {
              ...t,
              clips: t.clips.map(c =>
                c.id === currentDragState.clipId ? { ...c, startTime: finalTime } : c
              )
            } : t
          ));
        }
      }
      
      // If mixed selection, also update video clip positions
      if (hasMixedSelection && videoMultiDragState) {
        setVideoClipStartTimes(prev => {
          const updated = { ...prev };
          selectedVideoClips.forEach(clipId => {
            const finalTime = dragPositions.get(clipId);
            if (finalTime !== undefined) {
              updated[clipId] = finalTime;
            } else if (videoMultiDragState.originalStartTimes[clipId] !== undefined) {
              updated[clipId] = Math.max(0, videoMultiDragState.originalStartTimes[clipId] + deltaTimeForAll);
            }
          });
          return updated;
        });
      }

      // Remove transforms and restore styles
      clipElements.forEach(el => {
        el.style.transform = '';
        el.style.willChange = '';
        el.style.zIndex = '';
      });
      
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      setAudioDragState(null);
      setMultiDragState(null);
      saveToHistory(); // Save to history when drag ends
      triggerAutoSave(); // Auto-save when drag ends
    };

    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    document.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
      clipElements.forEach(el => {
        el.style.transform = '';
        el.style.willChange = '';
        el.style.zIndex = '';
      });
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [audioDragState, selectedClips, multiDragState, triggerAutoSave, saveToHistory]);

  // Track reordering handler
  const trackDragStateRef = useRef(trackDragState);
  useEffect(() => {
    trackDragStateRef.current = trackDragState;
  }, [trackDragState]);

  useEffect(() => {
    if (!trackDragState) {
      return;
    }

    // Prevent text selection during track drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    
    const trackHeight = isCompactMode ? 40 : 96;
    let finalIndex = trackDragState.originalIndex;
    let rafId: number | null = null;

    // Get all track elements and store their original positions
    const trackElements = new Map<number, HTMLElement>();
    tracks.forEach((track, index) => {
      const el = document.querySelector(`[data-track-id="${track.id}"]`) as HTMLElement;
      if (el) {
        trackElements.set(index, el);
        el.style.willChange = 'transform';
        el.style.transition = 'none'; // Disable transitions during drag for smoothness
      }
    });

    // Get the dragged track element
    const draggedTrackEl = trackElements.get(trackDragState.originalIndex);
    if (!draggedTrackEl) {
      console.warn('Track element not found for drag:', trackDragState.trackId);
      // Restore and exit early if element not found
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      setTrackDragState(null);
      return;
    }

    draggedTrackEl.style.zIndex = '100';
    draggedTrackEl.style.opacity = '0.9';

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentDragState = trackDragStateRef.current;
      if (!currentDragState) return;

      const deltaY = e.clientY - currentDragState.startY;
      const newIndex = Math.round(currentDragState.originalIndex + (deltaY / trackHeight));
      const clampedIndex = Math.max(0, Math.min(tracks.length - 1, newIndex));
      finalIndex = clampedIndex;

      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use RAF for smooth visual updates - show all tracks moving
      rafId = requestAnimationFrame(() => {
        // Calculate the visual index each track should be at
        const draggedFromIndex = currentDragState.originalIndex;
        const draggedToIndex = clampedIndex;

        trackElements.forEach((el, originalIndex) => {
          let visualIndex = originalIndex;

          if (originalIndex === draggedFromIndex) {
            // The dragged track goes to the target position
            visualIndex = draggedToIndex;
          } else if (draggedFromIndex < draggedToIndex) {
            // Dragging down: tracks between from and to shift up
            if (originalIndex > draggedFromIndex && originalIndex <= draggedToIndex) {
              visualIndex = originalIndex - 1;
            }
          } else if (draggedFromIndex > draggedToIndex) {
            // Dragging up: tracks between to and from shift down
            if (originalIndex >= draggedToIndex && originalIndex < draggedFromIndex) {
              visualIndex = originalIndex + 1;
            }
          }

          // Calculate transform based on visual position
          const targetY = visualIndex * trackHeight;
          const originalY = originalIndex * trackHeight;
          const translateY = targetY - originalY;

          el.style.transform = `translateY(${translateY}px)`;
        });

        rafId = null;
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      // Only NOW update React state with final position
      const currentDragState = trackDragStateRef.current;
      if (currentDragState && finalIndex !== currentDragState.originalIndex) {
        setTracks(prev => {
          const newTracks = [...prev];
          const [movedTrack] = newTracks.splice(currentDragState.originalIndex, 1);
          newTracks.splice(finalIndex, 0, movedTrack);
          return newTracks;
        });
      }

      // Remove transforms and restore styles for all tracks
      trackElements.forEach((el) => {
        el.style.transform = '';
        el.style.willChange = '';
        el.style.transition = ''; // Re-enable transitions
        el.style.zIndex = '';
        el.style.opacity = '';
      });
      
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      setTrackDragState(null);
      saveToHistory(); // Save to history when reorder ends
      triggerAutoSave(); // Auto-save when reorder ends
    };

    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    document.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
      // Clean up all track elements
      trackElements.forEach((el) => {
        el.style.transform = '';
        el.style.willChange = '';
        el.style.transition = '';
        el.style.zIndex = '';
        el.style.opacity = '';
      });
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [trackDragState, isCompactMode, tracks.length, triggerAutoSave, saveToHistory]);

  // Video clip drag handler with collision detection
  const videoDragStateRef = useRef(videoDragState);
  useEffect(() => {
    videoDragStateRef.current = videoDragState;
  }, [videoDragState]);

  useEffect(() => {
    if (!videoDragState) {
      return;
    }

    // Prevent text selection during video drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const currentDragState = videoDragState;
    const currentMultiDrag = videoMultiDragState;
    const currentAudioMultiDrag = multiDragState;
    const hasMixedSelection = selectedVideoClips.size > 0 && selectedClips.size > 0;

    // Get all video clip DOM elements that need to be moved
    const clipElements = new Map<string, HTMLElement>();
    
    // Helper to find clip element by ID using data-clip-id attribute
    const findClipElement = (clipId: string): HTMLElement | null => {
      return document.querySelector(`[data-clip-id="${clipId}"]`) as HTMLElement | null;
    };
    
    if ((selectedVideoClips.size > 1 || hasMixedSelection) && selectedVideoClips.has(currentDragState.clipId) && currentMultiDrag) {
      // Multi-select or mixed-select: get all selected clip elements
      selectedVideoClips.forEach(clipId => {
        const el = findClipElement(clipId);
        if (el) {
          clipElements.set(clipId, el);
          el.style.willChange = 'transform';
          el.style.zIndex = '100';
        }
      });
    } else {
      // Single clip: get just this clip element
      const el = findClipElement(currentDragState.clipId);
      if (el) {
        clipElements.set(currentDragState.clipId, el);
        el.style.willChange = 'transform';
        el.style.zIndex = '100';
      }
    }

    // Store original left positions (from computed styles, not getBoundingClientRect for better performance)
    const originalLeftPositions = new Map<string, number>();
    clipElements.forEach((el, clipId) => {
      const computedStyle = window.getComputedStyle(el);
      const left = parseFloat(computedStyle.left) || 0;
      originalLeftPositions.set(clipId, left);
    });

    // Helper function to find all connected clips (no gaps) to the right of a clip ONLY
    // This ensures clips to the left are detached when dragging
    const findConnectedClips = (startClipId: string, draggedClips: Set<string>): Set<string> => {
      const connected = new Set<string>([startClipId]);
      const sortedClips = [...visualPlaylist].sort((a, b) => a.startTime - b.startTime);
      const startClip = sortedClips.find(c => c.id === startClipId);
      if (!startClip) return connected;
      
      const startIndex = sortedClips.findIndex(c => c.id === startClipId);
      if (startIndex === -1) return connected;
      
      const gapThreshold = 0.01; // Consider clips connected if gap is less than 0.01 seconds
      
      // CRITICAL: ONLY find clips to the RIGHT (forward) - never look left
      // Start chaining from the clip immediately after the start clip
      let lastConnectedIndex = startIndex;
      
      // Iterate forward only (to the right)
      for (let i = startIndex + 1; i < sortedClips.length; i++) {
        // Get the last clip we've confirmed is connected
        const lastConnectedClip = sortedClips[lastConnectedIndex];
        
        // Safety check: ensure the last connected clip is actually in our set
        if (!connected.has(lastConnectedClip.id)) {
          break; // Chain broken - stop
        }
        
        // Get the next clip to check
        const nextClip = sortedClips[i];
        
        // Calculate gap between last connected clip's end and next clip's start
        const lastConnectedEnd = lastConnectedClip.startTime + lastConnectedClip.duration;
        const nextClipStart = nextClip.startTime;
        const gap = nextClipStart - lastConnectedEnd;
        
        // If gap is small enough, they're connected
        if (gap <= gapThreshold) {
          // Add to connected set (only clips to the right of start)
          connected.add(nextClip.id);
          lastConnectedIndex = i; // Update position in chain
        } else {
          // Gap found - stop chaining
          break;
        }
      }
      
      return connected;
    };
    
    // Helper function to find clips that will be "reached" when dragging (ripple effect)
    // ONLY finds clips to the RIGHT of all dragged clips
    const findClipsReachedByDrag = (draggedClips: Set<string>, deltaTime: number, originalStartTimes: {[clipId: string]: number}): Set<string> => {
      const reached = new Set<string>();
      const sortedClips = [...visualPlaylist].sort((a, b) => a.startTime - b.startTime);
      
      // Find the rightmost index of dragged clips in the sorted array
      let rightmostIndex = -1;
      draggedClips.forEach(clipId => {
        const index = sortedClips.findIndex(c => c.id === clipId);
        if (index > rightmostIndex) {
          rightmostIndex = index;
        }
      });
      
      // Find the rightmost edge of all dragged/connected clips
      let rightmostEnd = 0;
      draggedClips.forEach(clipId => {
        const clip = sortedClips.find(c => c.id === clipId);
        if (clip) {
          const originalTime = originalStartTimes[clipId] ?? clip.startTime;
          const newTime = originalTime + deltaTime;
          const endTime = newTime + clip.duration;
          rightmostEnd = Math.max(rightmostEnd, endTime);
        }
      });
      
      // Find all clips that the dragged clips will reach (fill gap and touch)
      // CRITICAL: Only check clips that come AFTER the rightmost dragged clip in the sorted array
      // This ensures we NEVER include clips to the left
      for (let i = rightmostIndex + 1; i < sortedClips.length; i++) {
        const clip = sortedClips[i];
        if (draggedClips.has(clip.id)) continue; // Skip already dragged clips
        
        const clipStart = clip.startTime;
        
        // Only include clips that start at or after the rightmost edge of dragged clips
        // This ensures we never include clips to the left
        if (clipStart >= rightmostEnd - 0.01) { // Small threshold for "reaching"
          reached.add(clip.id);
        }
      }
      
      return reached;
    };
    
    // Helper function to check for collisions
    const checkCollisions = (newStartTime: number, clipId: string, clipDuration: number, excludeClips?: Set<string>): boolean => {
      const newEndTime = newStartTime + clipDuration;
      
      // Check against all other clips (excluding the ones being dragged)
      for (const clip of visualPlaylist) {
        if (clip.id === clipId) continue;
        if (selectedVideoClips.has(clip.id)) continue; // Skip other selected clips
        if (excludeClips && excludeClips.has(clip.id)) continue; // Skip excluded clips
        
        const otherStart = clip.startTime;
        const otherEnd = otherStart + clip.duration;
        
        // Check for overlap
        if (!(newEndTime <= otherStart || newStartTime >= otherEnd)) {
          return true; // Collision detected
        }
      }
      
      return false; // No collision
    };

    // Store drag positions in refs (not state) to avoid React re-renders during drag
    const dragPositions = new Map<string, number>();
    let rafId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentDragState = videoDragStateRef.current;
      if (!currentDragState) return;

      const deltaX = e.clientX - currentDragState.startX;
      const deltaTime = deltaX / scaleRef.current;
      const newStartTime = Math.max(0, currentDragState.originalStartTime + deltaTime);

      // Get the clip being dragged
      const draggedClip = visualPlaylist.find(c => c.id === currentDragState.clipId);
      if (!draggedClip) return;

      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Use RAF for smooth visual updates - NO React state updates during drag
      rafId = requestAnimationFrame(() => {
        // Check if we have mixed selection
        const hasMixedSelection = selectedVideoClips.size > 0 && selectedClips.size > 0;
        
        // Find all connected clips (chaining behavior for video clips)
        // ONLY chain clips to the RIGHT of the dragged clip(s)
        let allClipsToMove = new Set<string>();
        
        if (selectedVideoClips.size > 1 || hasMixedSelection) {
          // Multi-select: find connected clips for each selected clip (only to the right)
          selectedVideoClips.forEach(selectedClipId => {
            allClipsToMove.add(selectedClipId);
            const connected = findConnectedClips(selectedClipId, selectedVideoClips);
            connected.forEach(id => allClipsToMove.add(id));
          });
        } else {
          // Single clip: only chain to the right
          allClipsToMove = findConnectedClips(currentDragState.clipId, selectedVideoClips);
        }
        
        const deltaTimeForAll = newStartTime - currentDragState.originalStartTime;
        
        // Find clips that will be "reached" by the drag (ripple effect)
        const originalStartTimes: {[clipId: string]: number} = {};
        allClipsToMove.forEach(clipId => {
          const clip = visualPlaylist.find(c => c.id === clipId);
          if (clip) {
            if (currentMultiDrag && currentMultiDrag.originalStartTimes[clipId] !== undefined) {
              originalStartTimes[clipId] = currentMultiDrag.originalStartTimes[clipId];
            } else {
              originalStartTimes[clipId] = clip.startTime;
            }
          }
        });
        
        const reachedClips = findClipsReachedByDrag(allClipsToMove, deltaTimeForAll, originalStartTimes);
        reachedClips.forEach(id => allClipsToMove.add(id));
        
        // For multi-select or mixed-select, calculate delta for all clips
        if ((selectedVideoClips.size > 1 || hasMixedSelection) && selectedVideoClips.has(currentDragState.clipId) && currentMultiDrag) {
          // Check collisions for all clips to move (including connected and reached ones)
          let validMove = true;
          allClipsToMove.forEach(clipId => {
            const clip = visualPlaylist.find(c => c.id === clipId);
            if (clip) {
              const originalTime = currentMultiDrag.originalStartTimes[clipId] ?? clip.startTime;
              const proposedStart = Math.max(0, originalTime + deltaTimeForAll);
              if (checkCollisions(proposedStart, clipId, clip.duration, allClipsToMove)) {
                validMove = false;
              }
            }
          });

          if (validMove) {
            // Move all selected clips
            selectedVideoClips.forEach(clipId => {
              const clip = visualPlaylist.find(c => c.id === clipId);
              const el = clipElements.get(clipId);
              if (clip && el && currentMultiDrag.originalStartTimes[clipId] !== undefined) {
                const proposedStart = Math.max(0, currentMultiDrag.originalStartTimes[clipId] + deltaTimeForAll);
                const newLeftPx = proposedStart * scaleRef.current;
                const originalLeft = originalLeftPositions.get(clipId) || 0;
                const translateX = newLeftPx - originalLeft;
                el.style.transform = `translateX(${translateX}px)`;
                dragPositions.set(clipId, proposedStart);
              }
            });
            
            // Move connected and reached clips that aren't selected
            allClipsToMove.forEach(clipId => {
              if (!selectedVideoClips.has(clipId)) {
                const clip = visualPlaylist.find(c => c.id === clipId);
                const el = findClipElement(clipId);
                if (clip && el) {
                  const originalTime = clip.startTime;
                  const proposedStart = Math.max(0, originalTime + deltaTimeForAll);
                  const newLeftPx = proposedStart * scaleRef.current;
                  const computedStyle = window.getComputedStyle(el);
                  const originalLeft = parseFloat(computedStyle.left) || 0;
                  const translateX = newLeftPx - originalLeft;
                  el.style.transform = `translateX(${translateX}px)`;
                  el.style.willChange = 'transform';
                  el.style.zIndex = '100';
                  dragPositions.set(clipId, proposedStart);
                }
              }
            });
          }
        } else {
          // Single clip drag - find connected clips and move them too
          const deltaTimeForAll = newStartTime - currentDragState.originalStartTime;
          
          // Check if we can move the dragged clip and all connected/reached clips
          let validMove = true;
          allClipsToMove.forEach(clipId => {
            const clip = visualPlaylist.find(c => c.id === clipId);
            if (clip) {
              const originalTime = clipId === currentDragState.clipId ? currentDragState.originalStartTime : clip.startTime;
              const proposedStart = Math.max(0, originalTime + deltaTimeForAll);
              if (checkCollisions(proposedStart, clipId, clip.duration, allClipsToMove)) {
                validMove = false;
              }
            }
          });
          
          if (validMove) {
            // Move the dragged clip
            const el = clipElements.get(currentDragState.clipId);
            if (el) {
              const newLeftPx = newStartTime * scaleRef.current;
              const originalLeft = originalLeftPositions.get(currentDragState.clipId) || 0;
              const translateX = newLeftPx - originalLeft;
              el.style.transform = `translateX(${translateX}px)`;
              dragPositions.set(currentDragState.clipId, newStartTime);
            }
            
            // Move all connected and reached clips
            allClipsToMove.forEach(clipId => {
              if (clipId !== currentDragState.clipId) {
                const clip = visualPlaylist.find(c => c.id === clipId);
                const el = findClipElement(clipId);
                if (clip && el) {
                  const originalTime = clip.startTime;
                  const proposedStart = Math.max(0, originalTime + deltaTimeForAll);
                  const newLeftPx = proposedStart * scaleRef.current;
                  const computedStyle = window.getComputedStyle(el);
                  const originalLeft = parseFloat(computedStyle.left) || 0;
                  const translateX = newLeftPx - originalLeft;
                  el.style.transform = `translateX(${translateX}px)`;
                  el.style.willChange = 'transform';
                  el.style.zIndex = '100';
                  dragPositions.set(clipId, proposedStart);
                }
              }
            });
          }
        }
        
        // If mixed selection, also move audio clips using the same delta
        if (hasMixedSelection && currentAudioMultiDrag) {
          // Calculate deltaTime - use the one from the appropriate branch
          const deltaTimeForAudio = (selectedVideoClips.size > 1 || hasMixedSelection) && currentMultiDrag
            ? (newStartTime - currentDragState.originalStartTime)
            : (newStartTime - currentDragState.originalStartTime);
          
          selectedClips.forEach(clipId => {
            const el = document.querySelector(`[data-clip-id="${clipId}"]`) as HTMLElement;
            if (el && currentAudioMultiDrag.originalStartTimes[clipId] !== undefined) {
              const originalTime = currentAudioMultiDrag.originalStartTimes[clipId];
              const newTime = Math.max(0, originalTime + deltaTimeForAudio);
              const newLeftPx = newTime * scaleRef.current;
              const computedStyle = window.getComputedStyle(el);
              const originalLeft = parseFloat(computedStyle.left) || 0;
              const translateX = newLeftPx - originalLeft;
              el.style.transform = `translateX(${translateX}px)`;
              el.style.willChange = 'transform';
              el.style.zIndex = '100';
            }
          });
        }
        
        rafId = null;
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Cancel any pending RAF
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      // Only NOW update React state with final positions
      const currentDragState = videoDragStateRef.current;
      if (currentDragState) {
        const draggedClip = visualPlaylist.find(c => c.id === currentDragState.clipId);
        if (draggedClip) {
          const hasMixedSelection = selectedVideoClips.size > 0 && selectedClips.size > 0;
          const deltaX = e.clientX - currentDragState.startX;
          const deltaTime = deltaX / scaleRef.current;
          const newStartTime = Math.max(0, currentDragState.originalStartTime + deltaTime);
          const deltaTimeForAll = newStartTime - currentDragState.originalStartTime;
          
          // Find all connected clips that were moved (only to the right)
          let allClipsToUpdate = new Set<string>();
          
          if (selectedVideoClips.size > 1 || hasMixedSelection) {
            // Multi-select: find connected clips for each selected clip (only to the right)
            selectedVideoClips.forEach(selectedClipId => {
              allClipsToUpdate.add(selectedClipId);
              const connected = findConnectedClips(selectedClipId, selectedVideoClips);
              connected.forEach(id => allClipsToUpdate.add(id));
            });
          } else {
            // Single clip: only chain to the right
            allClipsToUpdate = findConnectedClips(currentDragState.clipId, selectedVideoClips);
          }
          
          // Also include clips that were reached during drag
          const originalStartTimesForReach: {[clipId: string]: number} = {};
          allClipsToUpdate.forEach(clipId => {
            const clip = visualPlaylist.find(c => c.id === clipId);
            if (clip) {
              if (currentMultiDrag && currentMultiDrag.originalStartTimes[clipId] !== undefined) {
                originalStartTimesForReach[clipId] = currentMultiDrag.originalStartTimes[clipId];
              } else {
                originalStartTimesForReach[clipId] = clip.startTime;
              }
            }
          });
          const reachedClips = findClipsReachedByDrag(allClipsToUpdate, deltaTimeForAll, originalStartTimesForReach);
          reachedClips.forEach(id => allClipsToUpdate.add(id));
          
          if ((selectedVideoClips.size > 1 || hasMixedSelection) && selectedVideoClips.has(currentDragState.clipId) && currentMultiDrag) {
            let validMove = true;
            
            // Final collision check for all clips (including connected ones)
            allClipsToUpdate.forEach(clipId => {
              const clip = visualPlaylist.find(c => c.id === clipId);
              if (clip) {
                const originalTime = currentMultiDrag.originalStartTimes[clipId] ?? clip.startTime;
                const proposedStart = Math.max(0, originalTime + deltaTimeForAll);
                if (checkCollisions(proposedStart, clipId, clip.duration, allClipsToUpdate)) {
                  validMove = false;
                }
              }
            });

            if (validMove) {
              // Use dragPositions map if available, otherwise calculate
              setVideoClipStartTimes(prev => {
                const updated = { ...prev };
                allClipsToUpdate.forEach(clipId => {
                  const finalTime = dragPositions.get(clipId);
                  if (finalTime !== undefined) {
                    updated[clipId] = finalTime;
                  } else {
                    const clip = visualPlaylist.find(c => c.id === clipId);
                    const originalTime = currentMultiDrag.originalStartTimes[clipId] ?? clip?.startTime ?? 0;
                    if (clip) {
                      updated[clipId] = Math.max(0, originalTime + deltaTimeForAll);
                    }
                  }
                });
                return updated;
              });
            }
          } else {
            // Single clip - update connected clips too (only to the right)
            const finalTime = dragPositions.get(currentDragState.clipId);
            const connectedClips = findConnectedClips(currentDragState.clipId, selectedVideoClips);
            if (finalTime !== undefined && !checkCollisions(finalTime, draggedClip.id, draggedClip.duration, connectedClips)) {
              setVideoClipStartTimes(prev => {
                const updated = { ...prev };
                connectedClips.forEach(clipId => {
                  const clip = visualPlaylist.find(c => c.id === clipId);
                  if (clip) {
                    const finalTimeForClip = dragPositions.get(clipId);
                    if (finalTimeForClip !== undefined) {
                      updated[clipId] = finalTimeForClip;
                    } else {
                      const originalTime = clipId === currentDragState.clipId ? currentDragState.originalStartTime : clip.startTime;
                      updated[clipId] = Math.max(0, originalTime + deltaTimeForAll);
                    }
                  }
                });
                return updated;
              });
            }
          }
          
          // If mixed selection, also update audio clip positions
          if (hasMixedSelection && multiDragState) {
            setTracks(prev => prev.map(t => ({
              ...t,
              clips: t.clips.map(c => {
                if (selectedClips.has(c.id)) {
                  // Try to get from dragPositions first, but we need to calculate it
                  const originalTime = multiDragState.originalStartTimes[c.id];
                  if (originalTime !== undefined) {
                    const finalTime = Math.max(0, originalTime + deltaTimeForAll);
                    return { ...c, startTime: finalTime };
                  }
                }
                return c;
              })
            })));
          }
        }

        // Remove transforms and restore styles for all moved clips (including connected ones)
        clipElements.forEach((el) => {
          el.style.transform = '';
          el.style.willChange = '';
          el.style.zIndex = '';
        });
        
        // Also clean up connected clips that weren't in clipElements
        const connectedClips = findConnectedClips(currentDragState.clipId, selectedVideoClips);
        connectedClips.forEach(clipId => {
          if (!clipElements.has(clipId)) {
            const el = findClipElement(clipId);
            if (el) {
              el.style.transform = '';
              el.style.willChange = '';
              el.style.zIndex = '';
            }
          }
        });
      }
      
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      setVideoDragState(null);
      setVideoMultiDragState(null);
      saveToHistory();
      triggerAutoSave();
    };

    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    document.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
      clipElements.forEach((el) => {
        el.style.transform = '';
        el.style.willChange = '';
        el.style.zIndex = '';
      });
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [videoDragState, videoMultiDragState, selectedVideoClips, visualPlaylist, scaleRef, triggerAutoSave, saveToHistory, videoClipStartTimes]);

  // Handle audio clip volume change
  const handleClipVolumeChange = (trackId: string, clipId: string, volume: number) => {
    setTracks(prev => prev.map(t => 
      t.id === trackId ? {
        ...t,
        clips: t.clips.map(c => 
          c.id === clipId ? { ...c, volume: Math.max(0, Math.min(1, volume)) } : c
        )
      } : t
    ));
    triggerAutoSave();
  };

  // Start dragging volume line
  const handleVolumeLineMouseDown = (e: React.MouseEvent, clip: AVPreviewClip, trackId: string) => {
    e.stopPropagation();
    e.preventDefault();
    setVolumeDragState({
      clipId: clip.id,
      trackId,
      startY: e.clientY,
      startVolume: clip.volume
    });
  };

  // Volume line dragging handler
  const volumeDragStateRef = useRef(volumeDragState);
  useEffect(() => {
    volumeDragStateRef.current = volumeDragState;
  }, [volumeDragState]);

  useEffect(() => {
    if (!volumeDragState) {
      return;
    }

    // Prevent text selection during volume drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
    
    let rafId: number | null = null;
    let lastUpdateTime = 0;
    const throttleMs = 16; // ~60fps

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentDragState = volumeDragStateRef.current;
      if (!currentDragState) return;

      const now = performance.now();
      if (now - lastUpdateTime < throttleMs && rafId !== null) {
        return; // Throttle updates
      }
      lastUpdateTime = now;

      const deltaY = currentDragState.startY - e.clientY; // Inverted: drag up = increase volume
      const deltaVolume = deltaY / 100; // 100px drag = 1.0 volume change
      const newVolume = Math.max(0, Math.min(1, currentDragState.startVolume + deltaVolume));

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        setTracks(prev => prev.map(t =>
          t.id === currentDragState.trackId ? {
            ...t,
            clips: t.clips.map(c =>
              c.id === currentDragState.clipId ? { ...c, volume: newVolume } : c
            )
          } : t
        ));
        rafId = null;
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      
      // Restore text selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      setVolumeDragState(null);
      saveToHistory(); // Save to history when drag ends
      triggerAutoSave(); // Save when drag ends
    };

    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    document.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [volumeDragState, triggerAutoSave]);

  // Load audio duration when clip is added
  useEffect(() => {
    const loadAudioDurations = async () => {
      const clipsToLoad = tracks.flatMap(track => 
        track.clips
          .filter(clip => !audioDurations[clip.url])
          .map(clip => ({ url: clip.url, clipId: clip.id }))
      );

      for (const { url, clipId } of clipsToLoad) {
        try {
          const audio = new Audio(url);
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
            audio.addEventListener('loadedmetadata', () => {
              clearTimeout(timeout);
              const duration = audio.duration || 0;
              setAudioDurations(prev => ({ ...prev, [url]: duration }));
              resolve(duration);
            }, { once: true });
            audio.addEventListener('error', () => {
              clearTimeout(timeout);
              setAudioDurations(prev => ({ ...prev, [url]: 5 })); // Default 5s
              resolve(5);
            }, { once: true });
            audio.load();
          });
        } catch (error) {
          console.error('Error loading audio duration:', error);
          setAudioDurations(prev => ({ ...prev, [url]: 5 }));
        }
      }
    };

    loadAudioDurations();
  }, [clipIds]);

  // Resizing Handlers - Simple state-based approach with ref
  const resizeStateRef = useRef(resizeState);
  useEffect(() => {
    resizeStateRef.current = resizeState;
  }, [resizeState]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    
    let rafId: number | null = null;
    let lastUpdateTime = 0;
    const throttleMs = 16; // ~60fps

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const currentResizeState = resizeStateRef.current;
      if (!currentResizeState) return;
      
      const now = performance.now();
      if (now - lastUpdateTime < throttleMs && rafId !== null) {
        return; // Throttle updates
      }
      lastUpdateTime = now;
      
      const deltaX = e.clientX - currentResizeState.startX;
      const deltaSeconds = deltaX / scaleRef.current;
      
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
      setClipEdits(prev => {
        const currentEdit = prev[currentResizeState.shotId] || { 
          duration: currentResizeState.originalDuration, 
          offset: currentResizeState.originalOffset 
        };
        
        // Calculate max duration based on source duration (for videos and audio)
        let maxDuration: number | undefined = undefined;
        if ((currentResizeState.clipType === 'video' || currentResizeState.trackId) && currentResizeState.sourceDuration) {
          // For videos and audio: max duration = sourceDuration - offset
          maxDuration = currentResizeState.sourceDuration - currentResizeState.originalOffset;
        } else if (currentResizeState.clipType === 'image') {
          // For images: reasonable max (60 seconds)
          maxDuration = 60;
        }
        
        // If this is an audio clip resize, update tracks
        if (currentResizeState.trackId) {
          if (currentResizeState.edge === 'right') {
            // Right edge: trim ending (change duration only)
            setTracks(prev => {
              const track = prev.find(t => t.id === currentResizeState.trackId);
              if (!track) return prev;
              
              const clip = track.clips.find(c => c.id === currentResizeState.clipId);
              if (!clip) return prev;
              
              const sourceDuration = audioDurations[clip.url] || currentResizeState.sourceDuration || currentResizeState.originalDuration;
              const maxAvailable = sourceDuration - currentResizeState.originalOffset;
              
              let newDuration = currentResizeState.originalDuration + deltaSeconds;
              newDuration = Math.max(0.1, newDuration);
              if (maxAvailable > 0) {
                newDuration = Math.min(newDuration, maxAvailable);
              }
              
              return prev.map(t => 
                t.id === currentResizeState.trackId ? {
                  ...t,
                  clips: t.clips.map(c => 
                    c.id === currentResizeState.clipId ? { ...c, duration: newDuration } : c
                  )
                } : t
              );
            });
          } else {
            // Left edge: adjust start/offset (change offset and startTime, keep duration)
            setTracks(prev => {
              const track = prev.find(t => t.id === currentResizeState.trackId);
              if (!track) return prev;
              
              const clip = track.clips.find(c => c.id === currentResizeState.clipId);
              if (!clip) return prev;
              
              const sourceDuration = audioDurations[clip.url] || currentResizeState.sourceDuration || currentResizeState.originalDuration;
              
              let newOffset = currentResizeState.originalOffset + deltaSeconds;
              newOffset = Math.max(0, newOffset);
              const maxOffset = sourceDuration - currentResizeState.originalDuration;
              if (maxOffset >= 0) {
                newOffset = Math.min(newOffset, maxOffset);
              }
              
              // Adjust startTime: when offset increases (dragging left), move clip start backward
              // When offset decreases (dragging right), move clip start forward
              const offsetDelta = newOffset - currentResizeState.originalOffset;
              const newStartTime = clip.startTime - offsetDelta; // Negative delta moves clip left
              
              return prev.map(t => 
                t.id === currentResizeState.trackId ? {
                  ...t,
                  clips: t.clips.map(c => 
                    c.id === currentResizeState.clipId ? { 
                      ...c, 
                      offset: newOffset,
                      startTime: Math.max(0, newStartTime) // Don't allow negative start times
                    } : c
                  )
                } : t
              );
            });
          }
          return prev; // Don't update clipEdits for audio
        }
        
        if (currentResizeState.edge === 'right') {
          // Right edge: change duration (trim out)
          let newDuration = currentResizeState.originalDuration + deltaSeconds;
          newDuration = Math.max(0.1, newDuration);
          // Enforce max duration if available
          if (maxDuration !== undefined) {
            newDuration = Math.min(newDuration, maxDuration);
          }
          return {
            ...prev,
            [currentResizeState.shotId]: {
              ...currentEdit,
              duration: newDuration
            }
          };
        } else {
          // Left edge: trim in (for videos only)
          let newOffset = currentResizeState.originalOffset + deltaSeconds;
          newOffset = Math.max(0, newOffset);
          let newDuration = currentResizeState.originalDuration - deltaSeconds;
          newDuration = Math.max(0.1, newDuration);
          
          // For videos: ensure offset + duration doesn't exceed source duration
          if (currentResizeState.clipType === 'video' && currentResizeState.sourceDuration) {
            // Total playable length = offset + duration cannot exceed sourceDuration
            const totalLength = newOffset + newDuration;
            if (totalLength > currentResizeState.sourceDuration) {
              // Clamp to source duration
              const maxAvailable = currentResizeState.sourceDuration;
              // If dragging left (increasing offset), reduce duration
              if (deltaSeconds > 0) {
                newOffset = Math.min(newOffset, maxAvailable - 0.1);
                newDuration = maxAvailable - newOffset;
              } else {
                // If dragging right (decreasing offset), we can increase duration
                newDuration = Math.min(newDuration, maxAvailable - newOffset);
              }
            }
          }
          
          return {
            ...prev,
            [currentResizeState.shotId]: {
              ...currentEdit,
              offset: newOffset,
              duration: newDuration
            }
          };
        }
        });
        rafId = null;
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const wasAudioResize = resizeStateRef.current?.trackId !== undefined;
      setResizeState(null);
      if (wasAudioResize) {
        triggerAutoSave(); // Auto-save after audio clip resize
      }
    };

    // Use capture phase and make sure we catch events
    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false });
    document.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
    };
  }, [resizeState]);

  const handleResizeStart = (e: React.MouseEvent, clip: VisualClip, edge: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    
    setResizeState({
      clipId: clip.id,
      shotId: clip.shotId,
      edge,
      startX: e.clientX,
      originalDuration: clip.duration,
      originalOffset: clip.offset,
      sourceDuration: clip.sourceDuration,
      clipType: clip.type
    });
  };

  // Start audio clip resize
  const handleAudioResizeStart = (e: React.MouseEvent, clip: AVPreviewClip, trackId: string, edge: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    
    const sourceDuration = audioDurations[clip.url] || clip.duration;
    
    setResizeState({
      clipId: clip.id,
      shotId: clip.id, // Use clip.id as shotId for audio
      edge,
      startX: e.clientX,
      originalDuration: clip.duration,
      originalOffset: clip.offset,
      sourceDuration,
      clipType: 'video', // Use video type for audio to enable trimming
      trackId
    });
  };

  const handleClipMouseDown = (e: React.MouseEvent, clip: VisualClip) => {
    // Don't handle if clicking on a resize handle (resize handles capture their own events)
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) {
      return;
    }
    
    // Don't handle if clicking on mute button
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    
    // If we reach here, it's a drag operation - the resize handles cover the edge areas

    // Multi-select: Ctrl/Cmd+click to toggle selection
    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setSelectedVideoClips(prev => {
        const newSet = new Set(prev);
        if (newSet.has(clip.id)) {
          newSet.delete(clip.id);
        } else {
          newSet.add(clip.id);
        }
        return newSet;
      });
      return;
    }
    
    // Shift+click to select range
    if (e.shiftKey && selectedVideoClips.size > 0) {
      e.stopPropagation();
      const allClips = visualPlaylist;
      const selectedClipIds = Array.from(selectedVideoClips);
      const firstSelected = allClips.find(c => selectedClipIds.includes(c.id));
      const currentClip = allClips.find(c => c.id === clip.id);
      
      if (firstSelected && currentClip) {
        const firstIndex = allClips.findIndex(c => c.id === firstSelected.id);
        const currentIndex = allClips.findIndex(c => c.id === currentClip.id);
        const start = Math.min(firstIndex, currentIndex);
        const end = Math.max(firstIndex, currentIndex);
        
        setSelectedVideoClips(prev => {
          const newSet = new Set(prev);
          for (let i = start; i <= end; i++) {
            newSet.add(allClips[i].id);
          }
          return newSet;
        });
      }
      return;
    }
    
    // Single click: clear selection if clicking outside, or select this clip
    if (!selectedVideoClips.has(clip.id)) {
      setSelectedVideoClips(new Set([clip.id]));
    }
    
    // Start dragging
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we have mixed selections (both video and audio clips selected)
    const hasVideoSelection = selectedVideoClips.size > 0;
    const hasAudioSelection = selectedClips.size > 0;
    const hasMixedSelection = hasVideoSelection && hasAudioSelection;
    
    if (hasMixedSelection) {
      // Set up for mixed drag - both handlers will be active
      // Video handler will track video clips, audio handler will track audio clips
      const originalStartTimes: {[clipId: string]: number} = {};
      visualPlaylist.forEach(c => {
        if (selectedVideoClips.has(c.id)) {
          originalStartTimes[c.id] = c.startTime;
        }
      });
      setVideoMultiDragState({
        startX: e.clientX,
        originalStartTimes
      });
      
      // Also set up audio multi-drag
      const audioOriginalStartTimes: {[clipId: string]: number} = {};
      tracks.forEach(t => {
        t.clips.forEach(c => {
          if (selectedClips.has(c.id)) {
            audioOriginalStartTimes[c.id] = c.startTime;
          }
        });
      });
      setMultiDragState({
        startX: e.clientX,
        originalStartTimes: audioOriginalStartTimes
      });
    } else if (selectedVideoClips.size > 1 && selectedVideoClips.has(clip.id)) {
      // Multiple video clips only
      const originalStartTimes: {[clipId: string]: number} = {};
      visualPlaylist.forEach(c => {
        if (selectedVideoClips.has(c.id)) {
          originalStartTimes[c.id] = c.startTime;
        }
      });
      setVideoMultiDragState({
        startX: e.clientX,
        originalStartTimes
      });
    }
    
    setVideoDragState({
      clipId: clip.id,
      startX: e.clientX,
      originalStartTime: clip.startTime
    });
  };

  const handleSaveProject = () => {
    if (!avScript) {
      console.warn('No AV Script to save');
      return;
    }

    // Construct updated AV Script with new durations and offsets
    const updatedAvScript = {
      ...avScript,
      segments: avScript.segments.map(seg => ({
        ...seg,
        shots: seg.shots.map(shot => {
          const edit = clipEdits[shot.id];
          const newDuration = edit?.duration ?? shot.duration;
          const newOffset = edit?.offset ?? shot.videoOffset ?? 0;
          
          console.log(`Saving shot ${shot.id} (${shot.take}): duration=${newDuration}, offset=${newOffset}`, {
            originalDuration: shot.duration,
            originalOffset: shot.videoOffset,
            edit
          });
          
          return {
            ...shot,
            duration: newDuration,
            videoOffset: newOffset
          };
        })
      }))
    };

    console.log('Saving project with updated AV Script:', updatedAvScript);
    onSave({ audioTracks: tracks }, updatedAvScript);
  };

  // Format timecode for FCP XML (HH:MM:SS:FF at 24fps)
  const formatTimecode = (seconds: number): string => {
    const totalFrames = Math.floor(seconds * 24);
    const hours = Math.floor(totalFrames / (24 * 3600));
    const minutes = Math.floor((totalFrames % (24 * 3600)) / (24 * 60));
    const secs = Math.floor((totalFrames % (24 * 60)) / 24);
    const frames = totalFrames % 24;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  // Format duration for FCP XML (in seconds with decimal, e.g., "3.500000s")
  const formatDuration = (seconds: number): string => {
    return seconds.toFixed(6) + 's';
  };

  const ensureFFmpegLoaded = useCallback(async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg.loaded) {
      try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      } catch (error) {
        console.error('Failed to load FFmpeg for export:', error);
        throw new Error('Failed to load media processor. Please check your internet connection.');
      }
    }
    return ffmpeg;
  }, []);

  const normalizeVideoTimecode = useCallback(
    async (blob: Blob, filename: string): Promise<Blob> => {
      const ffmpeg = await ensureFFmpegLoaded();
      const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const inputName = `input-${safeName}`;
      const outputName = `normalized-${safeName}`;
      try {
        const data = new Uint8Array(await blob.arrayBuffer());
        await ffmpeg.writeFile(inputName, data);
        await ffmpeg.exec([
          '-y',
          '-i',
          inputName,
          '-c',
          'copy',
          '-timecode',
          '00:00:00:00',
          outputName,
        ]);
        const normalizedData = await ffmpeg.readFile(outputName);
        // ffmpeg.readFile returns Uint8Array for binary files
        // Cast to BlobPart to satisfy TypeScript's type checking
        return new Blob([normalizedData as BlobPart], { type: blob.type || 'video/mp4' });
      } catch (error) {
        console.warn(`Timecode normalization failed for ${filename}:`, error);
        return blob;
      } finally {
        try {
          await ffmpeg.deleteFile(inputName);
        } catch {}
        try {
          await ffmpeg.deleteFile(outputName);
        } catch {}
      }
    },
    [ensureFFmpegLoaded]
  );

  const escapeXml = (value: string): string => {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Generate safe filename that avoids sequence patterns (01, 02, 03)
  const generateSafeFilename = (index: number, originalUrl: string, type: 'video' | 'image' | 'audio'): string => {
    // Extract extension from URL
    const urlMatch = originalUrl.match(/\.([a-zA-Z0-9]+)(\?|$)/);
    const ext = urlMatch ? urlMatch[1] : (type === 'video' ? 'mp4' : type === 'image' ? 'jpg' : 'mp3');
    
    // Use descriptive naming instead of numbered sequences
    // Format: clip-{type}-{index}-{hash}.{ext}
    const hash = Math.random().toString(36).substring(2, 8);
    const typePrefix = type === 'video' ? 'vid' : type === 'image' ? 'img' : 'aud';
    return `clip-${typePrefix}-${index}-${hash}.${ext}`;
  };

  const handleExportFCPXML = async () => {
    if (!avScript || !selectedSegmentId) {
      alert('Please select a scene to export');
      return;
    }

    setIsExportingFCPXML(true);
    
    try {
      const segment = avScript.segments.find(s => s.id === selectedSegmentId);
      if (!segment) {
        throw new Error('Selected segment not found');
      }

      const zip = new JSZip();
      const mediaFolder = zip.folder('Media');
      if (!mediaFolder) {
        throw new Error('Failed to create media folder in ZIP');
      }

      // Prepare clips with edits
      const clipsToExport: Array<{
        type: 'video' | 'image';
        url: string;
        startTime: number;
        duration: number;
        offset: number;
        shotId: string;
        take: string;
        isMuted: boolean;
      }> = [];

      let currentTime = 0;
      for (const shot of segment.shots) {
        const edit = clipEdits[shot.id] || { duration: shot.duration || 3, offset: 0 };
        const isMuted = mutedShots.has(shot.id);
        
        if (shot.videoUrl) {
          clipsToExport.push({
            type: 'video',
            url: shot.videoUrl,
            startTime: currentTime,
            duration: edit.duration,
            offset: edit.offset || 0,
            shotId: shot.id,
            take: shot.take || `${segment.segmentNumber}.${shot.shotNumber}`,
            isMuted
          });
        } else if (shot.imageUrl) {
          clipsToExport.push({
            type: 'image',
            url: shot.imageUrl,
            startTime: currentTime,
            duration: edit.duration,
            offset: 0,
            shotId: shot.id,
            take: shot.take || `${segment.segmentNumber}.${shot.shotNumber}`,
            isMuted: false
          });
        }
        
        currentTime += edit.duration;
      }

      // Prepare audio clips grouped by track
      const audioClipsByTrack: Map<string, Array<{
        url: string;
        startTime: number;
        duration: number;
        offset: number;
        trackName: string;
      }>> = new Map();

      for (const track of tracks) {
        if (track.isMuted) continue;
        const trackClips: Array<{
          url: string;
          startTime: number;
          duration: number;
          offset: number;
          trackName: string;
        }> = [];
        
        for (const clip of track.clips) {
          const clipEndTime = clip.startTime + clip.duration;
          if (clipEndTime > 0 && clip.startTime < currentTime) {
            trackClips.push({
              url: clip.url,
              startTime: clip.startTime,
              duration: clip.duration,
              offset: clip.offset || 0,
              trackName: track.name
            });
          }
        }
        
        if (trackClips.length > 0) {
          audioClipsByTrack.set(track.id, trackClips);
        }
      }

      // Download and add media files to ZIP
      const mediaFileMap = new Map<string, string>(); // URL -> filename mapping
      
      // Helper to download file
      const downloadFile = async (url: string): Promise<Blob> => {
        try {
          // Try proxy first to avoid CORS
          const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(url)}`;
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error('Proxy failed');
          return await response.blob();
        } catch (e) {
          // Fallback to direct fetch
          const response = await fetch(url);
          if (!response.ok) throw new Error('Failed to fetch');
          return await response.blob();
        }
      };

      // Download visual clips (unique URLs only)
      let downloadedVideoCounter = 0;
      for (let i = 0; i < clipsToExport.length; i++) {
        const clip = clipsToExport[i];
        if (!clip.url) continue;
        if (mediaFileMap.has(clip.url)) {
          continue;
        }
        const filename = generateSafeFilename(
          downloadedVideoCounter++,
          clip.url,
          clip.type === 'image' ? 'image' : 'video'
        );
        mediaFileMap.set(clip.url, filename);
        
        try {
          let blob = await downloadFile(clip.url);
          if (clip.type === 'video') {
            blob = await normalizeVideoTimecode(blob, filename);
          }
          mediaFolder.file(filename, blob);
        } catch (error) {
          console.error(`Failed to download ${clip.url}:`, error);
          throw new Error(`Failed to download media file: ${clip.url}`);
        }
      }

      // Download audio clips (collect all unique URLs first)
      const allAudioClips: Array<{url: string; startTime: number; duration: number; offset: number; trackName: string}> = [];
      for (const trackClips of audioClipsByTrack.values()) {
        allAudioClips.push(...trackClips);
      }
      
      // Track audio asset IDs by URL to avoid duplicates
      const audioAssetIdMap = new Map<string, number>();
      let audioAssetCounter = 1;
      let audioFileCounter = 0;
      
      for (const clip of allAudioClips) {
        // Only download and assign asset ID if we haven't seen this URL before
        if (!mediaFileMap.has(clip.url)) {
          const filename = generateSafeFilename(audioFileCounter++, clip.url, 'audio');
          mediaFileMap.set(clip.url, filename);
          
          try {
            const blob = await downloadFile(clip.url);
            mediaFolder.file(filename, blob);
          } catch (error) {
            console.error(`Failed to download audio ${clip.url}:`, error);
            throw new Error(`Failed to download audio file: ${clip.url}`);
          }
        }
        
        // Assign asset ID for this URL (only once per unique URL)
        if (!audioAssetIdMap.has(clip.url)) {
          audioAssetIdMap.set(clip.url, audioAssetCounter++);
        }
      }

      // Generate Final Cut Pro 7 XML (xmeml) compatible with Resolve
      const fps = 24;
      const secondsToFrames = (seconds: number) => Math.max(0, Math.round(seconds * fps));
      const buildRateXML = () => `
    <rate>
      <timebase>${fps}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>`;
      const formatFrameTimecode = (frame: number) => {
        const totalFrames = Math.max(0, frame);
        const framesPerHour = fps * 3600;
        const framesPerMinute = fps * 60;
        const hours = Math.floor(totalFrames / framesPerHour);
        const minutes = Math.floor((totalFrames % framesPerHour) / framesPerMinute);
        const seconds = Math.floor((totalFrames % framesPerMinute) / fps);
        const frames = totalFrames % fps;
        return `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
      };

      const videoEndSeconds = clipsToExport.reduce(
        (max, clip) => Math.max(max, clip.startTime + clip.duration),
        0
      );
      const audioEndSeconds = allAudioClips.reduce(
        (max, clip) => Math.max(max, clip.startTime + clip.duration),
        videoEndSeconds
      );
      const projectDurationSeconds = Math.max(videoEndSeconds, audioEndSeconds);
      const projectDurationFrames = Math.max(1, secondsToFrames(projectDurationSeconds));
      const defaultWidth = 1920;
      const defaultHeight = 1080;

      const encodePathForXml = (filename: string) => {
        const encoded = filename
          .split('/')
          .map(part => encodeURIComponent(part))
          .join('/');
        return `file://localhost/Media/${encoded}`;
      };

      const videoFileIdMap = new Map<string, number>();
      let videoFileCounter = 1;
      const videoFileMetadata = new Map<string, { durationFrames: number; hasAudio: boolean }>();

      for (const clip of clipsToExport) {
        if (!clip.url) continue;
        if (!videoFileIdMap.has(clip.url)) {
          videoFileIdMap.set(clip.url, videoFileCounter++);
        }
        // Get source duration from videoDurations map if available, otherwise use clip duration + offset
        const sourceSeconds = (clip.type === 'video' && videoDurations[clip.url]) 
          ? videoDurations[clip.url] 
          : (clip.duration + clip.offset);
        const sourceFrames = secondsToFrames(sourceSeconds);
        const existing = videoFileMetadata.get(clip.url);
        const hasAudio = !clip.isMuted;
        if (!existing) {
          videoFileMetadata.set(clip.url, { durationFrames: sourceFrames, hasAudio });
        } else {
          existing.durationFrames = Math.max(existing.durationFrames, sourceFrames);
          existing.hasAudio = existing.hasAudio || hasAudio;
          videoFileMetadata.set(clip.url, existing);
        }
      }

      const definedFileIds = new Set<string>();
      const buildVideoFileElement = (clip: (typeof clipsToExport)[number], fileId: string, filename: string) => {
        if (!clip.url) {
          return `<file id="${fileId}"/>`;
        }
        if (definedFileIds.has(fileId)) {
          return `<file id="${fileId}"/>`;
        }
        definedFileIds.add(fileId);
        const metadata = videoFileMetadata.get(clip.url);
        const durationFrames =
          metadata?.durationFrames ?? Math.max(secondsToFrames(clip.duration + clip.offset), 1);
        const pathUrl = encodePathForXml(filename);
        const audioBlock = metadata?.hasAudio
          ? `
                  <audio>
                    <channelcount>2</channelcount>
                  </audio>`
          : '';
        return `<file id="${fileId}">
                  <duration>${durationFrames}</duration>
                  ${buildRateXML()}
                  <name>${escapeXml(filename)}</name>
                  <pathurl>${pathUrl}</pathurl>
                  <timecode>
                    <string>00:00:00:00</string>
                    <frame>0</frame>
                    <displayformat>NDF</displayformat>
                    ${buildRateXML()}
                  </timecode>
                  <media>
                    <video>
                      <duration>${durationFrames}</duration>
                      <samplecharacteristics>
                        <width>${defaultWidth}</width>
                        <height>${defaultHeight}</height>
                      </samplecharacteristics>
                    </video>${audioBlock}
                  </media>
                </file>`;
      };

      const videoTrackItems: string[] = [];
      let videoTimelineFrameCursor = 0;
      clipsToExport.forEach((clip, index) => {
        if (!clip.url) return;
        const clipDurationFrames = Math.max(1, secondsToFrames(clip.duration));
        const clipStartFrames = videoTimelineFrameCursor;
        const clipEndFrames = clipStartFrames + clipDurationFrames;
        const clipInFrames = secondsToFrames(clip.offset);
        const clipOutFrames = clipInFrames + clipDurationFrames;
        videoTimelineFrameCursor += clipDurationFrames;
        const fileId = `video-file-${videoFileIdMap.get(clip.url)}`;
        const filename = mediaFileMap.get(clip.url);
        if (!filename) {
          throw new Error(`Missing media file for clip ${clip.take || clip.shotId}`);
        }
        const fileElement = buildVideoFileElement(clip, fileId, filename);
        const fileDurationFrames =
          videoFileMetadata.get(clip.url)?.durationFrames ?? Math.max(clipOutFrames, clipDurationFrames);
        videoTrackItems.push(`
          <clipitem id="video-clip-${index + 1}">
            <name>${escapeXml(clip.take || filename)}</name>
            <duration>${fileDurationFrames}</duration>
            ${buildRateXML()}
            <start>${clipStartFrames}</start>
            <end>${clipEndFrames}</end>
            <enabled>TRUE</enabled>
            <in>${clipInFrames}</in>
            <out>${clipOutFrames}</out>
            ${fileElement}
            <compositemode>normal</compositemode>
            <comments/>
          </clipitem>`);
      });

      const videoTrackXML = `
        <track>
          ${videoTrackItems.join('\n')}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>`;

      const audioFileMetadata = new Map<string, number>();
      for (const clip of allAudioClips) {
        const sourceFrames = Math.max(1, secondsToFrames(clip.duration + clip.offset));
        const existing = audioFileMetadata.get(clip.url);
        if (!existing || sourceFrames > existing) {
          audioFileMetadata.set(clip.url, sourceFrames);
        }
      }

      const buildAudioFileElement = (clip: (typeof allAudioClips)[number], fileId: string, filename: string) => {
        if (definedFileIds.has(fileId)) {
          return `<file id="${fileId}"/>`;
        }
        definedFileIds.add(fileId);
        const durationFrames =
          audioFileMetadata.get(clip.url) ?? Math.max(1, secondsToFrames(clip.duration + clip.offset));
        const pathUrl = encodePathForXml(filename);
        return `<file id="${fileId}">
                  <duration>${durationFrames}</duration>
                  ${buildRateXML()}
                  <name>${escapeXml(filename)}</name>
                  <pathurl>${pathUrl}</pathurl>
                  <timecode>
                    <string>00:00:00:00</string>
                    <frame>0</frame>
                    <displayformat>NDF</displayformat>
                    ${buildRateXML()}
                  </timecode>
                  <media>
                    <audio>
                      <channelcount>2</channelcount>
                    </audio>
                  </media>
                </file>`;
      };

      const audioTrackXMLParts: string[] = [];
      let audioTrackCounter = 0;
      for (const [trackId, trackClips] of audioClipsByTrack.entries()) {
        const track = tracks.find(t => t.id === trackId);
        if (!track) continue;
        audioTrackCounter += 1;
        const clipItems: string[] = [];
        trackClips.forEach((clip, index) => {
          const clipStartFrames = secondsToFrames(clip.startTime);
          const clipDurationFrames = Math.max(1, secondsToFrames(clip.duration));
          const clipEndFrames = clipStartFrames + clipDurationFrames;
          const clipInFrames = secondsToFrames(clip.offset);
          const clipOutFrames = clipInFrames + clipDurationFrames;
          const fileId = audioAssetIdMap.has(clip.url)
            ? `audio-file-${audioAssetIdMap.get(clip.url)}`
            : `audio-file-${audioTrackCounter}-${index}`;
          const filename = mediaFileMap.get(clip.url);
          if (!filename) {
            throw new Error(`Missing audio media file for track ${track.name} clip ${index + 1}`);
          }
          const fileElement = buildAudioFileElement(clip, fileId, filename);
          const fileDurationFrames = audioFileMetadata.get(clip.url) ?? Math.max(clipOutFrames, clipDurationFrames);
          clipItems.push(`
            <clipitem id="audio-${audioTrackCounter}-${index + 1}">
              <name>${escapeXml(track.name || filename)}</name>
              <duration>${fileDurationFrames}</duration>
              ${buildRateXML()}
              <start>${clipStartFrames}</start>
              <end>${clipEndFrames}</end>
              <enabled>TRUE</enabled>
              <in>${clipInFrames}</in>
              <out>${clipOutFrames}</out>
              ${fileElement}
              <sourcetrack>
                <mediatype>audio</mediatype>
                <trackindex>${audioTrackCounter}</trackindex>
              </sourcetrack>
              <comments/>
            </clipitem>`);
        });

        audioTrackXMLParts.push(`
          <track>
            ${clipItems.join('\n')}
            <enabled>TRUE</enabled>
            <locked>FALSE</locked>
          </track>`);
      }

      if (audioTrackXMLParts.length === 0) {
        audioTrackXMLParts.push(`
          <track>
            <enabled>TRUE</enabled>
            <locked>FALSE</locked>
          </track>`);
      }

      const sequenceName = segment.title || `Scene ${segment.segmentNumber}`;
      const resolveXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence>
    <name>${escapeXml(sequenceName)} (Resolve)</name>
    <duration>${projectDurationFrames}</duration>
    ${buildRateXML()}
    <in>-1</in>
    <out>-1</out>
    <timecode>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
      ${buildRateXML()}
    </timecode>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>${defaultWidth}</width>
            <height>${defaultHeight}</height>
            <pixelaspectratio>square</pixelaspectratio>
            ${buildRateXML()}
          </samplecharacteristics>
        </format>
        ${videoTrackXML}
      </video>
      <audio>
        ${audioTrackXMLParts.join('\n')}
      </audio>
    </media>
  </sequence>
</xmeml>`;

      // Add XML to ZIP
      zip.file('Project.xml', resolveXML);

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `episode-${episodeId}-scene-${segment.segmentNumber}-fcp-export.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsExportingFCPXML(false);
      alert(`Resolve XML exported successfully!`);
      
    } catch (error) {
      console.error('Error exporting FCP XML:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error exporting FCP XML: ${errorMessage}`);
      setIsExportingFCPXML(false);
    }
  };

  const handleRender = async () => {
    if (!avScript || !selectedSegmentId) {
      alert('Please select a scene to render');
      return;
    }

    const ffmpeg = ffmpegRef.current;
    setIsRendering(true);
    setRenderProgress(0);
    
    try {
      // Load FFmpeg if not loaded
      if (!ffmpeg.loaded) {
          try {
            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
          } catch (loadError) {
              console.error('Failed to load FFmpeg:', loadError);
              throw new Error('Failed to load video engine. Please check your internet connection.');
          }
      }

      ffmpeg.on('log', ({ message }) => {
        console.log('FFmpeg log:', message);
        // Estimate progress from time= log
        if (message.includes('time=')) {
           const match = message.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
           if (match) {
             const hours = parseFloat(match[1]);
             const minutes = parseFloat(match[2]);
             const seconds = parseFloat(match[3]);
             const time = hours * 3600 + minutes * 60 + seconds;
             const total = durationRef.current || 1;
             setRenderProgress(Math.min(99, (time / total) * 100));
           }
        }
      });

      const segment = avScript.segments.find(s => s.id === selectedSegmentId);
      if (!segment) {
        throw new Error('Selected segment not found');
      }

      // Prepare clips with edits
      const clipsToRender: Array<{
        type: 'video' | 'image';
        url: string;
        startTime: number;
        duration: number;
        offset: number;
        isMuted?: boolean; // Track if video audio should be muted
      }> = [];

      let currentTime = 0;
      for (const shot of segment.shots) {
        const edit = clipEdits[shot.id] || { duration: shot.duration || 3, offset: 0 };
        const isMuted = mutedShots.has(shot.id);
        
        if (shot.videoUrl) {
          clipsToRender.push({
            type: 'video',
            url: shot.videoUrl,
            startTime: currentTime,
            duration: edit.duration,
            offset: edit.offset || 0,
            isMuted
          });
        } else if (shot.imageUrl) {
          clipsToRender.push({
            type: 'image',
            url: shot.imageUrl,
            startTime: currentTime,
            duration: edit.duration,
            offset: 0
          });
        }
        
        currentTime += edit.duration;
      }

      // Prepare audio clips
      const audioClipsToRender: Array<{
        url: string;
        startTime: number;
        duration: number;
        offset: number;
        volume: number;
      }> = [];

      for (const track of tracks) {
        if (track.isMuted) continue;
        for (const clip of track.clips) {
          const clipEndTime = clip.startTime + clip.duration;
          if (clipEndTime > 0 && clip.startTime < currentTime) {
            audioClipsToRender.push({
              url: clip.url,
              startTime: clip.startTime,
              duration: clip.duration,
              offset: clip.offset || 0,
              volume: (clip.volume || 1) * (track.volume || 1)
            });
          }
        }
      }

      setRenderProgress(5);

      // Download and Write Media Files to FFmpeg FS
      const mediaFiles: string[] = [];
      const audioFiles: string[] = [];

      // Helper to fetch and write
      const writeToFS = async (url: string, filename: string) => {
          try {
              // Try proxy first to avoid CORS
              const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(url)}`;
              const data = await fetchFile(proxyUrl);
              await ffmpeg.writeFile(filename, data);
          } catch (e) {
              console.warn(`Proxy fetch failed for ${url}, trying direct...`, e);
              // Fallback to direct
              const data = await fetchFile(url);
              await ffmpeg.writeFile(filename, data);
          }
      };

      // Write video/image clips
      for (let i = 0; i < clipsToRender.length; i++) {
          const clip = clipsToRender[i];
          const ext = clip.type === 'video' ? (clip.url.match(/\.(mp4|webm|mov)$/i)?.[0] || '.mp4') : '.jpg';
          const filename = `clip-${i}${ext}`;
          await writeToFS(clip.url, filename);
          mediaFiles.push(filename);
          setRenderProgress(5 + (i / clipsToRender.length) * 20);
      }

      // Write audio clips
      for (let i = 0; i < audioClipsToRender.length; i++) {
          const clip = audioClipsToRender[i];
          const ext = clip.url.match(/\.(mp3|wav|aac|m4a)$/i)?.[0] || '.mp3';
          const filename = `audio-${i}${ext}`;
          await writeToFS(clip.url, filename);
          audioFiles.push(filename);
      }

      setRenderProgress(30);

      // Build Filter Complex using CONCAT instead of OVERLAY (More robust for sequences)
      const width = 1920;
      const height = 1080;
      const fps = 24;
      
      const videoFilters: string[] = [];
      const videoLabels: string[] = [];
      
      // Process each visual clip
      for (let i = 0; i < clipsToRender.length; i++) {
        const clip = clipsToRender[i];
        const inputLabel = `${i}:v`;
        const processedLabel = `v${i}`;
        
        // 1. Scale and Pad to 1920x1080
        // 2. Trim/Loop
        // 3. Reset timestamps (PTS)
        
        if (clip.type === 'video') {
          // Video: Scale -> Format -> Trim -> FPS -> Re-timestamp
          // We move trim earlier to reduce processing on unused frames
          // We use setpts=N/FRAME_RATE/TB to force perfect continuous timestamps at 24fps
          // If muted, extract only video stream (no audio)
          const videoFilter = `[${inputLabel}]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,trim=start=${clip.offset}:duration=${clip.duration},fps=${fps},setpts=N/FRAME_RATE/TB[${processedLabel}]`;
          videoFilters.push(videoFilter);
        } else {
          // Image: Scale -> Format -> Loop -> Trim -> FPS -> Re-timestamp
          videoFilters.push(
            `[${inputLabel}]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,loop=loop=-1:size=1:start=0,trim=start=0:duration=${clip.duration},fps=${fps},setpts=N/FRAME_RATE/TB[${processedLabel}]`
          );
        }
        videoLabels.push(`[${processedLabel}]`);
      }
      
      // Concatenate all video segments
      if (videoLabels.length > 0) {
        // unsafe=1 allows concatenation of segments with slightly different properties (fallback)
        videoFilters.push(
            `${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0:unsafe=1[final_video]`
        );
      } else {
          // Fallback if no video (shouldn't happen)
          videoFilters.push(`color=c=black:s=${width}x${height}:d=1:r=${fps}[final_video]`);
      }

      // Build audio filters for separate audio tracks (voice over, SFX, music)
      const audioFilters: string[] = [];
      const audioInputOffset = clipsToRender.length;
      
      if (audioFiles.length > 0) {
        for (let i = 0; i < audioClipsToRender.length; i++) {
          const audioClip = audioClipsToRender[i];
          const volume = audioClip.volume || 1;
          const delayMs = Math.round(audioClip.startTime * 1000);
          const duration = audioClip.duration;
          const offset = audioClip.offset || 0;
          
          const audioInput = `${audioInputOffset + i}:a`;
          const trimmedLabel = `atrimmed${i}`;
          const delayedLabel = `adelayed${i}`;
          
          // Ensure consistent sample rate (44100Hz) to prevent mixing issues
          audioFilters.push(
            `[${audioInput}]aresample=44100,atrim=start=${offset}:end=${offset + duration},asetpts=PTS-STARTPTS,volume=${volume}[${trimmedLabel}]`,
            `[${trimmedLabel}]adelay=${delayMs}|${delayMs}[${delayedLabel}]`
          );
        }
      }

      // Build FFmpeg command
      const ffmpegArgs: string[] = [];
      
      // Inputs
      for (const file of mediaFiles) {
        ffmpegArgs.push('-i', file);
      }
      for (const file of audioFiles) {
        ffmpegArgs.push('-i', file);
      }
      
      // NOTE: Video audio extraction is disabled to avoid errors when videos don't have audio streams
      // FFmpeg fails when filter graphs reference non-existent audio streams (e.g., [0:a] when input 0 has no audio)
      // To enable video audio extraction, we'd need to:
      // 1. Probe each video first to detect if it has audio streams
      // 2. Only build filters for videos that have audio
      // This is complex in the browser environment
      
      // For now, we only use separate audio tracks (voice over, SFX, music)
      // These are added via the audio tracks UI and work reliably
      const allAudioFilters = [...audioFilters];
      
      // Build the final audio mix (only separate audio tracks)
      if (audioClipsToRender.length > 0) {
        const delayedInputs = audioClipsToRender.map((_, i) => `[adelayed${i}]`).join('');
        allAudioFilters.push(`${delayedInputs}amix=inputs=${audioClipsToRender.length}:duration=longest:dropout_transition=2,volume=2[final_audio]`);
      }
      
      // Filters
      const allFilters = [...videoFilters, ...allAudioFilters].join(';');
      ffmpegArgs.push('-filter_complex', allFilters);
      
      // Map outputs
      ffmpegArgs.push('-map', '[final_video]');
      if (allAudioFilters.length > 0 && audioClipsToRender.length > 0) {
        ffmpegArgs.push('-map', '[final_audio]');
      }
      
      // Output settings
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast', // Use ultrafast for client-side speed
        '-tune', 'zerolatency',
        '-profile:v', 'baseline', // Compatible
        '-level', '3.0',
        '-crf', '28', // Slightly lower quality for speed
        '-r', fps.toString(),
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart'
      );
      
      if (audioFilters.length > 0) {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2');
      } else {
        // If no audio tracks, we still need to generate silent audio if we want the file to be valid? 
        // Or just -an (no audio)
        // ffmpegArgs.push('-an');
        // Better: generate silence if user wants "mixed audio" but track is empty
        // But for now -an is safer
        ffmpegArgs.push('-an');
      }
      
      ffmpegArgs.push('-shortest', 'output.mp4');

      console.log('Running FFmpeg:', ffmpegArgs.join(' '));
      
      await ffmpeg.exec(ffmpegArgs);

      setRenderProgress(95);

      // Read output
      const data = await ffmpeg.readFile('output.mp4');
      // Ensure data is in the correct format for Blob
      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `episode-${episodeId}-scene-${segment.segmentNumber}-render.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Cleanup files
      try {
          await ffmpeg.deleteFile('output.mp4');
          for (const file of mediaFiles) await ffmpeg.deleteFile(file);
          for (const file of audioFiles) await ffmpeg.deleteFile(file);
      } catch (cleanupError) {
          console.warn('Cleanup warning:', cleanupError);
      }

      setIsRendering(false);
      setRenderProgress(0);
      alert(`Video rendered successfully!`);
      
    } catch (error) {
      console.error('Error rendering video:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error rendering video: ${errorMessage}`);
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  // Old browser-based rendering (removed)
  const handleRenderOld = async () => {};

  // Audio mixing helper (removed)
  const mixAudioWithVideo = async () => {};

  // Format time as MM:SS:FF (minutes:seconds:frames) at 24 fps
  const formatTime = (seconds: number): string => {
    const totalFrames = Math.floor(seconds * 24); // 24 fps
    const mins = Math.floor(totalFrames / (24 * 60));
    const remainingFrames = totalFrames % (24 * 60);
    const secs = Math.floor(remainingFrames / 24);
    const frames = remainingFrames % 24;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const selectedSegment = avScript?.segments.find(s => s.id === selectedSegmentId);

  return (
    <>
      {/* Delete Track Confirmation Dialog */}
      {trackToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Track?</h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete this track? You can use Ctrl+Z (or Cmd+Z on Mac) to undo recent changes.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDeleteTrack}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTrack}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col h-screen w-screen bg-gray-950 text-white overflow-hidden select-none">
      {/* Header / Toolbar */}
      <div className="border-b border-gray-800 bg-gray-900 shadow-sm px-3 py-3 sm:px-4 sm:h-14 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-gray-800 rounded-lg p-1 border border-gray-700">
             <button
                onClick={handlePlayFromBeginning}
                className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title="Play from Beginning"
             >
                <SkipBack className="w-4 h-4" />
             </button>
             <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`mx-1 p-2 rounded-md transition-all ${isPlaying ? 'bg-red-500/20 text-red-500' : 'bg-indigo-500/20 text-indigo-400'} hover:bg-opacity-30`}
             >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
             </button>
          </div>
          
          <div className="text-base sm:text-xl font-mono text-indigo-400 bg-gray-800 px-3 py-1 rounded border border-gray-700 min-w-[140px] text-center">
            {formatTime(currentTime)} <span className="text-gray-500 text-xs sm:text-base">/ {formatTime(duration)}</span>
          </div>

          <div className="hidden sm:block h-6 w-px bg-gray-800 mx-2" />

          <select 
            value={selectedSegmentId}
            onChange={(e) => {
                const next = e.target.value;
                setSelectedSegmentId(next);
                // Keep AV Script filter aligned when user switches scenes in preview.
                try {
                  window.sessionStorage.setItem(scriptSceneFilterKey, next);
                } catch {
                  // ignore storage errors
                }
                setCurrentTime(0); // Reset to beginning of scene
            }}
            className="bg-gray-800 border border-gray-700 text-xs sm:text-sm rounded-md px-2 sm:px-3 py-1.5 text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {!avScript || avScript.segments.length === 0 ? (
              <option value="">No scenes available</option>
            ) : (
              avScript.segments.map(seg => (
                <option key={seg.id} value={seg.id}>
                  Scene {seg.segmentNumber}: {seg.title}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 sm:gap-3">
          <button
            onClick={handleSaveProject}
            className="flex items-center space-x-1 sm:space-x-2 px-3 py-2 sm:px-4 bg-green-600 hover:bg-green-700 rounded-md transition-all text-xs sm:text-sm font-medium shadow-sm active:transform active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Save Project</span>
          </button>
          <button
            onClick={handleExportFCPXML}
            disabled={isExportingFCPXML || !selectedSegmentId}
            className="flex items-center space-x-1 sm:space-x-2 px-3 py-2 sm:px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed rounded-md transition-all text-xs sm:text-sm font-medium shadow-sm active:transform active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingFCPXML ? 'Exporting...' : 'Export FCP XML'}</span>
          </button>
          <button
            onClick={handleRender}
            disabled={isRendering || !selectedSegmentId}
            className="flex items-center space-x-1 sm:space-x-2 px-3 py-2 sm:px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed rounded-md transition-all text-xs sm:text-sm font-medium shadow-sm active:transform active:scale-95"
          >
            <Video className="w-4 h-4" />
            <span>{isRendering ? `Rendering... ${Math.round(renderProgress)}%` : 'Render Video'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Video Preview Area (Top Half) */}
        <div className="h-[45%] bg-black flex items-center justify-center relative border-b border-gray-800">
          <div className="aspect-video h-full max-h-[400px] w-full max-w-[800px] bg-gray-900 flex items-center justify-center relative shadow-2xl">
             {currentVisualClip ? (
               <>
                 {currentVisualClip.type === 'video' ? (
                   <video 
                     ref={videoRef}
                     className="w-full h-full object-contain"
                     playsInline
                   />
                 ) : currentVisualClip.type === 'image' ? (
                   <img 
                     src={currentVisualClip.url} 
                     alt="Scene Visual" 
                     className="w-full h-full object-contain"
                   />
                 ) : (
                   <div className="text-center p-8">
                     <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 mb-4">
                        <ImageIcon className="w-8 h-8 text-gray-600" />
                     </div>
                     <p className="text-gray-500 font-medium">{currentVisualClip.label || 'No visual content'}</p>
                     <p className="text-gray-700 text-sm mt-2">Take {currentVisualClip.take}</p>
                   </div>
                 )}
                 
                 {/* Overlay Info */}
                 <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm px-3 py-1 rounded text-xs font-mono border border-white/10">
                    Take {currentVisualClip.take}
                    <span className="ml-2 text-gray-400">Length: {formatTime(currentVisualClip.duration)}</span>
                    {currentVisualClip.type === 'video' && currentVisualClip.offset > 0 && (
                      <span className="ml-2 text-yellow-400">Offset: {formatTime(currentVisualClip.offset)}</span>
                    )}
                 </div>
               </>
             ) : (
                <p className="text-gray-700">End of Preview</p>
             )}
          </div>
        </div>

        {/* Zoom Control - Below Video */}
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <span className="text-xs text-gray-400 font-medium">Zoom Timeline</span>
            <input 
              type="range" 
              min="5" 
              max="100" 
              value={scale} 
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-32 sm:w-40 accent-indigo-500 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-gray-500 font-mono min-w-[40px] text-right">{scale}px/s</span>
          </div>
        </div>

        {/* Timeline Area (Bottom Half) */}
        <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden relative min-h-0">
          
          {/* Time Ruler */}
          <div className="h-8 flex-shrink-0 bg-gray-900 border-b border-gray-800 flex items-end overflow-hidden sticky top-0 z-20 shadow-sm ml-48">
             {Array.from({ length: Math.ceil(duration / 5) + 1 }).map((_, i) => (
                <div 
                    key={i} 
                    className="absolute bottom-0 border-l border-gray-700 text-[10px] text-gray-500 pl-1 pb-1"
                    style={{ left: `${i * 5 * scale}px`, height: '60%' }}
                >
                    {formatTime(i * 5)}
                </div>
             ))}
          </div>

          {/* Tracks Container */}
          <div 
            className="flex-1 overflow-y-auto overflow-x-auto relative scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900" 
            ref={timelineRef}
            onClick={(e) => {
              // Don't seek if clicking on resize handles or clips
              if ((e.target as HTMLElement).closest('[data-resize-handle]') || 
                  (e.target as HTMLElement).closest('[data-clip-container]')) {
                return;
              }
              handleSeek(e);
            }}
            style={{ maxHeight: '100%' }}
          >
            <div className="relative min-w-full" style={{ width: `${Math.max(window.innerWidth - 192, duration * scale)}px` }}>
              
              {/* Add Track Button and Compact Mode Toggle */}
              <div className="h-12 flex-shrink-0 border-b border-gray-800 bg-gray-900/30 flex items-center">
                <div className="w-48 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex items-center gap-2 px-4 sticky left-0 z-20 shadow-md">
                  <button
                    onClick={handleAddTrack}
                    className="flex items-center space-x-1.5 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-[10px] font-medium text-white transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Track</span>
                  </button>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] text-gray-400">Compact:</span>
                    <button
                      onClick={() => setIsCompactMode(!isCompactMode)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        isCompactMode ? 'bg-indigo-600' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          isCompactMode ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="flex-1"></div>
              </div>
              
              {/* Visual Track (Editable with trim handles) */}
              <div className={`${isCompactMode ? 'h-12' : 'h-28'} border-b border-gray-800 bg-gray-900/30 flex relative group transition-all duration-200`}>
                <div className="w-48 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex items-center px-4 sticky left-0 z-20 text-xs font-bold text-gray-400 shadow-md">
                  <Film className="w-4 h-4 mr-2 text-indigo-500" />
                  VISUAL
                </div>
                <div className="flex-1 relative h-full bg-gray-900/50">
                  {visualPlaylist.map((clip) => (
                    <div 
                        key={clip.id}
                        data-clip-id={clip.id}
                        data-clip-container="true"
                        className={`absolute top-2 bottom-2 rounded-md overflow-visible border border-white/10 transition-colors cursor-grab active:cursor-grabbing ${
                            currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
                            ? 'ring-2 ring-yellow-500 z-10'
                            : ''
                        } ${
                            selectedVideoClips.has(clip.id) ? 'ring-2 ring-blue-400 z-20' : ''
                        } ${
                            clip.type === 'video' ? 'bg-indigo-900/60' : 
                            clip.type === 'image' ? 'bg-blue-900/60' : 
                            'bg-gray-800/60'
                        }`}
                        style={{
                            left: `${clip.startTime * scale}px`,
                            width: `${clip.duration * scale}px`
                        }}
                        onMouseDown={(e) => {
                          // Make sure we're not clicking on resize handles or buttons
                          const target = e.target as HTMLElement;
                          if (target.closest('[data-resize-handle]') || target.closest('button')) {
                            return;
                          }
                          handleClipMouseDown(e, clip);
                        }}
                        onMouseMove={(e) => {
                          // Update cursor based on position - but only if not over resize handles
                          const target = e.target as HTMLElement;
                          if (target.closest('[data-resize-handle]') || target.closest('button')) {
                            return;
                          }
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const mouseX = e.clientX - rect.left;
                          const clipWidth = rect.width;
                          const edgeThreshold = 8;
                          
                          if ((mouseX < edgeThreshold && clip.type === 'video') || mouseX > clipWidth - edgeThreshold) {
                            (e.currentTarget as HTMLElement).style.cursor = 'ew-resize';
                          } else {
                            (e.currentTarget as HTMLElement).style.cursor = 'grab';
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.cursor = 'default';
                        }}
                    >
                        <div className="h-full p-2 flex flex-col justify-between relative pointer-events-none select-none">
                            <div className="flex items-center space-x-1">
                                {clip.type === 'video' && <Film className="w-3 h-3 text-indigo-300" />}
                                {clip.type === 'image' && <ImageIcon className="w-3 h-3 text-blue-300" />}
                                <span className="text-[10px] font-bold text-white/90 truncate">
                                    {clip.take}
                                </span>
                            </div>
                            <div className="text-[10px] text-white/60 truncate leading-tight">
                                {clip.label}
                            </div>
                        </div>
                        
                        {/* Mute button for video clips - positioned on left side to avoid resize handles */}
                        {clip.type === 'video' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleToggleMute(clip.shotId);
                                }}
                                className="absolute top-1 left-10 p-1 rounded bg-black/50 hover:bg-black/70 transition-colors pointer-events-auto z-50"
                                title={mutedShots.has(clip.shotId) ? "Unmute video" : "Mute video"}
                            >
                                {mutedShots.has(clip.shotId) ? (
                                    <VolumeX className="w-3 h-3 text-red-400" />
                                ) : (
                                    <Volume2 className="w-3 h-3 text-white" />
                                )}
                            </button>
                        )}
                        
                        {/* Left Resize Handle (for video trimming) - Always visible, wider */}
                        {clip.type === 'video' && (
                          <div 
                              data-resize-handle="left"
                              className="absolute top-0 left-0 bottom-0 w-8 cursor-ew-resize z-[60] pointer-events-auto"
                              style={{
                                background: resizeState?.clipId === clip.id && resizeState?.edge === 'left' 
                                  ? 'rgba(99, 102, 241, 0.5)' 
                                  : 'transparent'
                              }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                handleResizeStart(e, clip, 'left');
                              }}
                              onMouseEnter={(e) => {
                                if (!resizeState) {
                                  (e.currentTarget as HTMLElement).style.background = 'rgba(99, 102, 241, 0.3)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (resizeState?.clipId !== clip.id || resizeState?.edge !== 'left') {
                                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                                }
                              }}
                          >
                              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-400 rounded pointer-events-none" />
                          </div>
                        )}
                        
                        {/* Right Resize Handle - Always visible, wider */}
                        <div 
                            data-resize-handle="right"
                            className="absolute top-0 right-0 bottom-0 w-8 cursor-ew-resize z-[60] pointer-events-auto"
                            style={{
                              background: resizeState?.clipId === clip.id && resizeState?.edge === 'right' 
                                ? 'rgba(99, 102, 241, 0.5)' 
                                : 'transparent'
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleResizeStart(e, clip, 'right');
                            }}
                            onMouseEnter={(e) => {
                              if (!resizeState) {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(99, 102, 241, 0.3)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (resizeState?.clipId !== clip.id || resizeState?.edge !== 'right') {
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                              }
                            }}
                        >
                            <div className="absolute top-1/2 right-1/2 transform translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-400 rounded pointer-events-none" />
                        </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audio Tracks */}
              {tracks.map((track, trackIndex) => (
                <div 
                  key={track.id}
                  data-track-id={track.id}
                  className={`${isCompactMode ? 'h-10' : 'h-24'} flex-shrink-0 border-b border-gray-800 bg-gray-900/20 flex relative group ${
                    trackDragState?.trackId === track.id ? 'opacity-50' : ''
                  }`}
                >
                  {/* Track Header */}
                  <div className="w-48 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col justify-center px-4 sticky left-0 z-20 shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      {/* Drag Handle for Track Reordering */}
                      <div
                        className="cursor-move text-gray-500 hover:text-gray-300 mr-1"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTrackDragState({
                            trackId: track.id,
                            startY: e.clientY,
                            originalIndex: trackIndex
                          });
                        }}
                        title="Drag to reorder track"
                      >
                        <GripVertical className="w-3 h-3" />
                      </div>
                      {editingTrackName === track.id ? (
                        <div className="flex items-center space-x-1 flex-1">
                          <input
                            type="text"
                            value={tempTrackName}
                            onChange={(e) => setTempTrackName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveTrackName(track.id);
                              if (e.key === 'Escape') handleCancelTrackName();
                            }}
                            onBlur={() => handleSaveTrackName(track.id)}
                            className="text-xs font-bold text-gray-300 bg-gray-800 border border-gray-700 px-2 py-1 rounded flex-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <>
                          <span 
                            className="text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white flex-1"
                            onClick={() => handleStartRenameTrack(track.id)}
                            title="Click to rename"
                          >
                            {track.name}
                          </span>
                          <div className="flex items-center space-x-1">
                            <button 
                              onClick={() => handleStartRenameTrack(track.id)}
                              className="text-gray-500 hover:text-white transition-colors"
                              title="Rename track"
                            >
                              <Edit3 className="w-3 h-3" />
                      </button>
                            {tracks.length > 1 && (
                              <button 
                                onClick={() => handleDeleteTrack(track.id)}
                                className="text-gray-500 hover:text-red-400 transition-colors"
                                title="Delete track"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                    </div>
                        </>
                      )}
                    </div>
                    {!isCompactMode && (
                    <div>
                       <label className="text-[10px] bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2 py-1.5 rounded text-gray-300 flex items-center justify-center cursor-pointer transition-colors w-full">
                         <Plus className="w-3 h-3 mr-1.5" /> Add Audio
                         <input 
                            type="file" 
                            accept="audio/*" 
                            className="hidden" 
                            onChange={(e) => handleFileUpload(e, track.id)}
                         />
                       </label>
                    </div>
                    )}
                  </div>

                  {/* Track Timeline */}
                  <div className="flex-1 relative h-full bg-gray-900/30">
                     {/* Grid Lines */}
                     {Array.from({ length: Math.ceil(duration / 1) }).map((_, i) => (
                        <div 
                            key={`grid-${i}`}
                            className="absolute top-0 bottom-0 border-l border-gray-800/50 pointer-events-none"
                            style={{ left: `${i * scale}px` }}
                        />
                     ))}

                    {track.clips.map(clip => (
                        <div 
                            key={clip.id}
                            data-clip-id={clip.id}
                            data-clip-container="true"
                            className={`absolute top-2 bottom-2 bg-emerald-900/60 border border-emerald-700/50 rounded-md overflow-visible group/clip hover:bg-emerald-800/70 transition-none cursor-move ${
                                currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
                                ? 'ring-1 ring-emerald-400'
                                : ''
                            } ${audioDragState?.clipId === clip.id ? 'ring-2 ring-yellow-500 z-10' : ''} ${
                                selectedClips.has(clip.id) ? 'ring-2 ring-blue-400 bg-emerald-800/80' : ''
                            }`}
                            style={{
                                left: `${clip.startTime * scale}px`,
                                width: `${clip.duration * scale}px`
                            }}
                            onMouseDown={(e) => {
                              // Don't handle if clicking on volume line or resize handles
                              if ((e.target as HTMLElement).closest('[data-volume-line]') ||
                                  (e.target as HTMLElement).closest('[data-resize-handle]')) {
                                return;
                              }
                              
                              // Multi-select: Ctrl/Cmd+click to toggle selection
                              if (e.ctrlKey || e.metaKey) {
                                e.stopPropagation();
                                setSelectedClips(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(clip.id)) {
                                    newSet.delete(clip.id);
                                  } else {
                                    newSet.add(clip.id);
                                  }
                                  return newSet;
                                });
                                return;
                              }
                              
                              // Shift+click to select range (if we have a previous selection)
                              if (e.shiftKey && selectedClips.size > 0) {
                                e.stopPropagation();
                                // Find all clips between first selected and current
                                const allClips = tracks.flatMap(t => t.clips.map(c => ({ ...c, trackId: t.id })));
                                const selectedClipIds = Array.from(selectedClips);
                                const firstSelected = allClips.find(c => selectedClipIds.includes(c.id));
                                const currentClip = allClips.find(c => c.id === clip.id);
                                
                                if (firstSelected && currentClip) {
                                  const firstIndex = allClips.findIndex(c => c.id === firstSelected.id);
                                  const currentIndex = allClips.findIndex(c => c.id === currentClip.id);
                                  const start = Math.min(firstIndex, currentIndex);
                                  const end = Math.max(firstIndex, currentIndex);
                                  
                                  setSelectedClips(prev => {
                                    const newSet = new Set(prev);
                                    for (let i = start; i <= end; i++) {
                                      newSet.add(allClips[i].id);
                                    }
                                    return newSet;
                                  });
                                }
                                return;
                              }
                              
                              // Single click: clear selection if clicking outside, or select this clip
                              if (!selectedClips.has(clip.id)) {
                                setSelectedClips(new Set([clip.id]));
                              }
                              
                              handleAudioClipMouseDown(e, clip, track.id);
                            }}
                            onMouseMove={(e) => {
                                // Don't change cursor if hovering over volume line or resize handles
                                if ((e.target as HTMLElement).closest('[data-volume-line]') ||
                                    (e.target as HTMLElement).closest('[data-resize-handle]')) {
                                  return;
                                }
                                
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const mouseX = e.clientX - rect.left;
                                const clipWidth = rect.width;
                                const edgeThreshold = 8;
                                
                                if (mouseX < edgeThreshold) {
                                    (e.currentTarget as HTMLElement).style.cursor = 'w-resize'; // Left edge - adjust start/offset
                                } else if (mouseX > clipWidth - edgeThreshold) {
                                    (e.currentTarget as HTMLElement).style.cursor = 'e-resize'; // Right edge - trim end
                                } else {
                                    (e.currentTarget as HTMLElement).style.cursor = 'move'; // Middle - drag clip
                                }
                            }}
                            title={`${clip.name} - Volume: ${Math.round(clip.volume * 100)}%`}
                        >
                            <div className="h-full p-2 relative pointer-events-none">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-medium text-emerald-100 truncate pr-4 flex-1">
                                    {clip.name}
                                    </div>
                                    <div className="flex items-center space-x-1">
                                        <Volume2 className="w-3 h-3 text-emerald-300" />
                                        <span className="text-[9px] text-emerald-200">{Math.round(clip.volume * 100)}%</span>
                                    </div>
                                </div>
                                {/* Audio Waveform Visual */}
                                <div className="absolute bottom-2 left-2 right-2 h-4 opacity-70">
                                    {waveformData[clip.id] ? (
                                        <svg 
                                            viewBox="0 0 100 16" 
                                            preserveAspectRatio="none"
                                            className="w-full h-full"
                                        >
                                            <defs>
                                                <linearGradient id={`waveform-gradient-${clip.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.8 * clip.volume} />
                                                    <stop offset="50%" stopColor="#10b981" stopOpacity={0.6 * clip.volume} />
                                                    <stop offset="100%" stopColor="#059669" stopOpacity={0.4 * clip.volume} />
                                                </linearGradient>
                                            </defs>
                                            <path
                                                d={(() => {
                                                    const samples = waveformData[clip.id];
                                                    const width = 100;
                                                    const height = 16;
                                                    const centerY = height / 2;
                                                    const stepX = width / samples.length;
                                                    
                                                    let path = `M 0 ${centerY}`;
                                                    
                                                    // Draw positive half (top)
                                                    samples.forEach((amplitude, i) => {
                                                        const x = i * stepX;
                                                        const y = centerY - (amplitude * centerY * 0.9); // Scale to 90% to leave some margin
                                                        path += ` L ${x} ${y}`;
                                                    });
                                                    
                                                    // Draw negative half (bottom, mirrored)
                                                    for (let i = samples.length - 1; i >= 0; i--) {
                                                        const x = i * stepX;
                                                        const amplitude = samples[i];
                                                        const y = centerY + (amplitude * centerY * 0.9);
                                                        path += ` L ${x} ${y}`;
                                                    }
                                                    
                                                    path += ` Z`;
                                                    return path;
                                                })()}
                                                fill={`url(#waveform-gradient-${clip.id})`}
                                                stroke="#10b981"
                                                strokeWidth="0.3"
                                            />
                                        </svg>
                                    ) : (
                                        // Loading placeholder
                                        <div className="w-full h-full flex items-center justify-center">
                                            <div className="text-[8px] text-emerald-400/50">Loading waveform...</div>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Volume Line (draggable, like Adobe Audition/Logic Pro) */}
                                {/* Only the line itself is interactive, not the entire area */}
                                <div 
                                    data-volume-line="true"
                                    className="absolute left-0 right-0 pointer-events-auto cursor-ns-resize z-10"
                                    style={{ 
                                        bottom: `${clip.volume * 100}%`,
                                        height: '4px',
                                        marginTop: '-2px'
                                    }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation(); // Prevent clip drag
                                      handleVolumeLineMouseDown(e, clip, track.id);
                                    }}
                                    title={`Drag up/down to adjust volume: ${Math.round(clip.volume * 100)}%`}
                                >
                                    {/* Volume line indicator */}
                                    <div 
                                        className="absolute left-0 right-0 top-0 bottom-0 border-t-2 border-b-2 border-emerald-400 opacity-0 group-hover/clip:opacity-100 transition-opacity shadow-[0_-2px_4px_rgba(16,185,129,0.3)]"
                                        style={{ 
                                            transition: volumeDragState?.clipId === clip.id ? 'none' : 'opacity 0.2s'
                                        }}
                                    >
                                        {/* Volume percentage label */}
                                        <div className="absolute -left-8 -top-2.5 bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/clip:opacity-100 transition-opacity">
                                            {Math.round(clip.volume * 100)}%
                                        </div>
                                    </div>
                                </div>
                                {/* Fill area below line to show volume level (non-interactive) */}
                                <div 
                                    className="absolute left-0 right-0 bottom-0 bg-emerald-500/20 opacity-0 group-hover/clip:opacity-100 transition-opacity pointer-events-none"
                                    style={{ 
                                        height: `${clip.volume * 100}%`,
                                        transition: volumeDragState?.clipId === clip.id ? 'none' : 'opacity 0.2s'
                                    }}
                                />
                                
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveClip(track.id, clip.id);
                                    }}
                                    className="absolute top-1 right-1 text-emerald-300 hover:text-emerald-100 opacity-0 group-hover/clip:opacity-100 transition-opacity pointer-events-auto z-[60]"
                                    title="Remove clip"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                            
                            {/* Left Resize Handle - Adjust Start/Offset */}
                            <div 
                                data-resize-handle="left"
                                className="absolute top-0 left-0 bottom-0 w-8 cursor-w-resize z-30 pointer-events-auto"
                                style={{
                                    background: resizeState?.clipId === clip.id && resizeState?.edge === 'left' 
                                        ? 'rgba(16, 185, 129, 0.5)' 
                                        : 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                    if (!resizeState || (resizeState?.clipId !== clip.id || resizeState?.edge !== 'left')) {
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(16, 185, 129, 0.3)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (resizeState?.clipId !== clip.id || resizeState?.edge !== 'left') {
                                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    }
                                }}
                            >
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-400 rounded pointer-events-none" />
                            </div>
                            
                            {/* Right Resize Handle - Trim End */}
                            <div 
                                data-resize-handle="right"
                                className="absolute top-0 right-0 bottom-0 w-8 cursor-e-resize z-30 pointer-events-auto"
                                style={{
                                    background: resizeState?.clipId === clip.id && resizeState?.edge === 'right' 
                                        ? 'rgba(16, 185, 129, 0.5)' 
                                        : 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                    if (!resizeState || (resizeState?.clipId !== clip.id || resizeState?.edge !== 'right')) {
                                        (e.currentTarget as HTMLElement).style.background = 'rgba(16, 185, 129, 0.3)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (resizeState?.clipId !== clip.id || resizeState?.edge !== 'right') {
                                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                                    }
                                }}
                            >
                                <div className="absolute top-1/2 right-1/2 transform translate-x-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-400 rounded pointer-events-none" />
                            </div>
                        </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Playhead */}
              <div 
                className="absolute top-0 bottom-0 w-px bg-yellow-500 z-30 pointer-events-none shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                style={{ left: `${currentTime * scale + 192}px` }}
              >
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-yellow-500 -ml-[6px] -mt-[1px]" />
                <div className="absolute top-0 bottom-0 w-[1px] bg-yellow-500/50"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Delete Clip Confirmation Dialog */}
    {clipToDelete && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
        <div className="bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-700 text-white max-w-sm mx-auto">
          <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
          <p className="text-gray-300 mb-6">
            Are you sure you want to delete this audio clip? This action cannot be undone directly, but you can use Ctrl+Z (Cmd+Z) to revert.
          </p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={cancelDeleteClip}
              className="px-4 py-2 rounded-md text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteClip}
              className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
