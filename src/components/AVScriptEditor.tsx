'use client';

import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult, DraggableProvidedDragHandleProps } from 'react-beautiful-dnd';
import { AVScript, AVSegment, AVShot } from '@/types';
import { 
  Plus, 
  Image as ImageIcon,
  GripVertical,
  X,
  ZoomIn,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import CommentThread from './CommentThread';

interface AVScriptEditorProps {
  episodeId: string;
  avScript?: AVScript;
  onSave: (avScript: AVScript) => void;
}

export function AVScriptEditor({ episodeId, avScript, onSave }: AVScriptEditorProps) {
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

  const { uploadFile } = useS3Upload();

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

  // Auto-save when script changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      console.log('Auto-saving AV Script:', script);
      onSave(script);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [script.segments, script.title, script.version, onSave]);

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
    // Immediate save for new segments
    onSave(updatedScript);

    setNewSegmentTitle('');
    setShowAddSegment(false);
  };

  const handleAddShot = (segmentId: string) => {
    const segment = script.segments.find(s => s.id === segmentId);
    if (!segment) return;

    const newShot: AVShot = {
      id: `shot-${Date.now()}`,
      segmentId,
      shotNumber: 0, // Will be calculated
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
    // Immediate save for new shots
    onSave(updatedScript);
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
    // Immediate save for text field updates
    onSave(updatedScript);
  };

  const handleDeleteSegment = (segmentId: string) => {
    const updatedScript = {
      ...script,
      segments: script.segments.filter(segment => segment.id !== segmentId),
    };
    setScript(updatedScript);
    setDeleteConfirmation(null);
    // Immediate save for deletions
    onSave(updatedScript);
  };

  const handleDeleteShot = (segmentId: string, shotId: string) => {
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
    // Immediate save for deletions
    onSave(updatedScript);
  };

  const handleDeleteImage = (segmentId: string, shotId: string) => {
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
    // Immediate save for deletions
    onSave(updatedScript);
  };


  const handleDragStart = (start: { draggableId: string; source: { droppableId: string; index: number } }) => {
    console.log('Drag started:', start);
  };

  const handleDragEnd = (result: DropResult) => {
    console.log('Drag ended:', result);
    
    if (!result.destination) {
      console.log('No destination, cancelling drag');
      return;
    }

    const { source, destination } = result;
    const segmentId = source.droppableId;

    console.log('Source:', source, 'Destination:', destination, 'SegmentId:', segmentId);

    const segment = script.segments.find(s => s.id === segmentId);
    if (!segment) {
      console.log('Segment not found:', segmentId);
      return;
    }

    console.log('Current shots:', segment.shots.length);

    const shots = Array.from(segment.shots);
    const [reorderedShot] = shots.splice(source.index, 1);
    shots.splice(destination.index, 0, reorderedShot);

    console.log('Reordered shots:', shots.length);

    // Update order and shot numbers
    const updatedShots = shots.map((shot, index) => ({
      ...shot,
      order: index,
      shotNumber: segment.segmentNumber * 100 + (index + 1), // e.g., 101, 102, 103
      updatedAt: new Date(),
    }));

    console.log('Updated shots:', updatedShots.length);

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
    
    console.log('Setting new script with segments:', updatedScript.segments.length);
    setScript(updatedScript);
    // Immediate save for drag-and-drop
    onSave(updatedScript);
  };

  const calculateWordCount = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const calculateRuntime = (text: string): number => {
    // Rough estimate: 3 words per second
    const wordCount = calculateWordCount(text);
    return Math.ceil(wordCount / 3);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatShotNumber = (segmentNumber: number, shotNumber: number): string => {
    return `${segmentNumber}.${shotNumber}`;
  };

  return (
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
            <div className="text-right">
              <div className="text-sm text-gray-500">Total RT</div>
              <div className="text-lg font-semibold text-gray-900">{formatDuration(script.totalRuntime)}</div>
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
            <div className="mb-4 flex items-center justify-between">
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

            {/* Shots Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-200">
                <div className="col-span-1 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Row</div>
                <div className="col-span-3 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Audio</div>
                <div className="col-span-3 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Visual</div>
                <div className="col-span-2 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Image</div>
                <div className="col-span-3 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</div>
              </div>

              <Droppable droppableId={segment.id} renderClone={(provided, snapshot, rubric) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  className="bg-blue-100 shadow-lg transform rotate-2 scale-105 z-50 border-2 border-blue-400"
                >
                  <div className="grid grid-cols-12 border-b border-gray-200 bg-blue-100">
                    <div className="col-span-1 px-4 py-3 flex items-center">
                      <GripVertical className="w-4 h-4 text-blue-600 mr-2" />
                      <div className="text-sm font-medium text-blue-800">
                        {formatShotNumber(segment.segmentNumber, rubric.source.index + 1)}
                      </div>
                    </div>
                    <div className="col-span-3 px-4 py-3">
                      <div className="text-sm text-blue-600">Dragging...</div>
                    </div>
                    <div className="col-span-3 px-4 py-3">
                      <div className="text-sm text-blue-600">Dragging...</div>
                    </div>
                    <div className="col-span-2 px-4 py-3">
                      <div className="text-sm text-blue-600">Dragging...</div>
                    </div>
                    <div className="col-span-3 px-4 py-3">
                      <div className="text-sm text-blue-600">Dragging...</div>
                    </div>
                  </div>
                </div>
              )}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[200px] ${snapshot.isDraggingOver ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : 'bg-white'}`}
                  >
                    {segment.shots.map((shot, shotIndex) => (
                      <Draggable key={shot.id} draggableId={shot.id} index={shotIndex}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`transition-all duration-200 ${snapshot.isDragging ? 'bg-blue-100 shadow-lg transform rotate-2 scale-105 z-50' : 'hover:bg-gray-50'}`}
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
                                  // Immediate save for image uploads
                                  onSave(updatedScript);
                                }
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
                              dragHandleProps={provided.dragHandleProps}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {snapshot.isDraggingOver && segment.shots.length === 0 && (
                      <div className="flex items-center justify-center h-32 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                        <div className="text-center">
                          <div className="text-lg font-medium">Drop shot here</div>
                          <div className="text-sm">Release to add to this segment</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
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
                  Are you sure you want to delete &quot;{deleteConfirmation.title}&quot;?
                </p>
              </div>
            </div>
            
            <div className="mb-4">
              {deleteConfirmation.type === 'segment' && (
                <p className="text-sm text-red-600">
                  This will delete the entire segment and all its shots. This action cannot be undone.
                </p>
              )}
              {deleteConfirmation.type === 'shot' && (
                <p className="text-sm text-red-600">
                  This will delete the shot row. This action cannot be undone.
                </p>
              )}
              {deleteConfirmation.type === 'image' && (
                <p className="text-sm text-red-600">
                  This will remove the image from the shot. This action cannot be undone.
                </p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  if (deleteConfirmation.type === 'segment') {
                    handleDeleteSegment(deleteConfirmation.id);
                  } else if (deleteConfirmation.type === 'shot' && deleteConfirmation.segmentId) {
                    handleDeleteShot(deleteConfirmation.segmentId, deleteConfirmation.id);
                  } else if (deleteConfirmation.type === 'image' && deleteConfirmation.segmentId) {
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
    </DragDropContext>
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
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
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
  dragHandleProps
}: ShotRowProps) {

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  return (
    <div className="grid grid-cols-12 border-b border-gray-200 hover:bg-gray-50">
      {/* Row Number */}
      <div className="col-span-1 px-4 py-3 flex items-center">
        <div {...dragHandleProps}>
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

      {/* Audio */}
      <div className="col-span-3 px-4 py-3">
        <textarea
          value={shot.audio}
          onChange={(e) => onUpdate({ audio: e.target.value })}
          placeholder="Audio..."
          className="w-full h-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
        />
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
                className="w-full h-20 object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => onEnlargeImage(shot.imageUrl!)}
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEnlargeImage(shot.imageUrl!);
                }}
                className="absolute top-1 left-1 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 hover:bg-blue-600"
                title="Enlarge image"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <ImageIcon className="w-6 h-6 text-gray-400 mb-1" />
              <span className="text-xs text-gray-500">Upload</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Duration & Actions */}
      <div className="col-span-3 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={formatDuration(shot.duration)}
              onChange={(e) => {
                // Parse MM:SS format to seconds
                const [mins, secs] = e.target.value.split(':').map(Number);
                if (!isNaN(mins) && !isNaN(secs)) {
                  onUpdate({ duration: mins * 60 + secs });
                }
              }}
              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="00:00"
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
    </div>
  );
}
