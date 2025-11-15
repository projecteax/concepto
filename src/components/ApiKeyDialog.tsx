'use client';

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Key, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showId: string;
  episodeId: string;
  segmentId?: string;
  shotId?: string;
}

interface ApiKeyData {
  id: string;
  key: string;
  name: string;
  createdAt: string;
}

export function ApiKeyDialog({
  isOpen,
  onClose,
  showId,
  episodeId,
  segmentId,
  shotId,
}: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState<ApiKeyData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [apiEndpoint, setApiEndpoint] = useState('');

  // Get API endpoint URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setApiEndpoint(`${window.location.origin}/api/external`);
    }
  }, []);

  // Fetch existing API key or generate new one
  useEffect(() => {
    if (isOpen) {
      fetchApiKey();
    }
  }, [isOpen]);

  const fetchApiKey = async () => {
    setIsLoading(true);
    try {
      // Try to get existing API keys
      const response = await fetch('/api/external/api-keys');
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          // Use the first active key
          const activeKey = data.data.find((k: any) => k.isActive);
          if (activeKey) {
            // We can't get the actual key back for security reasons
            // User needs to generate a new one if they don't have it saved
            setApiKey(null);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
      // If error, just allow user to generate a new key
    } finally {
      setIsLoading(false);
    }
  };

  const generateApiKey = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/external/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Blender Plugin - ${new Date().toLocaleDateString()}`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setApiKey(data.data);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to generate API key');
      }
    } catch (error) {
      console.error('Error generating API key:', error);
      alert('Failed to generate API key. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard');
    }
  };

  const copyAll = async () => {
    if (!apiKey) return;
    
    const config = {
      apiKey: apiKey.key,
      apiEndpoint,
      showId,
      episodeId,
      segmentId: segmentId || '',
      shotId: shotId || '',
    };

    const configText = JSON.stringify(config, null, 2);
    await copyToClipboard(configText, 'all');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <Key className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold">Blender Plugin API Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* API Key Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                API Key
              </label>
              {!apiKey && (
                <Button
                  onClick={generateApiKey}
                  disabled={isGenerating}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Generate Key
                    </>
                  )}
                </Button>
              )}
            </div>
            {apiKey ? (
              <div className="relative">
                <input
                  type="text"
                  value={apiKey.key}
                  readOnly
                  className="w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(apiKey.key, 'apiKey')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                  title="Copy API Key"
                >
                  {copiedField === 'apiKey' ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            ) : (
              <div className="px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600">
                {isLoading ? 'Loading...' : 'Click "Generate Key" to create an API key'}
              </div>
            )}
            {apiKey && (
              <p className="mt-2 text-xs text-amber-600">
                ⚠️ Save this key now - it will not be shown again after you close this dialog!
              </p>
            )}
          </div>

          {/* API Endpoint */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              API Endpoint
            </label>
            <div className="relative">
              <input
                type="text"
                value={apiEndpoint}
                readOnly
                className="w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
              />
              <button
                onClick={() => copyToClipboard(apiEndpoint, 'endpoint')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                title="Copy Endpoint"
              >
                {copiedField === 'endpoint' ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* IDs Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">IDs for Blender Plugin</h3>
            
            {/* Show ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Show ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={showId}
                  readOnly
                  className="w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(showId, 'showId')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                  title="Copy Show ID"
                >
                  {copiedField === 'showId' ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Episode ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Episode ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={episodeId}
                  readOnly
                  className="w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(episodeId, 'episodeId')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                  title="Copy Episode ID"
                >
                  {copiedField === 'episodeId' ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Segment ID */}
            {segmentId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Segment ID (Current)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={segmentId}
                    readOnly
                    className="w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(segmentId, 'segmentId')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                    title="Copy Segment ID"
                  >
                    {copiedField === 'segmentId' ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Shot ID */}
            {shotId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shot ID (Current)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={shotId}
                    readOnly
                    className="w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(shotId, 'shotId')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                    title="Copy Shot ID"
                  >
                    {copiedField === 'shotId' ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Copy All Button */}
          {apiKey && (
            <div className="pt-4 border-t">
              <Button
                onClick={copyAll}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
              >
                {copiedField === 'all' ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy All Configuration
                  </>
                )}
              </Button>
              <p className="mt-2 text-xs text-gray-500 text-center">
                This will copy all IDs and API key as JSON for easy pasting into Blender plugin
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="pt-4 border-t bg-blue-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">How to use in Blender:</h4>
            <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
              <li>Copy the API key and endpoint URL</li>
              <li>Paste them into your Blender plugin settings</li>
              <li>Copy the Show ID, Episode ID, and optionally Segment/Shot IDs</li>
              <li>Configure your plugin with these IDs</li>
              <li>When rendering, the plugin will update the shot with your rendered images</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button
            onClick={onClose}
            variant="outline"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

