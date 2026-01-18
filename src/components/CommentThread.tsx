'use client';

import { useState, useRef, useEffect } from 'react';
import { useComments } from '@/contexts/CommentContext';
import { useAuth } from '@/contexts/AuthContext';
import { Comment, CommentThread as CommentThreadType } from '@/types';
import { 
  MessageCircle, 
  Reply, 
  Check, 
  X, 
  User,
  Clock
} from 'lucide-react';

interface CommentThreadProps {
  targetType: CommentThreadType['targetType'];
  targetId: string;
  className?: string;
  canComment?: boolean;
}

export default function CommentThread({ targetType, targetId, className = '', canComment = true }: CommentThreadProps) {
  const { getCommentsForTarget, addComment, resolveComment, deleteComment } = useComments();
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const commentRef = useRef<HTMLDivElement>(null);

  const thread = getCommentsForTarget(targetType, targetId);
  const commentCount = thread?.comments.length || 0;

  // Handle clicking outside to close comments
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commentRef.current && !commentRef.current.contains(event.target as Node)) {
        setShowComments(false);
        setReplyingTo(null);
        setReplyText('');
      }
    };

    if (showComments) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showComments]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !user || isSubmittingComment || !canComment) return;
    
    setIsSubmittingComment(true);
    try {
      await addComment(targetType, targetId, newComment.trim());
      setNewComment('');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleReply = async (parentCommentId: string) => {
    if (!replyText.trim() || !user || isSubmittingReply || !canComment) return;
    
    setIsSubmittingReply(true);
    try {
      await addComment(targetType, targetId, replyText.trim(), parentCommentId);
      setReplyText('');
      setReplyingTo(null);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleResolve = async (commentId: string) => {
    if (!thread) return;
    await resolveComment(thread.id, commentId);
  };

  const handleDelete = async (commentId: string) => {
    if (!thread || !user) return;
    if (confirm('Are you sure you want to delete this comment?')) {
      await deleteComment(thread.id, commentId);
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment.id} className={`${isReply ? 'ml-8 mt-3' : 'mb-4'}`}>
      <div className={`bg-white rounded-lg border ${comment.resolved ? 'border-green-200 bg-green-50' : 'border-gray-200'} p-4`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
              <User className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-900">{comment.authorName}</span>
            <span className="text-xs text-gray-500 flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              {formatTimeAgo(comment.createdAt)}
            </span>
            {comment.resolved && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                Resolved
              </span>
            )}
          </div>
          
          {user && (
            <div className="flex items-center space-x-1">
              {!comment.resolved && (
                <button
                  onClick={() => handleResolve(comment.id)}
                  className="p-1 text-green-600 hover:text-green-700 hover:bg-green-100 rounded transition-colors"
                  title="Resolve comment"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              {comment.authorId === user.id && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="p-1 text-red-600 hover:text-red-700 hover:bg-red-100 rounded transition-colors"
                  title="Delete comment"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
        
        <p className="text-sm text-gray-700 mb-3">{comment.content}</p>
        
        {!isReply && !comment.resolved && canComment && (
          <button
            onClick={() => setReplyingTo(comment.id)}
            className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded flex items-center space-x-1 transition-colors"
          >
            <Reply className="w-3 h-3" />
            <span>Reply</span>
          </button>
        )}
        
        {/* Reply form */}
        {replyingTo === comment.id && (
          <div className="mt-3 pt-3 border-t border-gray-200 bg-gray-50 rounded-lg p-3">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (replyText.trim() && !isSubmittingReply) {
                    handleReply(comment.id);
                  }
                }
              }}
              placeholder="Write a reply... (Ctrl+Enter to send)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              rows={2}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">Ctrl+Enter to send</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleReply(comment.id)}
                  disabled={!replyText.trim() || isSubmittingReply || !canComment}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isSubmittingReply ? 'Sending...' : 'Reply'}
                </button>
                <button
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyText('');
                  }}
                  className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Render replies */}
        {comment.replies.map(reply => renderComment(reply, true))}
      </div>
    </div>
  );

  return (
    <div ref={commentRef} className={`relative ${className}`}>
      {/* Comment button */}
      <button
        onClick={() => setShowComments(!showComments)}
        className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        <span>Comments</span>
        {commentCount > 0 && (
          <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">
            {commentCount}
          </span>
        )}
      </button>

      {/* Comments panel */}
      {showComments && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-900">Comments</h3>
              <button
                onClick={() => setShowComments(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Add new comment */}
            <div className="mb-4">
              {user ? (
                <>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        if (newComment.trim() && !isSubmittingComment) {
                          handleAddComment();
                        }
                      }
                    }}
                    placeholder="Add a comment... (Ctrl+Enter to send)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={3}
                    disabled={!canComment}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">
                      {canComment ? 'Ctrl+Enter to send' : 'Commenting disabled for this view'}
                    </span>
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || isSubmittingComment || !canComment}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {isSubmittingComment ? 'Sending...' : 'Comment'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">Please log in to add comments</p>
                </div>
              )}
            </div>

            {/* Comments list */}
            <div className="space-y-4">
              {thread?.comments.map(comment => renderComment(comment))}
              {!thread && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No comments yet. Be the first to comment!
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
