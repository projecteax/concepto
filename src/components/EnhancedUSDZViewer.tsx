'use client';

import React, { useState, useEffect } from 'react';

interface EnhancedUSDZViewerProps {
  modelUrl: string;
  filename: string;
  className?: string;
}

export function EnhancedUSDZViewer({ modelUrl, filename, className = '' }: EnhancedUSDZViewerProps) {
  const [isIOS, setIsIOS] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isWindows, setIsWindows] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsMacOS(/macintosh|mac os x/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));
    setIsWindows(/windows/.test(userAgent));
  }, []);

  const getInstructions = () => {
    if (isIOS) {
      return {
        primary: 'Tap to view in AR',
        secondary: 'Your device supports AR viewing',
        icon: '📱',
        action: 'View in AR'
      };
    } else if (isMacOS) {
      return {
        primary: 'Tap to open in Quick Look',
        secondary: 'macOS supports USDZ viewing',
        icon: '💻',
        action: 'Open in Quick Look'
      };
    } else if (isAndroid) {
      return {
        primary: 'Download and use a 3D viewer',
        secondary: 'Try Google ARCore or similar apps',
        icon: '🤖',
        action: 'Download File'
      };
    } else if (isWindows) {
      return {
        primary: 'Download and use a 3D viewer',
        secondary: 'Try Windows Mixed Reality or 3D Viewer',
        icon: '🖥️',
        action: 'Download File'
      };
    } else {
      return {
        primary: 'Download the 3D model',
        secondary: 'Use a compatible 3D viewer application',
        icon: '📦',
        action: 'Download File'
      };
    }
  };

  const instructions = getInstructions();

  return (
    <div className={`w-full h-96 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 text-white ${className}`}>
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        {/* Main Content */}
        <div className="relative z-10">
          {/* Icon */}
          <div className="w-24 h-24 mx-auto mb-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-4xl">
            {instructions.icon}
          </div>
          
          {/* Title */}
          <h3 className="text-2xl font-bold mb-3">{filename}</h3>
          <p className="text-lg mb-2 opacity-90">USDZ 3D Model</p>
          <p className="text-sm mb-8 opacity-75">{instructions.secondary}</p>
          
          {/* Action Buttons */}
          <div className="space-y-3 w-full max-w-sm">
            {/* Primary Action */}
            <a 
              href={modelUrl}
              rel={isIOS ? "ar" : undefined}
              className="block w-full px-6 py-4 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-all duration-200 font-semibold text-lg"
            >
              <div className="flex items-center justify-center">
                <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                {instructions.action}
              </div>
            </a>
            
            {/* Download Fallback */}
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
        </div>
        
        {/* Platform-specific Instructions */}
        <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-50 rounded-lg p-3 text-sm">
          <div className="text-center">
            <p className="font-semibold mb-1">Platform-specific instructions:</p>
            {isIOS && (
              <div>
                <p>• Tap the AR button to view in AR</p>
                <p>• Requires iOS 12+ and ARKit-compatible device</p>
              </div>
            )}
            {isMacOS && (
              <div>
                <p>• Tap to open in Quick Look (macOS 10.15+)</p>
                <p>• Use trackpad gestures to interact with the model</p>
              </div>
            )}
            {isAndroid && (
              <div>
                <p>• Download and open with Google ARCore</p>
                <p>• Or use other 3D viewer apps from Play Store</p>
              </div>
            )}
            {isWindows && (
              <div>
                <p>• Download and open with Windows 3D Viewer</p>
                <p>• Or use Windows Mixed Reality Portal</p>
              </div>
            )}
            {!isIOS && !isMacOS && !isAndroid && !isWindows && (
              <div>
                <p>• Download the file and use a 3D modeling application</p>
                <p>• Recommended: Blender, Maya, or other 3D software</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
