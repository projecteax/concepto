'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useComments } from '@/contexts/CommentContext';
import CommentThread from '@/components/CommentThread';

export default function TestCommentsPage() {
  const { user, login } = useAuth();
  const { commentThreads } = useComments();
  const [testTargetId] = useState('test-scene-1');

  const handleLogin = async () => {
    await login('adrian', 'zaq12wsx');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Test Comments</h1>
          <button
            onClick={handleLogin}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Login as Adrian
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Test Comments</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Test Scene</h2>
          <p className="text-gray-600 mb-4">This is a test scene for testing comment functionality.</p>
          
          <CommentThread 
            targetType="scene" 
            targetId={testTargetId}
            className="inline-block"
          />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Debug Info</h2>
          <div className="space-y-2">
            <p><strong>User:</strong> {user.name} (@{user.username})</p>
            <p><strong>Comment Threads:</strong> {commentThreads.length}</p>
            <p><strong>Target ID:</strong> {testTargetId}</p>
          </div>
          
          {commentThreads.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Comment Threads:</h3>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(commentThreads, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
