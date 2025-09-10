'use client';

import { useState } from 'react';
import { runFirebaseSetup } from '@/lib/setup-firebase';

export default function SetupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const success = await runFirebaseSetup();
      if (success) {
        setIsComplete(true);
      } else {
        setError('Setup failed. Check the console for details.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Firebase Setup
          </h1>
          
          <p className="text-gray-600 mb-6">
            This will initialize your Firebase collections with the proper structure and demo data.
          </p>

          {!isComplete && !error && (
            <button
              onClick={handleSetup}
              disabled={isLoading}
              className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {isLoading ? 'Setting up...' : 'Initialize Firebase'}
            </button>
          )}

          {isLoading && (
            <div className="mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Creating collections and demo data...</p>
            </div>
          )}

          {isComplete && (
            <div className="text-green-600">
              <div className="text-4xl mb-2">✅</div>
              <h2 className="text-lg font-semibold mb-2">Setup Complete!</h2>
              <p className="text-sm text-gray-600 mb-4">
                Your Firebase collections are now ready with proper structure and demo data.
              </p>
              <a
                href="/"
                className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Go to App
              </a>
            </div>
          )}

          {error && (
            <div className="text-red-600">
              <div className="text-4xl mb-2">❌</div>
              <h2 className="text-lg font-semibold mb-2">Setup Failed</h2>
              <p className="text-sm text-gray-600 mb-4">{error}</p>
              <button
                onClick={handleSetup}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          <div className="mt-8 text-left">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">What this creates:</h3>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• <strong>shows</strong> - Your TV show projects</li>
              <li>• <strong>globalAssets</strong> - Characters, locations, gadgets, etc.</li>
              <li>• <strong>episodes</strong> - Episode data with scripts and character assignments</li>
              <li>• <strong>assetConcepts</strong> - Concept art and 3D models</li>
              <li>• Demo data for "Bravo & Tango - Secret Squad" and "Pine Watch"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
