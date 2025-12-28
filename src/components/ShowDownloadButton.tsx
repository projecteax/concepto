'use client';

import React, { useState } from 'react';
import { Download, Loader2, ChevronDown, Check } from 'lucide-react';
import { Show, GlobalAsset, Episode, EpisodeIdea, GeneralIdea, PlotTheme } from '@/types';
import { ShowDownloadService, DownloadOptions } from '@/lib/download-service';
import { cn } from '@/lib/utils';

interface ShowDownloadButtonProps {
  show: Show;
  globalAssets: GlobalAsset[];
  episodes: Episode[];
  episodeIdeas?: EpisodeIdea[];
  generalIdeas?: GeneralIdea[];
  plotThemes?: PlotTheme[];
  className?: string;
}

export const ShowDownloadButton: React.FC<ShowDownloadButtonProps> = ({
  show,
  globalAssets,
  episodes,
  episodeIdeas = [],
  generalIdeas = [],
  plotThemes = [],
  className = ''
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    // Show data
    includeShowInfo: true,
    includePlotThemes: true,
    
    // Assets - granular by category
    includeAssets: true,
    assetCategories: {
      character: true,
      location: true,
      gadget: true,
      texture: true,
      background: true,
      vehicle: true,
    },
    includeAssetImages: true,
    includeAssetVideos: true,
    includeAssetModels: true,
    includeAssetVoiceSamples: true,
    
    // Episodes
    includeEpisodes: true,
    includeEpisodeScripts: true,
    includeAVScripts: true,
    includeAVPreviewData: true,
    includeScreenplays: true,
    includeNarrativeStories: true,
    includeEpisodeScenes: true,
    includeEpisodeImages: true,
    
    // Ideas
    includeEpisodeIdeas: true,
    includeGeneralIdeas: true,
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    setShowOptions(false);
    
    try {
      const downloadService = new ShowDownloadService(
        show,
        globalAssets,
        episodes,
        episodeIdeas,
        generalIdeas,
        plotThemes
      );
      
      await downloadService.downloadShow(downloadOptions);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const getSelectedAssetCount = () => {
    if (!downloadOptions.includeAssets) return 0;
    return globalAssets.filter(asset => 
      downloadOptions.assetCategories[asset.category as keyof typeof downloadOptions.assetCategories]
    ).length;
  };

  const toggleAssetCategory = (category: keyof typeof downloadOptions.assetCategories) => {
    setDownloadOptions(prev => ({
      ...prev,
      assetCategories: {
        ...prev.assetCategories,
        [category]: !prev.assetCategories[category]
      }
    }));
  };

  const toggleAllAssets = (value: boolean) => {
    setDownloadOptions(prev => ({
      ...prev,
      includeAssets: value,
      assetCategories: {
        character: value,
        location: value,
        gadget: value,
        texture: value,
        background: value,
        vehicle: value,
      }
    }));
  };

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparing Backup...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download Show
            </>
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowOptions(!showOptions)}
            disabled={isDownloading}
            className={cn(
              "flex items-center px-3 py-2 border rounded-lg transition-colors",
              showOptions 
                ? "bg-gray-100 border-gray-400" 
                : "bg-white border-gray-300 hover:bg-gray-50",
              isDownloading && "opacity-50 cursor-not-allowed"
            )}
            title="Backup Options"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", showOptions && "rotate-180")} />
          </button>

          {showOptions && (
            <div className="absolute top-full right-0 mt-2 w-96 bg-white border border-gray-300 rounded-lg shadow-xl p-4 z-50 max-h-[600px] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Download className="w-5 h-5" />
                Backup Options
              </h3>
              
              <div className="space-y-4">
                {/* Show Information */}
                <div className="border-b pb-3">
                  <h4 className="font-semibold text-sm text-gray-700 mb-2">Show Information</h4>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={downloadOptions.includeShowInfo}
                      onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeShowInfo: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Show metadata (name, description, images)</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={downloadOptions.includePlotThemes}
                      onChange={(e) => setDownloadOptions(prev => ({ ...prev, includePlotThemes: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Plot Themes ({plotThemes.length})</span>
                  </label>
                </div>

                {/* Assets */}
                <div className="border-b pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm text-gray-700">Global Assets</h4>
                    <button
                      onClick={() => toggleAllAssets(!downloadOptions.includeAssets)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {downloadOptions.includeAssets ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  
                  <label className="flex items-center space-x-3 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={downloadOptions.includeAssets}
                      onChange={(e) => toggleAllAssets(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Include Assets ({getSelectedAssetCount()} selected)</span>
                  </label>

                  {downloadOptions.includeAssets && (
                    <div className="ml-6 space-y-2">
                      {Object.entries({
                        character: 'Characters',
                        location: 'Locations',
                        gadget: 'Gadgets',
                        texture: 'Textures',
                        background: 'Backgrounds',
                        vehicle: 'Vehicles',
                      }).map(([key, label]) => {
                        const count = globalAssets.filter(a => a.category === key).length;
                        return (
                          <label key={key} className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={downloadOptions.assetCategories[key as keyof typeof downloadOptions.assetCategories]}
                              onChange={() => toggleAssetCategory(key as keyof typeof downloadOptions.assetCategories)}
                              className="rounded"
                            />
                            <span className="text-sm">{label} ({count})</span>
                          </label>
                        );
                      })}
                      
                      <div className="ml-6 mt-2 pt-2 border-t space-y-2">
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={downloadOptions.includeAssetImages}
                            onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeAssetImages: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">Include images (concepts, galleries)</span>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={downloadOptions.includeAssetVideos}
                            onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeAssetVideos: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">Include videos</span>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={downloadOptions.includeAssetModels}
                            onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeAssetModels: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">Include 3D models (FBX, Blender files)</span>
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={downloadOptions.includeAssetVoiceSamples}
                            onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeAssetVoiceSamples: e.target.checked }))}
                            className="rounded"
                          />
                          <span className="text-xs text-gray-600">Include voice samples</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Episodes */}
                <div className="border-b pb-3">
                  <h4 className="font-semibold text-sm text-gray-700 mb-2">Episodes ({episodes.length})</h4>
                  
                  <label className="flex items-center space-x-3 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={downloadOptions.includeEpisodes}
                      onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeEpisodes: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">Include Episodes</span>
                  </label>

                  {downloadOptions.includeEpisodes && (
                    <div className="ml-6 space-y-2">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={downloadOptions.includeEpisodeScripts}
                          onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeEpisodeScripts: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">Legacy scripts (text)</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={downloadOptions.includeAVScripts}
                          onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeAVScripts: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">AV Scripts (segments, shots, audio)</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={downloadOptions.includeAVPreviewData}
                          onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeAVPreviewData: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">AV Preview data (timeline, tracks)</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={downloadOptions.includeScreenplays}
                          onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeScreenplays: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">Screenplays (PL & EN)</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={downloadOptions.includeNarrativeStories}
                          onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeNarrativeStories: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">Narrative stories (PL & EN)</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={downloadOptions.includeEpisodeScenes}
                          onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeEpisodeScenes: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">Legacy scenes & shots</span>
                      </label>
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={downloadOptions.includeEpisodeImages}
                          onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeEpisodeImages: e.target.checked }))}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-600">Episode images (inspiration, storyboards)</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Ideas */}
                <div>
                  <h4 className="font-semibold text-sm text-gray-700 mb-2">Ideas</h4>
                  
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={downloadOptions.includeEpisodeIdeas}
                      onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeEpisodeIdeas: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Episode Ideas ({episodeIdeas.length})</span>
                  </label>
                  
                  <label className="flex items-center space-x-3 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={downloadOptions.includeGeneralIdeas}
                      onChange={(e) => setDownloadOptions(prev => ({ ...prev, includeGeneralIdeas: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">General Ideas ({generalIdeas.length})</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 mt-6 pt-4 border-t">
                <button
                  onClick={() => setShowOptions(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download Backup
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      {showOptions && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowOptions(false)}
        />
      )}
    </div>
  );
};