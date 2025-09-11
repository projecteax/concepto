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
  Settings,
  ZoomIn,
  Edit3
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
  const [strokeOpacity, setStrokeOpacity] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(true);

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

  // Helper function to convert hex color to rgba with opacity
  const hexToRgba = (hex: string, opacity: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  // Get the current stroke color with opacity
  const getStrokeColorWithOpacity = (): string => {
    if (selectedColor === '#ffffff') return selectedColor; // Keep white as is for eraser
    return hexToRgba(selectedColor, strokeOpacity);
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
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-col space-y-3">
            {/* First Row: Mode Toggle and Drawing Tools */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* Drawing/Zoom Mode Toggle */}
                <div className="flex items-center space-x-2 bg-gray-200 rounded-lg p-1">
                  <button
                    onClick={() => setIsDrawingMode(true)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 ${
                      isDrawingMode
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                    title="Drawing Mode"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Draw</span>
                  </button>
                  <button
                    onClick={() => setIsDrawingMode(false)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 ${
                      !isDrawingMode
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                    title="Zoom/Pan Mode"
                  >
                    <ZoomIn className="w-4 h-4" />
                    <span>Zoom</span>
                  </button>
                </div>

                {/* Drawing Tools */}
                <div className="flex items-center space-x-2">
                  {drawingTools.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => handleToolChange(tool.id)}
                      disabled={!isDrawingMode}
                      className={`p-2 rounded-lg transition-colors ${
                        selectedTool === tool.id
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'text-gray-600 hover:bg-gray-100'
                      } ${!isDrawingMode ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={tool.name}
                    >
                      {tool.icon}
                    </button>
                  ))}
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

            {/* Second Row: Color, Size, and Opacity Controls */}
            <div className="flex items-center space-x-6">
              {/* Color Picker */}
              <div className={`flex items-center space-x-2 ${!isDrawingMode ? 'opacity-50' : ''}`}>
                <span className="text-sm text-gray-600">Color:</span>
                <div className="flex items-center space-x-1">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => isDrawingMode && setSelectedColor(color)}
                      disabled={!isDrawingMode}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        selectedColor === color
                          ? 'border-gray-800 scale-110'
                          : 'border-gray-300 hover:scale-105'
                      } ${!isDrawingMode ? 'cursor-not-allowed' : ''}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              {/* Stroke Width */}
              <div className={`flex items-center space-x-2 ${!isDrawingMode ? 'opacity-50' : ''}`}>
                <span className="text-sm text-gray-600">Size:</span>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={strokeWidth}
                  onChange={(e) => isDrawingMode && setStrokeWidth(Number(e.target.value))}
                  disabled={!isDrawingMode}
                  className="w-20"
                />
                <span className="text-sm text-gray-600 w-6">{strokeWidth}</span>
              </div>

              {/* Stroke Opacity */}
              <div className={`flex items-center space-x-2 ${!isDrawingMode ? 'opacity-50' : ''}`}>
                <span className="text-sm text-gray-600">Opacity:</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={strokeOpacity}
                  onChange={(e) => isDrawingMode && setStrokeOpacity(Number(e.target.value))}
                  disabled={!isDrawingMode}
                  className="w-20"
                />
                <span className="text-sm text-gray-600 w-8">{Math.round(strokeOpacity * 100)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawing Canvas */}
        <div className="flex-1 p-4">
          <div className="w-full h-full border border-gray-300 rounded-lg overflow-hidden">
            <ReactSketchCanvas
              ref={canvasRef}
              width="100%"
              height="100%"
              strokeColor={getStrokeColorWithOpacity()}
              strokeWidth={strokeWidth}
              eraserWidth={strokeWidth}
              allowOnlyPointerType={isDrawingMode ? "all" : "none"}
              style={{
                border: 'none',
                touchAction: isDrawingMode ? 'none' : 'auto', // Allow zoom/pan in zoom mode
                cursor: isDrawingMode ? 'crosshair' : 'grab',
              }}
              canvasColor="white"
              withTimestamp={true}
              onStroke={() => {}}
              // iPad Pro and Apple Pencil optimizations
              className={isDrawingMode ? "touch-none" : "touch-auto"} // Enable touch behaviors in zoom mode
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600 text-center">
            <p className="mb-2">
              <strong>iPad Users:</strong> Toggle between &quot;Draw&quot; and &quot;Zoom&quot; modes using the buttons above. 
              In Draw mode, use your finger or Apple Pencil to draw. In Zoom mode, pinch to zoom and pan.
            </p>
            <p>
              <strong>Desktop Users:</strong> Use your mouse or trackpad to draw in Draw mode. 
              Switch to Zoom mode to pan and zoom with mouse wheel.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              <strong>Tip:</strong> Adjust stroke opacity for transparent effects. All drawing tools are disabled in Zoom mode.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
