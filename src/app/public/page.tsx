'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import { useState } from 'react';
import { Eye, EyeOff, Share, Copy, ExternalLink } from 'lucide-react';

export default function PublicPage() {
  const [showShareInfo, setShowShareInfo] = useState(false);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setShowShareInfo(true);
    setTimeout(() => setShowShareInfo(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Public Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Concepto - Public View</h1>
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              Public Access
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleShare}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Share className="w-4 h-4 mr-2" />
              Share Link
            </button>
            <a
              href="/login"
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Login to Edit
            </a>
          </div>
        </div>
        
        {/* Share notification */}
        {showShareInfo && (
          <div className="mt-3 p-3 bg-green-100 border border-green-200 rounded-lg flex items-center">
            <Copy className="w-4 h-4 text-green-600 mr-2" />
            <span className="text-green-800 text-sm">Link copied to clipboard!</span>
          </div>
        )}
      </div>

      {/* Public Notice */}
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mx-6 mt-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <Eye className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              <strong>Public View:</strong> You're viewing this content in read-only mode. 
              To edit or create content, please <a href="/login" className="font-medium underline">log in</a>.
            </p>
          </div>
        </div>
      </div>

      {/* Main App Content */}
      <div className="relative">
        <ConceptoApp isPublicMode={true} />
      </div>
    </div>
  );
}
