'use client';

import React, { useEffect, useRef } from 'react';

interface USDZViewerProps {
  modelUrl: string;
  filename: string;
  className?: string;
}

export function USDZViewer({ modelUrl, filename, className = '' }: USDZViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Create a Quick Look link for USDZ files
    const createQuickLookLink = () => {
      if (containerRef.current) {
        // Clear any existing content
        containerRef.current.innerHTML = '';
        
        // Create a link that opens in Quick Look on iOS/macOS
        const link = document.createElement('a');
        link.href = modelUrl;
        link.rel = 'ar';
        link.className = 'block w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white';
        
        // Create the content
        const content = document.createElement('div');
        content.className = 'text-center p-6';
        
        const icon = document.createElement('div');
        icon.className = 'w-16 h-16 mx-auto mb-4 bg-white bg-opacity-20 rounded-full flex items-center justify-center';
        icon.innerHTML = `
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
          </svg>
        `;
        
        const title = document.createElement('h3');
        title.className = 'text-lg font-semibold mb-2';
        title.textContent = filename;
        
        const description = document.createElement('p');
        description.className = 'text-sm opacity-90 mb-4';
        description.textContent = 'Tap to view in AR (iOS) or Quick Look (macOS)';
        
        const instructions = document.createElement('div');
        instructions.className = 'text-xs opacity-75 space-y-1';
        instructions.innerHTML = `
          <p>• On iOS: Tap to open in AR</p>
          <p>• On macOS: Tap to open in Quick Look</p>
          <p>• On other devices: Tap to download</p>
        `;
        
        content.appendChild(icon);
        content.appendChild(title);
        content.appendChild(description);
        content.appendChild(instructions);
        link.appendChild(content);
        
        containerRef.current.appendChild(link);
      }
    };

    createQuickLookLink();
  }, [modelUrl, filename]);

  return (
    <div className={`w-full h-96 rounded-lg overflow-hidden ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Fallback for non-Apple devices */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg">
        <p className="text-sm font-medium">{filename}</p>
        <p className="text-xs opacity-75">USDZ format - Best on Apple devices</p>
      </div>
    </div>
  );
}
