'use client';

import { useState } from 'react';
import { Share, Copy, ExternalLink, Eye } from 'lucide-react';

interface PublicLinkGeneratorProps {
  showId?: string;
  episodeId?: string;
  className?: string;
}

export function PublicLinkGenerator({ showId, episodeId, className = '' }: PublicLinkGeneratorProps) {
  const [showShareInfo, setShowShareInfo] = useState(false);
  const [copied, setCopied] = useState(false);

  const generatePublicLink = () => {
    const baseUrl = window.location.origin;
    let publicUrl = `${baseUrl}/public`;
    
    if (showId) {
      publicUrl += `?show=${showId}`;
    }
    if (episodeId) {
      publicUrl += `${showId ? '&' : '?'}episode=${episodeId}`;
    }
    
    return publicUrl;
  };

  const handleShare = async () => {
    const url = generatePublicLink();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleOpenPublic = () => {
    const url = generatePublicLink();
    window.open(url, '_blank');
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <button
        onClick={handleShare}
        className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
      >
        <Copy className="w-4 h-4 mr-2" />
        {copied ? 'Copied!' : 'Copy Public Link'}
      </button>
      
      <button
        onClick={handleOpenPublic}
        className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        Open Public View
      </button>

      {copied && (
        <div className="flex items-center text-green-600 text-sm">
          <Eye className="w-4 h-4 mr-1" />
          Link copied to clipboard!
        </div>
      )}
    </div>
  );
}
