'use client';

import React, { useState, useEffect } from 'react';
import { GeneralIdea, Show } from '@/types';
import { 
  Lightbulb, 
  Upload, 
  Trash2, 
  Edit3,
  Save,
  X,
  Image as ImageIcon,
  Tag,
  Plus,
  MessageCircle
} from 'lucide-react';
import { useS3Upload } from '@/hooks/useS3Upload';
import CommentThread from './CommentThread';
import { useComments } from '@/contexts/CommentContext';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';

interface GeneralIdeaDetailProps {
  show: Show;
  idea: GeneralIdea;
  onBack: () => void;
  onSave: (idea: GeneralIdea) => void;
  isReadOnly?: boolean;
  canComment?: boolean;
}

export function GeneralIdeaDetail({
  show,
  idea,
  onBack,
  onSave,
  isReadOnly = false,
  canComment = true,
}: GeneralIdeaDetailProps) {
  const readOnly = isReadOnly;
  const allowComment = canComment;
  const basePath = useBasePath();
  const headerIsDark = Boolean(show.coverImageUrl);
  const [isEditing, setIsEditing] = useState(false);
  
  // Form states
  const [name, setName] = useState(idea.name);
  const [description, setDescription] = useState(idea.description || '');
  const [tags, setTags] = useState(idea.tags.join(', '));
  
  // Image states
  const [images, setImages] = useState<string[]>(idea.images || []);

  // Sync images state when idea changes
  useEffect(() => {
    setImages(idea.images || []);
  }, [idea.images]);
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, { progress: number; error?: string }>>(new Map());
  
  const { uploadFile } = useS3Upload();
  const { getCommentsForTarget } = useComments();
  
  // Get comment thread for this idea
  const commentThread = getCommentsForTarget('general-idea', idea.id);
  const commentCount = commentThread?.comments.length || 0;

  // Handle ESC key to close image modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedImage) {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedImage]);

  const handleSave = () => {
    const tagArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    
    const updatedIdea: GeneralIdea = {
      ...idea,
      name: name.trim(),
      description: description.trim(),
      tags: tagArray,
      images: images,
      updatedAt: new Date(),
    };
    
    onSave(updatedIdea);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setName(idea.name);
    setDescription(idea.description || '');
    setTags(idea.tags.join(', '));
    setImages(idea.images || []);
    setIsEditing(false);
  };

  const handleImageUpload = async (file: File) => {
    const uploadId = `upload-${Date.now()}`;
    setUploadingFiles(prev => new Map(prev).set(uploadId, { progress: 0 }));

    try {
      console.log('🔄 Starting image upload for general idea:', file.name);
      const result = await uploadFile(file, 'general-ideas');
      console.log('📁 Upload result:', result);
      const url = result?.url;

      if (url) {
        console.log('✅ Upload successful, URL:', url);
        const newImages = [...images, url];
        setImages(newImages);
        
        // Auto-save the updated images
        const updatedIdea: GeneralIdea = {
          ...idea,
          images: newImages,
          updatedAt: new Date(),
        };
        console.log('💾 Saving updated idea with images:', updatedIdea.images);
        onSave(updatedIdea);
      } else {
        console.error('❌ No URL returned from upload');
      }
    } catch (error) {
      console.error('❌ Image upload failed:', error);
      setUploadingFiles(prev => new Map(prev).set(uploadId, { 
        progress: 0, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      }));
    } finally {
      setUploadingFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(uploadId);
        return newMap;
      });
    }
  };

  const handleRemoveImage = (imageUrl: string) => {
    const newImages = images.filter(img => img !== imageUrl);
    setImages(newImages);
    
    // Auto-save the updated images
    const updatedIdea: GeneralIdea = {
      ...idea,
      images: newImages,
      updatedAt: new Date(),
    };
    onSave(updatedIdea);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows/${show.id}/general-ideas`}
        items={[
          { label: show.name, href: `${basePath}/shows/${show.id}` },
          { label: 'General Ideas', href: `${basePath}/shows/${show.id}/general-ideas` },
          { label: idea.name || 'Idea' },
        ]}
        subtitle="General idea"
        actions={
          !readOnly ? (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleCancel}
                    className={`px-3 py-2 rounded-lg ${headerIsDark ? 'text-white/90 hover:text-white hover:bg-white/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSave}
                    className={`px-3 py-2 rounded-lg ${headerIsDark ? 'bg-white/90 text-gray-900 hover:bg-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                    title="Save"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className={`px-3 py-2 rounded-lg ${headerIsDark ? 'text-white/90 hover:text-white hover:bg-white/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                  title="Edit"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : null
        }
        title={
          isEditing ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full text-2xl sm:text-3xl font-bold bg-transparent border-b focus:outline-none ${
                headerIsDark ? 'border-white/40 focus:border-white text-white' : 'border-border focus:border-primary text-foreground'
              }`}
              autoFocus
            />
          ) : (
            <div className={`text-2xl sm:text-3xl font-bold truncate ${headerIsDark ? 'text-white' : 'text-foreground'}`}>{idea.name}</div>
          )
        }
      />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
              
              {isEditing ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Describe your idea..."
                />
              ) : (
                <p className="text-gray-600 whitespace-pre-wrap">
                  {description || 'No description provided'}
                </p>
              )}
            </div>

            {/* Tags */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
              
              {isEditing ? (
                <div>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="concept, inspiration, creative, brainstorm..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Separate multiple tags with commas (e.g., &quot;concept, inspiration, creative&quot;)
                  </p>
                  {/* Live tag preview */}
                  {tags.trim() && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-700 mb-2">Preview:</p>
                      <div className="flex flex-wrap gap-1">
                        {tags.split(',').map((tag, index) => {
                          const trimmedTag = tag.trim();
                          return trimmedTag ? (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-700"
                            >
                              <Tag className="w-3 h-3 mr-1" />
                              {trimmedTag}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {idea.tags.length > 0 ? (
                    idea.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-100 text-indigo-700"
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                      </span>
                    ))
                  ) : (
                    <p className="text-gray-500">No tags added</p>
                  )}
                </div>
              )}
            </div>

            {/* Comments Section */}
            <div id="comments-section" className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Comments & Feedback</h2>
              <CommentThread 
                targetType="general-idea" 
                targetId={idea.id}
                className="w-full"
                canComment={allowComment}
              />
            </div>

            {/* Images Gallery */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Images</h2>
                {!readOnly ? (
                  <label className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      className="hidden"
                    />
                  </label>
                ) : null}
              </div>

              {images.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.map((imageUrl, index) => (
                    <div
                      key={index}
                      className="relative group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div className="aspect-square bg-gray-100">
                        <img
                          src={imageUrl}
                          alt={`Image ${index + 1}`}
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setSelectedImage({ url: imageUrl, alt: `Image ${index + 1}` })}
                          onError={(e) => {
                            console.error('❌ Image failed to load:', imageUrl);
                            console.error('🔍 Image URL analysis:', {
                              url: imageUrl,
                              urlLength: imageUrl?.length,
                              urlType: typeof imageUrl,
                              isValidHttp: imageUrl?.startsWith('http'),
                              containsR2: imageUrl?.includes('r2.dev'),
                              urlParts: imageUrl?.split('/'),
                            });
                            const img = e.target as HTMLImageElement;
                            img.style.backgroundColor = '#f8f9fa';
                            img.style.color = '#6b7280';
                            img.style.display = 'flex';
                            img.style.alignItems = 'center';
                            img.style.justifyContent = 'center';
                            img.alt = 'Failed to load image';
                            // Add error text to the image
                            img.innerHTML = 'Image failed to load';
                          }}
                        />
                      </div>
                      
                      {/* Remove button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(imageUrl);
                        }}
                        className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-700 transition-all shadow-lg"
                        title="Delete image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      <div className="p-3">
                        <p className="text-sm font-medium text-gray-900">
                          Image {index + 1}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No images uploaded yet</p>
                  <p className="text-sm">Upload images to visualize your idea</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Metadata */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Details</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Created</label>
                  <p className="text-sm text-gray-600">
                    {new Date(idea.createdAt).toLocaleString()}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Last Updated</label>
                  <p className="text-sm text-gray-600">
                    {new Date(idea.updatedAt).toLocaleString()}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Images</label>
                  <p className="text-sm text-gray-600">
                    {images.length} image{images.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Tags</label>
                  <p className="text-sm text-gray-600">
                    {idea.tags.length} tag{idea.tags.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Comments</label>
                  <p className="text-sm text-gray-600">
                    {commentCount} comment{commentCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              
              <div className="space-y-2">
                {!readOnly ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Idea</span>
                  </button>
                ) : null}
                
                {!readOnly ? (
                  <label className="w-full flex items-center space-x-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer">
                    <Plus className="w-4 h-4" />
                    <span>Add Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      className="hidden"
                    />
                  </label>
                ) : null}
                
                <button
                  onClick={() => {
                    document.getElementById('comments-section')?.scrollIntoView({ 
                      behavior: 'smooth' 
                    });
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-left text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>View Comments ({commentCount})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 z-10"
            >
              <X className="w-5 h-5 text-gray-700" />
            </button>
            <img
              src={selectedImage.url}
              alt={selectedImage.alt}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Image</h3>
            </div>
            
            {/* Image Preview */}
            <div className="mb-4">
              <img
                src={showDeleteConfirm}
                alt="Image to delete"
                className="w-full h-32 object-cover rounded-lg border border-gray-200"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = 'none';
                }}
              />
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this image? This action cannot be undone and the image will be permanently removed from your idea.
            </p>
            
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleRemoveImage(showDeleteConfirm);
                  setShowDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Image</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
