import { useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Episode } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

interface UseRealtimeEpisodeOptions {
  episodeId: string;
  onUpdate: (episode: Episode) => void;
  enabled?: boolean; // Only listen when tab is active
}

/**
 * Hook for real-time episode synchronization
 * - Listens to Firestore changes in real-time (efficient, only sends deltas)
 * - Debounces local saves to avoid excessive writes
 * - Handles conflict resolution (last write wins based on timestamp)
 * - Only active when tab is visible (saves resources)
 */
export function useRealtimeEpisode({ 
  episodeId, 
  onUpdate, 
  enabled = true 
}: UseRealtimeEpisodeOptions) {
  const { user } = useAuth();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  const isLocalChangeRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastLocalSaveTimeRef = useRef<number>(0); // Track when we last saved

  // Convert Firestore data to Episode type
  const convertFirestoreData = useCallback((data: Record<string, unknown>): Episode => {
    const safeToDate = (timestamp: unknown): Date => {
      if (!timestamp) return new Date();
      if (timestamp instanceof Date) return timestamp;
      if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
        return (timestamp as { toDate: () => Date }).toDate();
      }
      if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        return new Date(timestamp);
      }
      return new Date();
    };

    const convertTimestamps = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return obj;
      if (Array.isArray(obj)) {
        return obj.map(convertTimestamps);
      }
      if (typeof obj === 'object' && obj !== null) {
        if ('toDate' in obj && typeof (obj as { toDate: () => Date }).toDate === 'function') {
          return (obj as { toDate: () => Date }).toDate();
        }
        const converted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          converted[key] = convertTimestamps(value);
        }
        return converted;
      }
      return obj;
    };

    return {
      ...data,
      scenes: convertTimestamps(data.scenes) || [],
      createdAt: safeToDate(data.createdAt),
      updatedAt: safeToDate(data.updatedAt),
    } as Episode;
  }, []);

  // Track last update to prevent duplicate updates
  const lastUpdateRef = useRef<string>('');
  // Use ref for callback to avoid dependency issues
  const onUpdateRef = useRef(onUpdate);
  
  // Update ref when callback changes
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Track if listener is ready (to prevent saves before listener is set up)
  const listenerReadyRef = useRef(false);

  // Set up real-time listener
  useEffect(() => {
    if (!enabled || !episodeId) {
      listenerReadyRef.current = false;
      return;
    }

    console.log('🔴 Setting up real-time listener for episode:', episodeId);
    listenerReadyRef.current = false; // Reset until listener is ready

    const episodeRef = doc(db, 'episodes', episodeId);

    // Listen to real-time changes
    // Note: includeMetadataChanges option is not available in v9+ modular SDK
    // The listener will only trigger on actual data changes, which is efficient
    const unsubscribe = onSnapshot(
      episodeRef,
      (snapshot) => {
        // Mark listener as ready after first snapshot
        const isFirstSnapshot = !listenerReadyRef.current;
        if (isFirstSnapshot) {
          listenerReadyRef.current = true;
          console.log('✅ Real-time listener is now ready (first snapshot received)');
        }
        
        if (!snapshot.exists()) {
          console.warn('Episode document does not exist:', episodeId);
          return;
        }

        const data = snapshot.data();
        const episode = convertFirestoreData(data);
        
        // Check if this update is from another user (by comparing lastEditedBy)
        // Note: lastEditedBy is added at runtime in Firestore but not in the Episode type
        const currentUser = user?.id || user?.username || 'unknown';
        const lastEditedBy = (episode as Episode & { lastEditedBy?: string }).lastEditedBy;
        const updateFromAnotherUser = lastEditedBy && 
          lastEditedBy !== currentUser &&
          lastEditedBy !== 'unknown';
        
        // Skip if this is our own local change (we already have it in state)
        // But only skip if the update happened very recently (within 2 seconds of our save)
        const now = Date.now();
        const timeSinceLastSave = now - lastLocalSaveTimeRef.current;
        
        // Always process updates from other users, regardless of isLocalChange flag
        if (updateFromAnotherUser) {
          console.log('👤 Update from another user detected - processing immediately');
          isLocalChangeRef.current = false; // Reset flag to allow processing
        } else if (isLocalChangeRef.current && timeSinceLastSave < 1000) {
          // Only skip if we just saved very recently (within 1 second)
          // This prevents echo of our own saves while still allowing updates from other tabs/users
          console.log('⏭️ Skipping update - this is our own local change (saved', timeSinceLastSave, 'ms ago)');
          return;
        } else {
          // If it's been more than 1 second, process the update
          // This handles cases where:
          // - Another tab/user made a change
          // - We're switching tabs and need to sync
          // - There's a delayed confirmation of our own save
          if (isLocalChangeRef.current) {
            console.log('⚠️ Processing update even though isLocalChange is true (', timeSinceLastSave, 'ms since last save)');
          }
          isLocalChangeRef.current = false; // Reset the flag to allow processing
        }
        
        // Create a hash of the episode to detect if it actually changed
        // Use a more detailed hash that includes segment and shot counts to detect deletions
        const episodeHash = JSON.stringify({
          id: episode.id,
          updatedAt: episode.updatedAt instanceof Date ? episode.updatedAt.getTime() : episode.updatedAt,
          avScriptSegments: episode.avScript?.segments?.length || 0,
          avScriptShots: episode.avScript?.segments?.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0) || 0,
          avScriptSegmentIds: episode.avScript?.segments?.map(s => s.id).sort().join(',') || '',
        });
        
        // Skip if this is the same update we just processed (but allow first snapshot)
        if (!isFirstSnapshot && lastUpdateRef.current === episodeHash) {
          console.log('⏭️ Skipping duplicate update (hash match)');
          return;
        }
        
        if (!isFirstSnapshot) {
          console.log('📊 Update hash changed:', {
            oldHash: lastUpdateRef.current.substring(0, 50),
            newHash: episodeHash.substring(0, 50),
          });
        }
        
        lastUpdateRef.current = episodeHash;
        
        console.log('📥 Received real-time update from Firestore:', {
          episodeId,
          isFirstSnapshot,
          updatedAt: episode.updatedAt,
          hasAvScript: !!episode.avScript,
          avScriptSegments: episode.avScript?.segments?.length || 0,
          avScriptShots: episode.avScript?.segments?.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0) || 0,
          lastEditedBy: lastEditedBy,
          currentUser: currentUser,
          isFromAnotherUser: updateFromAnotherUser,
          isLocalChange: isLocalChangeRef.current,
          timeSinceLastSave: Date.now() - lastLocalSaveTimeRef.current,
        });

        // Notify parent component of the update using ref to get latest callback
        console.log('📤 Calling onUpdate callback with episode data');
        onUpdateRef.current(episode);
      },
      (error) => {
        console.error('❌ Real-time listener error:', error);
      }
    );

    unsubscribeRef.current = unsubscribe;

    // Cleanup on unmount
    return () => {
      console.log('🔴 Cleaning up real-time listener for episode:', episodeId);
      unsubscribe();
      unsubscribeRef.current = null;
      lastUpdateRef.current = ''; // Reset on cleanup
    };
  }, [episodeId, enabled, convertFirestoreData, user?.id, user?.username]); // Include user properties to satisfy exhaustive deps

  // Debounced save function
  const saveEpisode = useCallback(async (updates: Partial<Episode>) => {
    if (!episodeId) return;

    // Wait for listener to be ready before saving (prevents overwriting on initial load)
    if (!listenerReadyRef.current) {
      console.log('⏳ Waiting for real-time listener to be ready before saving...');
      // Wait up to 1 second for listener to be ready (reduced from 2 seconds)
      let attempts = 0;
      while (!listenerReadyRef.current && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (!listenerReadyRef.current) {
        console.warn('⚠️ Listener not ready after 1 second, saving anyway');
      } else {
        console.log('✅ Listener ready, proceeding with save');
      }
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Create a hash of the updates to avoid saving if nothing changed
    // Only hash the avScript part to reduce computation
    // Include more details to catch actual content changes, not just structure
    const updateHash = updates.avScript ? JSON.stringify({
      segmentsCount: updates.avScript.segments?.length || 0,
      totalShots: updates.avScript.segments?.reduce((sum, seg) => sum + (seg.shots?.length || 0), 0) || 0,
      segmentIds: updates.avScript.segments?.map(s => s.id).sort().join(','),
      // Include first 50 chars of each segment's title and first shot's audio to detect content changes
      segmentTitles: updates.avScript.segments?.map(s => s.title?.substring(0, 50) || '').join('|') || '',
      firstShotAudios: updates.avScript.segments?.map(s => s.shots?.[0]?.audio?.substring(0, 50) || '').join('|') || '',
    }) : JSON.stringify(updates);
    
    if (lastSavedRef.current === updateHash) {
      console.log('⏭️ Skipping save - no changes detected (hash match)');
      return;
    }
    
    // Additional check: if hash is different but content is essentially the same, skip
    // This handles cases where only timestamps or metadata changed
    const previousHash = lastSavedRef.current;
    if (previousHash && updateHash.length === previousHash.length) {
      // If hashes are same length, might be a minor change - still save but log it
      console.log('⚠️ Hash changed but same length - might be minor change');
    }

    // Debounce: Wait 10 seconds before saving (significantly increased to reduce writes)
    // This reduces writes from ~4k/hour to ~360/hour (90% reduction)
    return new Promise<void>((resolve, reject) => {
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          console.log('💾 Starting debounced save to Firestore...');
          const saveStartTime = Date.now();
          isLocalChangeRef.current = true; // Mark as local change to skip listener update
          lastLocalSaveTimeRef.current = saveStartTime; // Track when we're saving
          lastSavedRef.current = updateHash;

          // Only send the fields that actually changed (avScript in this case)
          // This reduces the amount of data written to Firestore
          const cleanedUpdates: Record<string, unknown> = {
            updatedAt: serverTimestamp(),
            lastEditedBy: user?.id || user?.username || 'unknown',
            lastEditedAt: serverTimestamp(),
          };
          
          // Only include avScript if it's in the updates (most common case)
          if (updates.avScript) {
            // Convert dates in avScript to Firestore Timestamps
            const dateMap = new Map<string, Date>();
            let pathCounter = 0;

            const jsonString = JSON.stringify(updates.avScript, function(key, value) {
              if (value instanceof Date) {
                const path = `__DATE_${pathCounter++}__`;
                dateMap.set(path, value);
                return { __isDate: true, __path: path };
              }
              if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
                return undefined;
              }
              return value;
            });

            const parsed = JSON.parse(jsonString);

            const convertDates = (obj: unknown): unknown => {
              if (obj === null || obj === undefined) return obj;
              if (Array.isArray(obj)) {
                return obj.map(convertDates);
              }
              if (typeof obj === 'object') {
                const objAny = obj as { __isDate?: boolean; __path?: string };
                if (objAny.__isDate && objAny.__path) {
                  const originalDate = dateMap.get(objAny.__path);
                  if (originalDate) {
                    return Timestamp.fromDate(originalDate);
                  }
                }
                const result: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(obj)) {
                  if (value !== undefined) {
                    result[key] = convertDates(value);
                  }
                }
                return result;
              }
              return obj;
            };

            cleanedUpdates.avScript = convertDates(parsed);
          } else {
            // For other fields, convert them normally
            for (const [key, value] of Object.entries(updates)) {
              if (key !== 'avScript' && value !== undefined) {
                cleanedUpdates[key] = value instanceof Date ? Timestamp.fromDate(value) : value;
              }
            }
          }

          const episodeRef = doc(db, 'episodes', episodeId);
          await updateDoc(episodeRef, cleanedUpdates);

          console.log('💾 Saved episode update to Firestore:', {
            episodeId,
            updateKeys: Object.keys(cleanedUpdates),
          });

          // Reset flag after save completes (with small delay to avoid race condition)
          // But only if enough time has passed to allow other users' updates to come through
          const saveDuration = Date.now() - saveStartTime;
          const resetDelay = Math.max(500, 2000 - saveDuration); // At least 500ms, but ensure 2s total from save start
          setTimeout(() => {
            isLocalChangeRef.current = false;
            console.log('🔄 Reset isLocalChange flag after', resetDelay, 'ms');
          }, resetDelay);

          resolve();
        } catch (error) {
          console.error('❌ Error saving episode:', error);
          isLocalChangeRef.current = false; // Reset on error so we can receive updates
          reject(error);
        }
      }, 10000); // 10 second debounce (significantly increased to reduce Firebase writes from 4k/hour to ~360/hour)
    });
  }, [episodeId, user]);

  // Force immediate save (for critical operations like deletions)
  const saveImmediately = useCallback(async (updates: Partial<Episode>) => {
    if (!episodeId) return;

    // Wait for listener to be ready before saving (prevents overwriting on initial load)
    if (!listenerReadyRef.current) {
      console.log('⏳ Waiting for real-time listener to be ready before immediate save...');
      // Wait up to 1 second for listener to be ready (shorter for immediate saves)
      let attempts = 0;
      while (!listenerReadyRef.current && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (!listenerReadyRef.current) {
        console.warn('⚠️ Listener not ready after 1 second, saving anyway');
      } else {
        console.log('✅ Listener ready, proceeding with immediate save');
      }
    }

    // Clear any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

          try {
            console.log('💾 Starting immediate save to Firestore...');
            const saveStartTime = Date.now();
            isLocalChangeRef.current = true; // Mark as local change to skip listener update
            lastLocalSaveTimeRef.current = saveStartTime; // Track when we're saving
            
            // Create a hash of the updates
            const updateHash = JSON.stringify(updates);
            lastSavedRef.current = updateHash;

      // Only send the fields that actually changed (avScript in this case)
      // This reduces the amount of data written to Firestore
      const cleanedUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
        lastEditedBy: user?.id || user?.username || 'unknown',
        lastEditedAt: serverTimestamp(),
      };
      
      // Only include avScript if it's in the updates (most common case)
      if (updates.avScript) {
        // Convert dates in avScript to Firestore Timestamps
        const dateMap = new Map<string, Date>();
        let pathCounter = 0;

        const jsonString = JSON.stringify(updates.avScript, function(key, value) {
          if (value instanceof Date) {
            const path = `__DATE_${pathCounter++}__`;
            dateMap.set(path, value);
            return { __isDate: true, __path: path };
          }
          if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
            return undefined;
          }
          return value;
        });

        const parsed = JSON.parse(jsonString);

        const convertDates = (obj: unknown): unknown => {
          if (obj === null || obj === undefined) return obj;
          if (Array.isArray(obj)) {
            return obj.map(convertDates);
          }
          if (typeof obj === 'object') {
            const objAny = obj as { __isDate?: boolean; __path?: string };
            if (objAny.__isDate && objAny.__path) {
              const originalDate = dateMap.get(objAny.__path);
              if (originalDate) {
                return Timestamp.fromDate(originalDate);
              }
            }
            const result: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
              if (value !== undefined) {
                result[key] = convertDates(value);
              }
            }
            return result;
          }
          return obj;
        };

        cleanedUpdates.avScript = convertDates(parsed);
      } else {
        // For other fields, convert them normally
        for (const [key, value] of Object.entries(updates)) {
          if (key !== 'avScript' && value !== undefined) {
            cleanedUpdates[key] = value instanceof Date ? Timestamp.fromDate(value) : value;
          }
        }
      }

      const episodeRef = doc(db, 'episodes', episodeId);
      await updateDoc(episodeRef, cleanedUpdates);

            console.log('💾 Immediately saved episode update to Firestore:', {
              episodeId,
              updateKeys: Object.keys(cleanedUpdates),
            });
    
            // Reset flag after save completes (with small delay to avoid race condition)
            // But only if enough time has passed to allow other users' updates to come through
            const saveDuration = Date.now() - saveStartTime;
            const resetDelay = Math.max(500, 2000 - saveDuration); // At least 500ms, but ensure 2s total from save start
            setTimeout(() => {
              isLocalChangeRef.current = false;
              console.log('🔄 Reset isLocalChange flag after immediate save (', resetDelay, 'ms)');
            }, resetDelay);
    } catch (error) {
      console.error('❌ Error immediately saving episode:', error);
      isLocalChangeRef.current = false; // Reset on error so we can receive updates
      throw error;
    }
  }, [episodeId, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    saveEpisode,
    saveImmediately,
  };
}

