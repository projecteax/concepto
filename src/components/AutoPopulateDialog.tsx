'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Loader2,
  Check,
  Sparkles
} from 'lucide-react';
import { ScreenplayData, AVScript, AVSegment, AVShot } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

interface AutoPopulateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAutopopulate: (generatedShots: GeneratedShot[]) => void;
  screenplayData?: ScreenplayData;
  avScript?: AVScript;
  isReadOnly?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface GeneratedShot {
  shotNumber: string; // e.g., "1.1", "2.5"
  uniqueName: string; // e.g., "SC01T02", "SC03T14"
  visual: string;
  audio: string;
  time: string; // Duration in MM:SS:FF format
  segmentNumber: number; // Which segment this shot belongs to
}

export function AutoPopulateDialog({
  isOpen,
  onClose,
  onAutopopulate,
  screenplayData,
  avScript,
  isReadOnly = false,
}: AutoPopulateDialogProps) {
  const { user } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState<'pl' | 'en'>('pl');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedShots, setGeneratedShots] = useState<GeneratedShot[]>([]);
  const [isAutopopulating, setIsAutopopulating] = useState(false);
  const [autopopulateProgress, setAutopopulateProgress] = useState({ current: 0, total: 0 });
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, message: '' });

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setGeneratedShots([]);
      setSelectedLanguage('pl');
      setIsGenerating(false);
      setIsAutopopulating(false);
      setAutopopulateProgress({ current: 0, total: 0 });
      setGenerationProgress({ current: 0, total: 0, message: '' });
    }
  }, [isOpen]);

  // Get script content based on selected language
  const getScriptContent = (): string => {
    if (!screenplayData) return '';
    
    const elements = selectedLanguage === 'en' 
      ? (screenplayData.elementsEN || screenplayData.elements)
      : screenplayData.elements;
    
    if (!elements || elements.length === 0) return '';
    
    // Convert screenplay elements to text format
    let scriptText = '';
    elements.forEach(element => {
      switch (element.type) {
        case 'scene-setting':
          scriptText += `\n[SCENE SETTING]\n${element.content}\n`;
          break;
        case 'character':
          scriptText += `\n${element.content.toUpperCase()}\n`;
          break;
        case 'action':
          scriptText += `${element.content}\n`;
          break;
        case 'dialogue':
          scriptText += `${element.content}\n`;
          break;
        case 'parenthetical':
          scriptText += `(${element.content})\n`;
          break;
        default:
          scriptText += `${element.content}\n`;
      }
    });
    
    return scriptText;
  };

  // Split script into segments with scene context
  const splitScriptIntoSegments = (): Array<{ content: string; startScene: number; startPosition: number; endPosition: number }> => {
    if (!screenplayData) return [];
    
    const elements = selectedLanguage === 'en' 
      ? (screenplayData.elementsEN || screenplayData.elements)
      : screenplayData.elements;
    
    if (!elements || elements.length === 0) return [];
    
    const MAX_SEGMENT_SIZE = 3000; // ~2-3 pages per segment to prevent timeouts
    
    // Build full script to check length
    let fullScript = '';
    elements.forEach(element => {
      switch (element.type) {
        case 'scene-setting':
          fullScript += `\n[SCENE SETTING]\n${element.content}\n`;
          break;
        case 'character':
          fullScript += `\n${element.content.toUpperCase()}\n`;
          break;
        case 'action':
          fullScript += `${element.content}\n`;
          break;
        case 'dialogue':
          fullScript += `${element.content}\n`;
          break;
        case 'parenthetical':
          fullScript += `(${element.content})\n`;
          break;
        default:
          fullScript += `${element.content}\n`;
      }
    });
    
    if (fullScript.length <= MAX_SEGMENT_SIZE) {
      // Single segment - find starting scene number
      let startScene = 1;
      for (const element of elements) {
        if (element.type === 'scene-setting') {
          const sceneMatch = element.content.match(/SCENE[_\s]*(\d+)/i) || 
                            element.content.match(/(\d+)/);
          if (sceneMatch) {
            startScene = parseInt(sceneMatch[1], 10);
            break;
          }
        }
      }
      return [{ content: fullScript, startScene, startPosition: 0, endPosition: elements.length - 1 }];
    }

    // Split into segments while tracking scene boundaries
    const segments: Array<{ content: string; startScene: number; startPosition: number; endPosition: number }> = [];
    let currentSegment = '';
    let currentStartPosition = 0;
    let currentStartScene = 1;
    let sceneCounter = 1;
    let lastSceneNumber = 1;
    
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      let elementText = '';
      let isNewScene = false;
      
      switch (element.type) {
        case 'scene-setting':
          elementText = `\n[SCENE SETTING]\n${element.content}\n`;
          // Try to extract scene number
          const sceneMatch = element.content.match(/SCENE[_\s]*(\d+)/i) || 
                            element.content.match(/(\d+)/);
          if (sceneMatch) {
            const extractedScene = parseInt(sceneMatch[1], 10);
            if (extractedScene > lastSceneNumber) {
              sceneCounter = extractedScene;
              lastSceneNumber = extractedScene;
              isNewScene = true;
            } else {
              // If extracted number is not higher, increment counter
              sceneCounter = lastSceneNumber + 1;
              lastSceneNumber = sceneCounter;
              isNewScene = true;
            }
          } else {
            // If no number found, increment counter
            sceneCounter = lastSceneNumber + 1;
            lastSceneNumber = sceneCounter;
            isNewScene = true;
          }
          break;
        case 'character':
          elementText = `\n${element.content.toUpperCase()}\n`;
          break;
        case 'action':
          elementText = `${element.content}\n`;
          break;
        case 'dialogue':
          elementText = `${element.content}\n`;
          break;
        case 'parenthetical':
          elementText = `(${element.content})\n`;
          break;
        default:
          elementText = `${element.content}\n`;
      }
      
      // Check if adding this element would exceed segment size
      if (currentSegment.length + elementText.length > MAX_SEGMENT_SIZE && currentSegment.length > 0) {
        // Save current segment
        segments.push({
          content: currentSegment.trim(),
          startScene: currentStartScene,
          startPosition: currentStartPosition,
          endPosition: i - 1,
        });
        
        // Start new segment at the new scene
        currentSegment = elementText;
        currentStartPosition = i;
        currentStartScene = isNewScene ? sceneCounter : sceneCounter;
      } else {
        // Add to current segment
        if (currentSegment.length === 0) {
          currentStartScene = sceneCounter;
        }
        currentSegment += elementText;
      }
    }
    
    // Add final segment
    if (currentSegment.trim().length > 0) {
      segments.push({
        content: currentSegment.trim(),
        startScene: currentStartScene,
        startPosition: currentStartPosition,
        endPosition: elements.length - 1,
      });
    }
    
    return segments.filter(s => s.content.trim().length > 0);
  };

  const handleGenerate = async () => {
    if (isReadOnly) return;
    if (!screenplayData) {
      alert('No screenplay data available. Please ensure screenplay data exists.');
      return;
    }
    
    // Check AI access before making API call
    if (user?.aiAccessEnabled === false) {
      alert('You don\'t have permissions to use AI features on this platform.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: 0, message: 'Preparing script...' });
    
    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: `Generate AV script for ${selectedLanguage === 'en' ? 'English' : 'Polish'} script`,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Split script into segments with scene context
      const segments = splitScriptIntoSegments();
      const isLongScript = segments.length > 1;
      
      if (segments.length === 0) {
        throw new Error('No script content found');
      }
      
      if (isLongScript) {
        const totalChars = segments.reduce((sum, s) => sum + s.content.length, 0);
        const progressMsg: ChatMessage = {
          id: `msg-${Date.now() + 0.5}`,
          role: 'assistant',
          content: `Script is long (${Math.ceil(totalChars / 1250)} pages). Processing in ${segments.length} segments...`,
          createdAt: new Date(),
        };
        setMessages(prev => [...prev, progressMsg]);
      }
      
      setGenerationProgress({ current: 0, total: segments.length, message: 'Generating AV script...' });
      
      // Helper function to parse shot number for proper numeric sorting
      const parseShotNumber = (shotNumber: string): [number, number] => {
        const parts = shotNumber.split('.');
        const scene = parseInt(parts[0] || '0', 10) || 0;
        const shot = parseInt(parts[1] || '0', 10) || 0;
        return [scene, shot];
      };
      
      const allShots: Array<GeneratedShot & { segmentIndex: number; shotIndexInSegment: number }> = [];
      
      // Track last shot number and unique name across segments to prevent duplicates
      let lastShotNumber = '0.0';
      let lastSceneNumber = 0;
      let lastTakeNumber = 0; // Track last take number for unique name generation
      const usedUniqueNames = new Set<string>();
      
      // Process each segment
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        setGenerationProgress({ 
          current: i + 1, 
          total: segments.length, 
          message: `Processing segment ${i + 1} of ${segments.length} (Scene ${segment.startScene})...` 
        });
        
        try {
          // Calculate starting shot number for this segment
          // If this is not the first segment, continue from where previous segment ended
          let startingShotNumber = '1.1';
          if (i > 0 && lastShotNumber !== '0.0') {
            const lastParts = lastShotNumber.split('.');
            const lastScene = parseInt(lastParts[0]) || lastSceneNumber;
            const lastShot = parseInt(lastParts[1]) || 0;
            // Continue with next shot number
            startingShotNumber = `${lastScene}.${lastShot + 1}`;
          } else {
            // First segment or no previous shots - start at segment's scene
            startingShotNumber = `${segment.startScene}.1`;
          }
          
          // Build the prompt for this segment with scene context and continuation info
          const prompt = buildPrompt(
            segment.content, 
            segment.startScene, 
            i + 1, 
            segments.length,
            i > 0 ? lastShotNumber : undefined,
            startingShotNumber
          );
          
          // Call API with timeout and retry logic
          let generatedText = '';
          let retries = 2; // Retry up to 2 times
          let lastError: Error | null = null;
          
          while (retries >= 0) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout per segment
              
              const response = await fetch('/api/gemini/generate-av-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt,
                  scriptContent: segment.content,
                  language: selectedLanguage,
                  segmentNumber: i + 1,
                  totalSegments: segments.length,
                  startScene: segment.startScene,
                  lastShotNumber: i > 0 ? lastShotNumber : undefined,
                  startingShotNumber,
                }),
                signal: controller.signal,
              });
              
              clearTimeout(timeoutId);

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
              }

              const data = await response.json();
              generatedText = data.text || '';
              
              if (generatedText) {
                break; // Success, exit retry loop
              } else {
                throw new Error('Empty response from API');
              }
            } catch (fetchError: unknown) {
              lastError = fetchError instanceof Error ? fetchError : new Error('Unknown error');
              
              if (retries > 0) {
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
                retries--;
                setGenerationProgress({
                  current: i + 1,
                  total: segments.length,
                  message: `Retrying segment ${i + 1}... (${retries} retries left)`
                });
              } else {
                throw lastError;
              }
            }
          }
          
          if (!generatedText) {
            throw new Error('Failed to generate content after retries');
          }
          
          // Parse the generated AV script for this segment
          const parsedShots = parseGeneratedAVScript(generatedText);
          
          // Post-process shots to ensure unique numbering and names
          parsedShots.forEach((shot, shotIndex) => {
            // Get current shot number parts
            const shotNumberParts = shot.shotNumber.split('.');
            let sceneNum = parseInt(shotNumberParts[0]) || 1; // Default to scene 1, not segment.startScene
            let shotNum = parseInt(shotNumberParts[1]) || 1;
            
            // Ensure scene number is at least 1 (don't force to segment.startScene)
            if (sceneNum < 1) {
              sceneNum = 1;
            }
            
            // If this is not the first segment, ensure we continue from previous
            if (i > 0) {
              const lastParts = lastShotNumber.split('.');
              const lastScene = parseInt(lastParts[0]) || lastSceneNumber;
              const lastShot = parseInt(lastParts[1]) || 0;
              
              // CRITICAL: For subsequent segments, if Gemini restarted from scene 1, force continuation
              if (sceneNum === 1 && shotIndex === 0 && lastScene > 1) {
                // First shot of segment restarted from scene 1 - force continuation
                sceneNum = lastScene;
                shotNum = lastShot + 1;
                shot.shotNumber = `${sceneNum}.${shotNum}`;
              } else if (sceneNum < lastScene) {
                // Scene went backwards - this shouldn't happen, use last scene
                sceneNum = lastScene;
                shotNum = lastShot + 1;
                shot.shotNumber = `${sceneNum}.${shotNum}`;
              } else if (sceneNum === lastScene && shotNum <= lastShot) {
                // Same scene but shot number didn't advance - fix it
                shotNum = lastShot + 1;
                shot.shotNumber = `${sceneNum}.${shotNum}`;
              }
              // If sceneNum > lastScene, it's a new scene - keep it as is
            } else {
              // First segment - ensure it starts at scene 1 minimum
              if (sceneNum < 1) {
                sceneNum = 1;
                shot.shotNumber = `${sceneNum}.${shotNum}`;
              }
              // Don't force to segment.startScene - let Gemini's scene detection work
            }
            
            // Ensure unique names are unique across all segments
            let uniqueName = shot.uniqueName;
            if (usedUniqueNames.has(uniqueName)) {
              // Generate a new unique name
              // Extract scene and take from unique name (e.g., SC01T02 -> scene 1, take 2)
              const nameMatch = uniqueName.match(/SC(\d+)T(\d+)/i);
              if (nameMatch) {
                const nameScene = parseInt(nameMatch[1], 10);
                const nameTake = parseInt(nameMatch[2], 10);
                lastTakeNumber = Math.max(lastTakeNumber, nameTake);
                // Use current scene number and increment take
                lastTakeNumber += 1;
                uniqueName = `SC${sceneNum.toString().padStart(2, '0')}T${lastTakeNumber.toString().padStart(2, '0')}`;
              } else {
                // Fallback: use scene and shot number
                uniqueName = `SC${sceneNum.toString().padStart(2, '0')}T${shotNum.toString().padStart(2, '0')}`;
              }
              // Keep trying until we get a unique name
              let counter = 1;
              while (usedUniqueNames.has(uniqueName)) {
                uniqueName = `SC${sceneNum.toString().padStart(2, '0')}T${(lastTakeNumber + counter).toString().padStart(2, '0')}`;
                counter++;
              }
              shot.uniqueName = uniqueName;
            }
            usedUniqueNames.add(uniqueName);
            
            // Update tracking variables
            lastShotNumber = shot.shotNumber;
            lastSceneNumber = sceneNum;
            
            // Extract take number from unique name for tracking
            const takeMatch = shot.uniqueName.match(/T(\d+)/i);
            if (takeMatch) {
              const takeNum = parseInt(takeMatch[1], 10);
              lastTakeNumber = Math.max(lastTakeNumber, takeNum);
            }
            
            shot.segmentNumber = sceneNum;
            
            allShots.push({
              ...shot,
              segmentIndex: i, // Track which segment this came from
              shotIndexInSegment: shotIndex, // Track order within segment
            });
          });
          
        } catch (segmentError: unknown) {
          const errorMessage = segmentError instanceof Error ? segmentError.message : 'Unknown error';
          console.error(`Error processing segment ${i + 1}:`, segmentError);
          
          // Continue with other segments even if one fails
          const errorMsg: ChatMessage = {
            id: `msg-${Date.now() + i}`,
            role: 'assistant',
            content: `Warning: Error processing segment ${i + 1}: ${errorMessage}. Continuing with other segments...`,
            createdAt: new Date(),
          };
          setMessages(prev => [...prev, errorMsg]);
        }
      }
      
      // Sort shots to maintain script order:
      // 1. By segment index (segments are in script order)
      // 2. By shot index within segment (maintains order from generation)
      // 3. By shot number as fallback (numeric comparison)
      allShots.sort((a, b) => {
        // Primary: segment order
        if (a.segmentIndex !== b.segmentIndex) {
          return a.segmentIndex - b.segmentIndex;
        }
        // Secondary: order within segment (as generated)
        if (a.shotIndexInSegment !== b.shotIndexInSegment) {
          return a.shotIndexInSegment - b.shotIndexInSegment;
        }
        // Tertiary: by shot number (proper numeric comparison)
        const [aScene, aShot] = parseShotNumber(a.shotNumber);
        const [bScene, bShot] = parseShotNumber(b.shotNumber);
        if (aScene !== bScene) {
          return aScene - bScene;
        }
        return aShot - bShot; // Numeric comparison ensures 1.2 < 1.10
      });
      
      // Final pass: Ensure all shot numbers are sequential and unique names are unique
      // IMPORTANT: Respect scene changes - don't force all shots into one scene
      const finalShots: GeneratedShot[] = [];
      const uniqueNameSet = new Set<string>();
      const shotNumberSet = new Set<string>(); // Track used shot numbers
      let currentScene = 0;
      let currentShotInScene = 0;
      const takeCounterMap = new Map<number, number>(); // Track take counters per scene
      
      allShots.forEach((shot) => {
        const shotNumberParts = shot.shotNumber.split('.');
        let sceneNum = parseInt(shotNumberParts[0]) || 1;
        let shotNum = parseInt(shotNumberParts[1]) || 1;
        
        // Ensure scene number is at least 1
        if (sceneNum < 1) {
          sceneNum = 1;
        }
        
        // Detect if we're in a new scene
        if (sceneNum !== currentScene) {
          // New scene detected - reset shot counter for this scene
          currentScene = sceneNum;
          currentShotInScene = 0;
        }
        
        // Ensure sequential shot numbering within scene (but respect scene changes)
        const shotKey = `${sceneNum}.${shotNum}`;
        if (shotNumberSet.has(shotKey)) {
          // Duplicate found - use next available shot number in this scene
          currentShotInScene += 1;
          shotNum = currentShotInScene;
          shot.shotNumber = `${sceneNum}.${shotNum}`;
        } else {
          // Use the shot number, but ensure it's sequential within the scene
          if (shotNum <= currentShotInScene && currentScene === sceneNum) {
            // Shot number didn't advance in same scene - fix it
            currentShotInScene += 1;
            shotNum = currentShotInScene;
            shot.shotNumber = `${sceneNum}.${shotNum}`;
          } else {
            // Shot number is valid - update counter
            currentShotInScene = shotNum;
          }
        }
        shotNumberSet.add(shot.shotNumber);
        
        // Ensure unique names are unique and follow proper format
        let uniqueName = shot.uniqueName;
        
        // Validate and fix unique name format
        const nameMatch = uniqueName.match(/SC(\d+)T(\d+)/i);
        if (!nameMatch) {
          // Invalid format - generate new one
          if (!takeCounterMap.has(sceneNum)) {
            takeCounterMap.set(sceneNum, 0);
          }
          const takeCounter = takeCounterMap.get(sceneNum)! + 1;
          takeCounterMap.set(sceneNum, takeCounter);
          uniqueName = `SC${sceneNum.toString().padStart(2, '0')}T${takeCounter.toString().padStart(2, '0')}`;
        } else {
          // Extract scene and take from name
          const nameScene = parseInt(nameMatch[1], 10);
          const nameTake = parseInt(nameMatch[2], 10);
          
          // Ensure scene number matches
          if (nameScene !== sceneNum) {
            // Scene mismatch - regenerate with correct scene
            if (!takeCounterMap.has(sceneNum)) {
              takeCounterMap.set(sceneNum, 0);
            }
            const takeCounter = takeCounterMap.get(sceneNum)! + 1;
            takeCounterMap.set(sceneNum, takeCounter);
            uniqueName = `SC${sceneNum.toString().padStart(2, '0')}T${takeCounter.toString().padStart(2, '0')}`;
          } else {
            // Update take counter
            takeCounterMap.set(sceneNum, Math.max(takeCounterMap.get(sceneNum) || 0, nameTake));
          }
        }
        
        // Check for duplicate unique names
        if (uniqueNameSet.has(uniqueName)) {
          // Generate new unique name
          if (!takeCounterMap.has(sceneNum)) {
            takeCounterMap.set(sceneNum, 0);
          }
          let takeCounter = takeCounterMap.get(sceneNum)! + 1;
          do {
            uniqueName = `SC${sceneNum.toString().padStart(2, '0')}T${takeCounter.toString().padStart(2, '0')}`;
            takeCounter++;
          } while (uniqueNameSet.has(uniqueName));
          takeCounterMap.set(sceneNum, takeCounter - 1);
        }
        uniqueNameSet.add(uniqueName);
        shot.uniqueName = uniqueName;
        
        shot.segmentNumber = sceneNum;
        
        // Remove tracking fields
        const { segmentIndex, shotIndexInSegment, ...finalShot } = shot;
        finalShots.push(finalShot);
      });
      
      // Final sort by shot number (numeric) to ensure proper order
      finalShots.sort((a, b) => {
        const [aScene, aShot] = parseShotNumber(a.shotNumber);
        const [bScene, bShot] = parseShotNumber(b.shotNumber);
        if (aScene !== bScene) {
          return aScene - bScene;
        }
        return aShot - bShot; // Numeric comparison ensures 1.2 < 1.10
      });
      
      setGeneratedShots(finalShots);
      setGenerationProgress({ current: segments.length, total: segments.length, message: 'Complete!' });

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + segments.length}`,
        role: 'assistant',
        content: `Generated ${finalShots.length} shots from ${segments.length} segment${segments.length > 1 ? 's' : ''}. Review the table below and click "Autopopulate AV Script" when ready.`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate AV script. Please try again.';
      console.error('Error generating AV script:', error);
      
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1000}`,
        role: 'assistant',
        content: `Error: ${errorMessage}. ${errorMessage.includes('aborted') || errorMessage.includes('timeout') ? 'The script may be too long. Try generating in smaller sections.' : ''}`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
      setGenerationProgress({ current: 0, total: 0, message: '' });
    }
  };

  const buildPrompt = (
    scriptContent: string, 
    startScene: number, 
    segmentNumber?: number, 
    totalSegments?: number,
    lastShotNumber?: string,
    startingShotNumber?: string
  ): string => {
    let segmentInfo = '';
    
    if (segmentNumber && totalSegments && totalSegments > 1) {
      if (segmentNumber === 1) {
        segmentInfo = `\n\nIMPORTANT: This is segment ${segmentNumber} of ${totalSegments}. You MUST start from SCENE 1 (shot 1.1) and detect scene changes in the script. When you see [SCENE SETTING] markers, increment the scene number (1.1, 1.2... then 2.1, 2.2... when scene 2 starts).\n`;
      } else {
        segmentInfo = `\n\nCRITICAL: This is segment ${segmentNumber} of ${totalSegments}. The previous segment ended at shot ${lastShotNumber}. You MUST continue from shot ${startingShotNumber || lastShotNumber} - DO NOT restart from scene 1 or 1.1. Continue the exact numbering sequence. If the script shows scene changes, increment scene numbers accordingly, but start from where the previous segment ended (${lastShotNumber}).\n`;
      }
    } else {
      segmentInfo = `\n\nIMPORTANT: You MUST start from SCENE 1 (shot 1.1) and detect scene changes in the script. When you see [SCENE SETTING] markers, increment the scene number (1.1, 1.2... then 2.1, 2.2... when scene 2 starts).\n`;
    }
    
    return `Create a comprehensive AV script based on provided script using two text boxes:${segmentInfo}

VISUAL: Shot description of what's on the shot, camera movements, framing, distances, placement on the set. We need this to be accurate and detailed so camera man won't need to figure out how to make a shot.

AUDIO: Dialogues, music, SFX. Additionally for each dialogue we need [] brackets with guidelines for elevenlabs like for example [laughing] [whispers] etc. These tags should be included in the audio text.

Additionally we need preferred timing to each shot.

CRITICAL REQUIREMENTS:
1. Maintain the EXACT order of the script. Shots must appear in the same sequence as they appear in the provided script content.
2. DETECT SCENE CHANGES: When you see [SCENE SETTING] markers or scene transitions in the script, you MUST change the scene number in shot numbers. Start from scene 1 and increment when scenes change (1.1, 1.2, 1.3... then 2.1, 2.2, 2.3... when scene 2 starts, etc.).
3. Time format: MM:SS:FF where MM=minutes, SS=seconds, FF=frames (0-23 for 24fps). Example: 00:03:21 means 3 seconds and 21 frames.
4. SHOT LENGTH STANDARDS: Follow industry standards for shot durations. Minimum shot length should be at least 2-3 seconds (00:02:00 to 00:03:00). Very short shots (under 1 second) are rare and should only be used for quick cuts or special effects. Most dialogue shots should be 3-8 seconds, action shots 2-5 seconds, and establishing shots 5-10 seconds. Avoid shots shorter than 1 second (00:01:00) unless absolutely necessary for the narrative.

Output format should be:
Shot number (ordered like we have in AV script 1.1 1.2 1.3... then 2.1 2.2 2.3 when scene changes) | unique name (SC01T01 SC01T02 SC02T01 etc - first number is scene, second is take) | Audio | Visual | Time (MM:SS:FF format, frames 0-23)

Example:
1.1 | SC01T01 | [laughing] Hello there! | Wide shot of character entering room, camera static | 00:00:12
1.2 | SC01T02 | [whispers] What's that? | Close-up of character's face, camera slowly zooms in | 00:00:08
2.1 | SC02T01 | [normal] New scene dialogue | Medium shot of different location | 00:00:15

Script content:
${scriptContent}

Generate the complete AV script following this format exactly. Maintain the sequential order from the script above and DETECT all scene changes.`;
  };

  const parseGeneratedAVScript = (text: string): GeneratedShot[] => {
    const shots: GeneratedShot[] = [];
    const lines = text.split('\n').filter(line => line.trim());
    
    // Track current scene to ensure proper scene detection
    let currentScene = 1;

    lines.forEach((line, index) => {
      // Try to parse the format: "1.1 | SC01T01 | Audio | Visual | Time"
      const parts = line.split('|').map(p => p.trim());
      
      // Helper function to check if content is truly empty (whitespace, empty string, etc.)
      const isEmpty = (str: string): boolean => {
        return !str || str.trim().length === 0 || str.trim() === '-' || str.trim() === 'N/A';
      };
      
      if (parts.length >= 5) {
        const shotNumber = parts[0].trim();
        const uniqueName = parts[1].trim();
        const audio = parts[2].trim();
        const visual = parts[3].trim();
        let time = parts[4].trim();
        
        // STRICT: Skip empty shots - must have at least audio OR visual content
        if (isEmpty(audio) && isEmpty(visual)) {
          return; // Skip this shot completely
        }
        
        // Also skip if shot number or unique name is missing
        if (!shotNumber || !uniqueName) {
          return; // Skip invalid shots
        }
        
        // Validate and fix time format (MM:SS:FF, frames 0-23)
        time = validateTimeFormat(time);
        
        // Extract scene number from shot number (e.g., "1.1" -> scene 1)
        const segmentMatch = shotNumber.match(/^(\d+)\./);
        let sceneNumber = segmentMatch ? parseInt(segmentMatch[1], 10) : currentScene;
        
        // Ensure scene number is valid (at least 1)
        if (sceneNumber < 1) {
          sceneNumber = currentScene;
        } else {
          currentScene = sceneNumber; // Update current scene
        }
        
        shots.push({
          shotNumber,
          uniqueName,
          audio: audio || '', // Ensure at least empty string
          visual: visual || '', // Ensure at least empty string
          time,
          segmentNumber: sceneNumber,
        });
      } else if (parts.length >= 3) {
        // Try alternative format without time
        const shotNumber = parts[0].trim();
        const uniqueName = parts[1].trim();
        const audio = parts[2].trim();
        const visual = parts.length >= 4 ? parts[3].trim() : '';
        let time = parts.length >= 5 ? parts[4].trim() : '00:03:00'; // Default to 3 seconds
        
        // STRICT: Skip empty shots - must have at least audio OR visual content
        if (isEmpty(audio) && isEmpty(visual)) {
          return; // Skip this shot completely
        }
        
        // Also skip if shot number or unique name is missing
        if (!shotNumber || !uniqueName) {
          return; // Skip invalid shots
        }
        
        // Validate and fix time format
        time = validateTimeFormat(time);
        
        const segmentMatch = shotNumber.match(/^(\d+)\./);
        let sceneNumber = segmentMatch ? parseInt(segmentMatch[1], 10) : currentScene;
        
        // Ensure scene number is valid (at least 1)
        if (sceneNumber < 1) {
          sceneNumber = currentScene;
        } else {
          currentScene = sceneNumber; // Update current scene
        }
        
        shots.push({
          shotNumber,
          uniqueName,
          audio: audio || '', // Ensure at least empty string
          visual: visual || '', // Ensure at least empty string
          time,
          segmentNumber: sceneNumber,
        });
      }
    });
    
    // Final filter: Remove any empty shots that might have slipped through
    return shots.filter(shot => {
      const hasAudio = shot.audio && shot.audio.trim().length > 0;
      const hasVisual = shot.visual && shot.visual.trim().length > 0;
      return hasAudio || hasVisual; // Must have at least one
    });
  };
  
  // Helper function to validate and fix time format (MM:SS:FF, frames 0-23)
  const validateTimeFormat = (time: string): string => {
    // Try to parse MM:SS:FF format
    const timeMatch = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (timeMatch) {
      const minutes = parseInt(timeMatch[1], 10);
      const seconds = parseInt(timeMatch[2], 10);
      let frames = parseInt(timeMatch[3], 10);
      
      // Ensure frames are 0-23 (24fps)
      if (frames > 23) {
        // Convert excess frames to seconds
        const extraSeconds = Math.floor(frames / 24);
        frames = frames % 24;
        const newSeconds = seconds + extraSeconds;
        const result = `${minutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        return enforceMinimumShotLength(result);
      }
      
      return enforceMinimumShotLength(time); // Valid format, but check minimum length
    }
    
    // Try to parse alternative formats and convert
    const altMatch = time.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (altMatch) {
      const minutes = parseInt(altMatch[1], 10);
      const seconds = parseInt(altMatch[2], 10);
      let frames = parseInt(altMatch[3], 10);
      
      if (frames > 23) {
        const extraSeconds = Math.floor(frames / 24);
        frames = frames % 24;
        const newSeconds = seconds + extraSeconds;
        const result = `${minutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
        return enforceMinimumShotLength(result);
      }
      
      const result = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
      return enforceMinimumShotLength(result);
    }
    
    // If format is completely invalid, return a reasonable default
    // But don't force 2 seconds on all shots - only when truly needed
    return '00:03:00'; // Default to 3 seconds for invalid format (more reasonable)
  };
  
  // Helper function to enforce minimum shot length (2 seconds minimum)
  // Only applies minimum if shot is actually too short, doesn't override valid times
  const enforceMinimumShotLength = (time: string): string => {
    const timeMatch = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      // Only return default if we can't parse - don't force 2 seconds on valid times
      return '00:02:00'; // Default minimum for invalid format
    }
    
    const minutes = parseInt(timeMatch[1], 10);
    const seconds = parseInt(timeMatch[2], 10);
    const frames = parseInt(timeMatch[3], 10);
    
    // Calculate total duration in frames (24fps)
    const totalFrames = (minutes * 60 + seconds) * 24 + frames;
    const minimumFrames = 2 * 24; // 2 seconds minimum = 48 frames
    
    // Only enforce minimum if shot is actually too short (less than 2 seconds)
    // Don't change valid shot lengths
    if (totalFrames > 0 && totalFrames < minimumFrames) {
      return '00:02:00';
    }
    
    // Return original time if it's valid and acceptable
    return time;
  };

  const handleAutopopulate = async () => {
    if (isReadOnly) return;
    if (generatedShots.length === 0) {
      alert('No generated shots to populate. Please generate AV script first.');
      return;
    }

    setIsAutopopulating(true);
    setAutopopulateProgress({ current: 0, total: generatedShots.length });

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setAutopopulateProgress(prev => {
          if (prev.current < prev.total) {
            return { ...prev, current: prev.current + 1 };
          }
          return prev;
        });
      }, 50); // Update every 50ms for smooth progress

      // Call the parent handler which will populate the AV script
      await onAutopopulate(generatedShots);
      
      // Ensure progress reaches 100%
      clearInterval(progressInterval);
      setAutopopulateProgress({ current: generatedShots.length, total: generatedShots.length });
      
      // Show success message
      const successMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Successfully populated ${generatedShots.length} shots into AV script!`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, successMsg]);
    } catch (error) {
      console.error('Error autopopulating:', error);
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Error: Failed to autopopulate AV script. ${error instanceof Error ? error.message : 'Unknown error'}`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAutopopulating(false);
      setTimeout(() => {
        setAutopopulateProgress({ current: 0, total: 0 });
      }, 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] flex flex-col m-0 sm:m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b">
          <h2 className="text-lg sm:text-xl font-semibold">Auto-populate AV Script</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {/* Language Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as 'pl' | 'en')}
              disabled={isGenerating || generatedShots.length > 0 || isReadOnly}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="pl">Polish</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Generate Button */}
          {generatedShots.length === 0 && (
            <div className="mb-4">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !screenplayData || isReadOnly}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {generationProgress.message || 'Generating AV Script...'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate AV Script
                  </>
                )}
              </button>
              {/* Generation Progress */}
              {isGenerating && generationProgress.total > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      {generationProgress.message}
                    </span>
                    <span className="text-sm text-gray-500">
                      {generationProgress.current} / {generationProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat Messages */}
          {messages.length > 0 && (
            <div className="mb-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Generated Shots Table */}
          {generatedShots.length > 0 && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">Generated AV Script</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Shot #</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Unique Name</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Audio</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Visual</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {generatedShots.map((shot, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono">{shot.shotNumber}</td>
                          <td className="px-4 py-2 font-mono">{shot.uniqueName}</td>
                          <td className="px-4 py-2">{shot.audio}</td>
                          <td className="px-4 py-2">{shot.visual}</td>
                          <td className="px-4 py-2 font-mono">{shot.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {isAutopopulating && autopopulateProgress.total > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Populating shots...
                </span>
                <span className="text-sm text-gray-500">
                  {autopopulateProgress.current} / {autopopulateProgress.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(autopopulateProgress.current / autopopulateProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          {generatedShots.length > 0 && (
            <button
              onClick={handleAutopopulate}
              disabled={isAutopopulating || isReadOnly}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAutopopulating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Populating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Autopopulate AV Script
                </>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

