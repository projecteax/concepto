'use client';

import React, { useState } from 'react';
import { Download, Loader2, Settings } from 'lucide-react';
import { Show, GlobalAsset, Episode, EpisodeIdea, GeneralIdea } from '@/types';
import { ShowDownloadService, DownloadOptions } from '@/lib/download-service';

interface ShowDownloadButtonProps {
  show: Show;
  globalAssets: GlobalAsset[];
  episodes: Episode[];
  episodeIdeas: EpisodeIdea[];
  generalIdeas: GeneralIdea[];
  className?: string;
}

export const ShowDownloadButton: React.FC<ShowDownloadButtonProps> = ({
  show,
  globalAssets,
  episodes,
  episodeIdeas,
  generalIdeas,
  className = ''
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    includeAssets: true,
    includeEpisodes: true,
    includeIdeas: true,
    includeGeneralIdeas: true
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const downloadService = new ShowDownloadService(
        show,
        globalAssets,
        episodes,
        episodeIdeas,
        generalIdeas
      );
      
      await downloadService.downloadShow(downloadOptions);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const getDownloadSize = () => {
    let size = 0;
    if (downloadOptions.includeAssets) size += globalAssets.length;
    if (downloadOptions.includeEpisodes) size += episodes.length;
    if (downloadOptions.includeIdeas) size += episodeIdeas.length;
    if (downloadOptions.includeGeneralIdeas) size += generalIdeas.length;
    return size;
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isDownloading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {isDownloading ? 'Preparing Download...' : 'Download Show'}
      </button>

      <button
        onClick={() => setShowOptions(!showOptions)}
        className="ml-2 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        title="Download Options"
      >
        <Settings className="w-4 h-4" />
      </button>

      {showOptions && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50">
          <h3 className="text-lg font-semibold mb-4">Download Options</h3>
          
          <div className="space-y-3">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={downloadOptions.includeAssets}
                onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeAssets: e.target.checked }))}
                className="rounded"
              />
              <span>Include Assets ({globalAssets.length} items)</span>
            </label>
            
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={downloadOptions.includeEpisodes}
                onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeEpisodes: e.target.checked }))}
                className="rounded"
              />
              <span>Include Episodes ({episodes.length} episodes)</span>
            </label>
            
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={downloadOptions.includeIdeas}
                onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeIdeas: e.target.checked }))}
                className="rounded"
              />
              <span>Include Episode Ideas ({episodeIdeas.length} ideas)</span>
            </label>
            
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={downloadOptions.includeGeneralIdeas}
                onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeGeneralIdeas: e.target.checked }))}
                className="rounded"
              />
              <span>Include General Ideas ({generalIdeas.length} ideas)</span>
            </label>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Total items to download:</strong> {getDownloadSize()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              The download will include all images, descriptions, and organized folder structure.
            </p>
          </div>

          <div className="flex justify-end space-x-2 mt-4">
            <button
              onClick={() => setShowOptions(false)}
              className="px-3 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading || getDownloadSize() === 0}
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
