'use client';

import { useState, useRef, useCallback } from 'react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { 
  Save, 
  Trash2, 
  Download, 
  Palette, 
  Eraser, 
  Undo, 
  Redo,
  X,
  Settings
} from 'lucide-react';

interface StoryboardDrawerProps {
  onSave: (imageData: string) => void;
  onClose: () => void;
  initialImage?: string;
  title?: string;
  isUploading?: boolean;
}

interface DrawingTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  width: number;
}

const drawingTools: DrawingTool[] = [
  { id: 'pen', name: 'Pen', icon: <Palette className="w-4 h-4" />, color: '#000000', width: 2 },
  { id: 'marker', name: 'Marker', icon: <Palette className="w-4 h-4" />, color: '#000000', width: 4 },
  { id: 'pencil', name: 'Pencil', icon: <Palette className="w-4 h-4" />, color: '#666666', width: 1 },
  { id: 'eraser', name: 'Eraser', icon: <Eraser className="w-4 h-4" />, color: '#ffffff', width: 8 },
];

const colors = [
  '#000000', '#333333', '#666666', '#999999', '#cccccc',
  '#ff0000', '#ff6600', '#ffcc00', '#00ff00', '#0066ff',
  '#6600ff', '#ff0066', '#ffffff'
];

export default function StoryboardDrawer({ onSave, onClose, title = "Draw Storyboard", isUploading = false }: StoryboardDrawerProps) {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [selectedTool, setSelectedTool] = useState('pen');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [showSettings, setShowSettings] = useState(false);

  const handleSave = useCallback(async () => {
    if (!canvasRef.current) return;
    
    try {
      const imageData = await canvasRef.current.exportImage('png');
      onSave(imageData);
    } catch (error) {
      console.error('Error saving drawing:', error);
    }
  }, [onSave]);

  const handleClear = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.clearCanvas();
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.undo();
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (canvasRef.current) {
      canvasRef.current.redo();
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!canvasRef.current) return;
    
    try {
      const imageData = await canvasRef.current.exportImage('png');
      const link = document.createElement('a');
      link.download = `storyboard-${Date.now()}.png`;
      link.href = imageData;
      link.click();
    } catch (error) {
      console.error('Error exporting drawing:', error);
    }
  }, []);


  const handleToolChange = (toolId: string) => {
    setSelectedTool(toolId);
    const tool = drawingTools.find(t => t.id === toolId);
    if (tool) {
      setSelectedColor(tool.color);
      setStrokeWidth(tool.width);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-4">
            {/* Drawing Tools */}
            <div className="flex items-center space-x-2">
              {drawingTools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => handleToolChange(tool.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    selectedTool === tool.id
                      ? 'bg-indigo-100 text-indigo-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title={tool.name}
                >
                  {tool.icon}
                </button>
              ))}
            </div>

            {/* Color Picker */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Color:</span>
              <div className="flex items-center space-x-1">
                {colors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      selectedColor === color
                        ? 'border-gray-800 scale-110'
                        : 'border-gray-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Stroke Width */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Size:</span>
              <input
                type="range"
                min="1"
                max="20"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-gray-600 w-6">{strokeWidth}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleUndo}
              className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
              title="Undo"
            >
              <Undo className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
              title="Redo"
            >
              <Redo className="w-4 h-4" />
            </button>
            <button
              onClick={handleClear}
              className="p-2 text-red-600 hover:text-red-800 transition-colors"
              title="Clear"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleExport}
              className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
              title="Export"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={isUploading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isUploading ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>

        {/* Drawing Canvas */}
        <div className="flex-1 p-4">
          <div className="w-full h-full border border-gray-300 rounded-lg overflow-hidden">
            <ReactSketchCanvas
              ref={canvasRef}
              width="100%"
              height="100%"
              strokeColor={selectedColor}
              strokeWidth={strokeWidth}
              eraserWidth={strokeWidth}
              allowOnlyPointerType="all"
              style={{
                border: 'none',
                touchAction: 'none', // Important for iPad Pro
              }}
              canvasColor="white"
              withTimestamp={true}
              onStroke={() => {}}
              // iPad Pro and Apple Pencil optimizations
              className="touch-none" // Disable default touch behaviors
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600 text-center">
            <p className="mb-2">
              <strong>iPad Pro Users:</strong> Use your Apple Pencil for pressure-sensitive drawing. 
              Touch with your finger to pan and zoom.
            </p>
            <p>
              <strong>Desktop Users:</strong> Use your mouse or trackpad to draw. 
              Hold Shift while drawing for straight lines.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
