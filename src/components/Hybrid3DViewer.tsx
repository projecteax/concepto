'use client';

import React, { useState, useEffect } from 'react';
import { Simple3DViewer } from './Simple3DViewer';
import { Web3DViewer } from './Web3DViewer';

interface Hybrid3DViewerProps {
  modelUrl: string;
  filename: string;
  className?: string;
}

export function Hybrid3DViewer({ modelUrl, filename, className = '' }: Hybrid3DViewerProps) {
  const extension = filename.toLowerCase().split('.').pop();
  
  // For GLB files, prioritize Babylon.js web viewer for better texture/material support
  const defaultViewerType = extension === 'glb' ? 'web' : 'simple';
  
  const [viewerType, setViewerType] = useState<'simple' | 'web'>(defaultViewerType);
  const [hasError, setHasError] = useState(false);

  // Reset error state when props change
  useEffect(() => {
    setHasError(false);
    setViewerType(defaultViewerType);
  }, [modelUrl, filename, defaultViewerType]);

  const handleError = () => {
    console.log('🔄 Simple3DViewer failed, falling back to Web3DViewer');
    setHasError(true);
    setViewerType('web');
  };

  const switchToWebViewer = () => {
    setViewerType('web');
  };

  const switchToSimpleViewer = () => {
    setViewerType('simple');
    setHasError(false);
  };

  return (
    <div className="relative">
      {/* Viewer Type Toggle */}
      <div className="absolute top-2 right-2 z-20 bg-black bg-opacity-50 text-white px-2 py-1 rounded-lg">
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={switchToSimpleViewer}
            className={`px-2 py-1 rounded transition-colors ${
              viewerType === 'simple' 
                ? 'bg-blue-600 text-white' 
                : 'bg-transparent text-gray-300 hover:text-white'
            }`}
          >
            Native
          </button>
          <button
            onClick={switchToWebViewer}
            className={`px-2 py-1 rounded transition-colors ${
              viewerType === 'web' 
                ? 'bg-blue-600 text-white' 
                : 'bg-transparent text-gray-300 hover:text-white'
            }`}
          >
            Web {extension === 'glb' && '⭐'}
          </button>
        </div>
      </div>

      {/* GLB Recommendation Message */}
      {extension === 'glb' && viewerType === 'simple' && (
        <div className="absolute top-2 left-2 z-20 bg-blue-500 text-white px-3 py-2 rounded-lg text-sm">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>GLB files work best with Babylon.js (Web viewer)</span>
          </div>
        </div>
      )}

      {/* Error Fallback Message */}
      {hasError && viewerType === 'simple' && (
        <div className="absolute top-2 left-2 z-20 bg-yellow-500 text-white px-3 py-2 rounded-lg text-sm">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>Native viewer failed. Try Web viewer.</span>
          </div>
        </div>
      )}

      {/* Render the appropriate viewer */}
      {viewerType === 'simple' ? (
        <Simple3DViewerWithErrorHandling
          modelUrl={modelUrl}
          filename={filename}
          className={className}
          onError={handleError}
        />
      ) : (
        <Web3DViewer
          modelUrl={modelUrl}
          filename={filename}
          className={className}
          defaultViewer={extension === 'glb' ? 'babylon' : 'babylon'}
        />
      )}
    </div>
  );
}

// Wrapper component to handle errors from Simple3DViewer
function Simple3DViewerWithErrorHandling({ 
  modelUrl, 
  filename, 
  className, 
  onError 
}: {
  modelUrl: string;
  filename: string;
  className: string;
  onError: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up error boundary-like behavior
    const handleError = (event: ErrorEvent) => {
      console.error('Simple3DViewer error:', event.error);
      setError(event.error?.message || 'Unknown error');
      onError();
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [onError]);

  if (error) {
    return (
      <div className={`w-full h-96 rounded-lg overflow-hidden bg-red-50 border border-red-200 ${className}`}>
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Native Viewer Failed</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              onError();
            }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Switch to Web Viewer
          </button>
        </div>
      </div>
    );
  }

  return (
    <Simple3DViewer
      modelUrl={modelUrl}
      filename={filename}
      className={className}
    />
  );
}
