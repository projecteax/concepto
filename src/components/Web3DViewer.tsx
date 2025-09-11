'use client';

import React, { useState } from 'react';
import { EnhancedUSDZViewer } from './EnhancedUSDZViewer';

interface Web3DViewerProps {
  modelUrl: string;
  filename: string;
  className?: string;
  defaultViewer?: 'babylon' | 'three' | 'download';
}

export function Web3DViewer({ modelUrl, filename, className = '', defaultViewer = 'babylon' }: Web3DViewerProps) {
  const [viewerType, setViewerType] = useState<'babylon' | 'three' | 'download'>(defaultViewer);
  const extension = filename.toLowerCase().split('.').pop();

  // Handle USDZ files
  if (extension === 'usdz') {
    return <EnhancedUSDZViewer modelUrl={modelUrl} filename={filename} className={className} />;
  }

  // Handle other 3D formats
  const getViewerUrl = () => {
    switch (viewerType) {
      case 'babylon':
        // Use Babylon.js Sandbox - don't double encode
        return `https://sandbox.babylonjs.com/?assetUrl=${modelUrl}`;
      case 'three':
        // Use Three.js editor - don't double encode
        return `https://threejs.org/editor/?url=${modelUrl}`;
      default:
        return modelUrl;
    }
  };

  return (
    <div className={`w-full h-96 rounded-lg overflow-hidden bg-gray-100 ${className}`}>
      {/* Viewer Controls */}
      <div className="absolute top-4 left-4 z-10 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg">
        <div className="flex items-center space-x-2">
          <select 
            value={viewerType} 
            onChange={(e) => setViewerType(e.target.value as 'babylon' | 'three' | 'download')}
            className="bg-transparent text-white text-sm border border-white border-opacity-30 rounded px-2 py-1"
          >
            <option value="babylon">Babylon.js Viewer</option>
            <option value="three">Three.js Editor</option>
            <option value="download">Download Only</option>
          </select>
        </div>
      </div>

      {/* File Info */}
      <div className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg">
        <p className="text-sm font-medium">{filename}</p>
        <p className="text-xs opacity-75">{extension?.toUpperCase()} format</p>
      </div>

      {/* Viewer Content */}
      {viewerType === 'download' ? (
        <DownloadViewer modelUrl={modelUrl} filename={filename} />
      ) : (
        <iframe
          src={getViewerUrl()}
          className="w-full h-full border-0"
          title={`3D Viewer for ${filename}`}
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      )}

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg">
        <p className="text-sm text-center">
          {viewerType === 'download' 
            ? 'Click download to save the 3D model file'
            : '3D model loaded in external viewer. Use controls to rotate, zoom, and pan.'
          }
        </p>
      </div>
    </div>
  );
}


// Download Viewer
function DownloadViewer({ modelUrl, filename }: { modelUrl: string; filename: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
        <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
      </div>
      
      <h3 className="text-xl font-bold text-gray-900 mb-3">{filename}</h3>
      <p className="text-gray-600 mb-6">3D Model File</p>
      
      <a 
        href={modelUrl}
        download={filename}
        className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
      >
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        Download 3D Model
      </a>
      
      <p className="mt-4 text-sm text-gray-500">
        Download the file and open it with a 3D modeling application
      </p>
    </div>
  );
}
