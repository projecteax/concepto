'use client';

interface LoadingPreloaderProps {
  message?: string;
}

export function LoadingPreloader({ message = 'Loading...' }: LoadingPreloaderProps) {
  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-indigo-600 mx-auto mb-4"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 bg-indigo-600 rounded-full animate-pulse"></div>
          </div>
        </div>
        <p className="text-lg font-medium text-gray-700 mt-4">{message}</p>
        <p className="text-sm text-gray-500 mt-2">Please wait while we load your data</p>
      </div>
    </div>
  );
}

