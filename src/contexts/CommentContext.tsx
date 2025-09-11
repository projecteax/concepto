'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Comment, CommentThread } from '@/types';
import { useAuth } from './AuthContext';

interface CommentContextType {
  commentThreads: CommentThread[];
  addComment: (targetType: CommentThread['targetType'], targetId: string, content: string, parentCommentId?: string) => Promise<void>;
  resolveComment: (threadId: string, commentId: string) => Promise<void>;
  deleteComment: (threadId: string, commentId: string) => Promise<void>;
  getCommentsForTarget: (targetType: CommentThread['targetType'], targetId: string) => CommentThread | null;
  isLoading: boolean;
}

const CommentContext = createContext<CommentContextType | undefined>(undefined);

export function CommentProvider({ children }: { children: ReactNode }) {
  const [commentThreads, setCommentThreads] = useState<CommentThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Load comments from localStorage (in a real app, this would be from Firebase)
  useEffect(() => {
    const savedComments = localStorage.getItem('concepto_comments');
    if (savedComments) {
      try {
        const parsed = JSON.parse(savedComments);
        // Convert date strings back to Date objects
        const threads = parsed.map((thread: Record<string, unknown>) => ({
          ...thread,
          createdAt: new Date(thread.createdAt as string),
          updatedAt: new Date(thread.updatedAt as string),
          comments: (thread.comments as Record<string, unknown>[]).map((comment: Record<string, unknown>) => ({
            ...comment,
            createdAt: new Date(comment.createdAt as string),
            updatedAt: new Date(comment.updatedAt as string),
            resolvedAt: comment.resolvedAt ? new Date(comment.resolvedAt as string) : undefined,
            replies: (comment.replies as Record<string, unknown>[]).map((reply: Record<string, unknown>) => ({
              ...reply,
              createdAt: new Date(reply.createdAt as string),
              updatedAt: new Date(reply.updatedAt as string),
            }))
          }))
        }));
        setCommentThreads(threads);
      } catch (error) {
        console.error('Error loading comments:', error);
      }
    }
    setIsLoading(false);
  }, []);

  // Save comments to localStorage
  const saveComments = (threads: CommentThread[]) => {
    localStorage.setItem('concepto_comments', JSON.stringify(threads));
  };

  const addComment = async (targetType: CommentThread['targetType'], targetId: string, content: string, parentCommentId?: string): Promise<void> => {
    if (!user) return;

    const newComment: Comment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      authorId: user.id,
      authorName: user.name,
      createdAt: new Date(),
      updatedAt: new Date(),
      replies: [],
      resolved: false,
    };

    setCommentThreads(prev => {
      const updated = [...prev];
      
      // Find existing thread for this target
      let thread = updated.find(t => t.targetType === targetType && t.targetId === targetId);
      
      if (!thread) {
        // Create new thread
        thread = {
          id: `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          targetType,
          targetId,
          comments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        updated.push(thread);
      }

      if (parentCommentId) {
        // Add as reply to existing comment
        const addReplyToComment = (comments: Comment[]): Comment[] => {
          return comments.map(comment => {
            if (comment.id === parentCommentId) {
              // Check if this exact reply already exists to prevent duplicates
              const duplicateExists = comment.replies.some(reply => 
                reply.content === newComment.content && 
                reply.authorId === newComment.authorId &&
                Math.abs(reply.createdAt.getTime() - newComment.createdAt.getTime()) < 1000 // Within 1 second
              );
              
              if (duplicateExists) {
                return comment; // Don't add duplicate
              }
              
              return {
                ...comment,
                replies: [...comment.replies, newComment],
                updatedAt: new Date(),
              };
            }
            return {
              ...comment,
              replies: addReplyToComment(comment.replies),
            };
          });
        };
        thread.comments = addReplyToComment(thread.comments);
      } else {
        // Check if this exact comment already exists to prevent duplicates
        const duplicateExists = thread.comments.some(comment => 
          comment.content === newComment.content && 
          comment.authorId === newComment.authorId &&
          Math.abs(comment.createdAt.getTime() - newComment.createdAt.getTime()) < 1000 // Within 1 second
        );
        
        if (!duplicateExists) {
          thread.comments.push(newComment);
        }
      }

      thread.updatedAt = new Date();
      saveComments(updated);
      return updated;
    });
  };

  const resolveComment = async (threadId: string, commentId: string): Promise<void> => {
    if (!user) return;

    setCommentThreads(prev => {
      const updated = prev.map(thread => {
        if (thread.id === threadId) {
          const resolveCommentInThread = (comments: Comment[]): Comment[] => {
            return comments.map(comment => {
              if (comment.id === commentId) {
                return {
                  ...comment,
                  resolved: true,
                  resolvedBy: user.id,
                  resolvedAt: new Date(),
                  updatedAt: new Date(),
                };
              }
              return {
                ...comment,
                replies: resolveCommentInThread(comment.replies),
              };
            });
          };
          return {
            ...thread,
            comments: resolveCommentInThread(thread.comments),
            updatedAt: new Date(),
          };
        }
        return thread;
      });
      saveComments(updated);
      return updated;
    });
  };

  const deleteComment = async (threadId: string, commentId: string): Promise<void> => {
    if (!user) return;

    setCommentThreads(prev => {
      const updated = prev.map(thread => {
        if (thread.id === threadId) {
          const deleteCommentInThread = (comments: Comment[]): Comment[] => {
            return comments.filter(comment => {
              if (comment.id === commentId) {
                // Only allow deletion if user is the author
                if (comment.authorId === user.id) {
                  return false; // Remove this comment
                }
                return true; // Keep this comment (not the author)
              }
              return {
                ...comment,
                replies: deleteCommentInThread(comment.replies),
              };
            });
          };
          return {
            ...thread,
            comments: deleteCommentInThread(thread.comments),
            updatedAt: new Date(),
          };
        }
        return thread;
      });
      saveComments(updated);
      return updated;
    });
  };

  const getCommentsForTarget = (targetType: CommentThread['targetType'], targetId: string): CommentThread | null => {
    return commentThreads.find(t => t.targetType === targetType && t.targetId === targetId) || null;
  };

  return (
    <CommentContext.Provider value={{
      commentThreads,
      addComment,
      resolveComment,
      deleteComment,
      getCommentsForTarget,
      isLoading,
    }}>
      {children}
    </CommentContext.Provider>
  );
}

export function useComments() {
  const context = useContext(CommentContext);
  if (context === undefined) {
    throw new Error('useComments must be used within a CommentProvider');
  }
  return context;
}
