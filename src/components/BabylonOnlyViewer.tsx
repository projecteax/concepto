'use client';

import React from 'react';

interface GLTFViewerProps {
  modelUrl: string;
  filename: string;
  className?: string;
}

export function GLTFViewer({ modelUrl, filename, className = '' }: GLTFViewerProps) {
  const extension = filename.toLowerCase().split('.').pop();

  // Handle USDZ files with a special viewer
  if (extension === 'usdz') {
    return (
      <div className={`w-full h-96 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 text-white ${className}`}>
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
          </div>
          
          <h3 className="text-xl font-bold mb-3">{filename}</h3>
          <p className="text-lg mb-6 opacity-90">USDZ 3D Model</p>
          
          <div className="space-y-3 w-full max-w-sm">
            <a 
              href={modelUrl}
              rel="ar"
              className="block w-full px-6 py-3 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-all duration-200 font-semibold"
            >
              <div className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                View in AR (iOS) / Quick Look (macOS)
              </div>
            </a>
            
            <a 
              href={modelUrl}
              download={filename}
              className="block w-full px-6 py-3 bg-white bg-opacity-10 hover:bg-opacity-20 rounded-lg transition-all duration-200"
            >
              <div className="flex items-center justify-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                Download File
              </div>
            </a>
          </div>
          
          <div className="mt-6 text-sm opacity-75">
            <p className="mb-1">How to view:</p>
            <p>• iOS: Tap &quot;View in AR&quot; to open in AR</p>
            <p>• macOS: Tap &quot;View in AR&quot; to open in Quick Look</p>
            <p>• Other devices: Download and use a 3D viewer app</p>
          </div>
        </div>
      </div>
    );
  }

  // Simple fallback for GLB/GLTF files - just show download link and external viewer options
  return (
    <div className={`w-full h-96 rounded-lg overflow-hidden bg-gray-100 ${className}`}>
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
          </svg>
        </div>
        
        <h3 className="text-lg font-semibold text-gray-900 mb-2">3D Model: {filename}</h3>
        <p className="text-sm text-gray-600 mb-4">
          View your 3D model using one of these options:
        </p>
        
        <div className="space-y-3 w-full max-w-sm">
          <a
            href={modelUrl}
            download={filename}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full justify-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Download {filename}
          </a>
          
          <div className="text-xs text-gray-500 space-y-1">
            <p className="font-semibold">View online:</p>
            <div className="space-y-1">
              <a 
                href={`https://gltf-viewer.donmccurdy.com/?url=${encodeURIComponent(modelUrl)}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block text-blue-600 hover:underline"
              >
                • GLTF Viewer
              </a>
              <a 
                href={`https://3dviewer.net/?url=${encodeURIComponent(modelUrl)}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block text-blue-600 hover:underline"
              >
                • 3D Viewer
              </a>
              <a 
                href={`https://sandbox.babylonjs.com/?assetUrl=${encodeURIComponent(modelUrl)}`} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="block text-blue-600 hover:underline"
              >
                • Babylon.js Sandbox
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
