'use client';

import React from 'react';
import { 
  X, 
  HelpCircle,
  Users,
  FileText,
  AlignLeft,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Sparkles,
  Wand2,
  Play,
  Pause,
  Scissors,
  Volume2,
  Upload,
  Download,
  History,
  Save,
  Eye,
  BookOpen,
  Copy,
  Type,
  MapPin,
  Camera,
  GripVertical,
  Edit3,
  Trash2,
  Plus,
  Check,
  Key,
  Package,
  Menu,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EpisodeHelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'overview' | 'av-script' | 'av-preview' | 'av-editing' | 'screenwriting' | 'characters' | 'locations' | 'gadgets';
}

export function EpisodeHelpDialog({ isOpen, onClose, activeTab }: EpisodeHelpDialogProps) {
  if (!isOpen) return null;

  const getHelpContent = () => {
    switch (activeTab) {
      case 'av-script':
        return {
          title: 'AV Script Help',
          content: (
            <div className="space-y-6 text-sm">
              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  Overview
                </h3>
                <p className="text-gray-700 mb-4">
                  The AV Script editor allows you to create and manage audio-visual scripts for your episode. 
                  Organize your content into segments and shots, generate images and videos, and collaborate in real-time.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Creating Segments and Shots
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Click <strong>&quot;Add Segment&quot;</strong> to create a new scene segment</li>
                  <li>Within each segment, click <strong>&quot;Add Shot&quot;</strong> to add individual shots</li>
                  <li>Each shot can have a visual description, audio text, duration, and shot type</li>
                  <li>Use the <GripVertical className="w-4 h-4 inline" /> grip handle to drag and reorder shots</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-600" />
                  Generating Images
                </h3>
                <ol className="space-y-2 text-gray-700 list-decimal list-inside">
                  <li>Click the <ImageIcon className="w-4 h-4 inline" /> <strong>&quot;Generate Image&quot;</strong> button on any shot</li>
                  <li>In the dialog, review the visual description (auto-filled from your shot)</li>
                  <li>Select an AI model (Gemini 2.5 Flash, etc.)</li>
                  <li>Optionally reference global assets (characters, locations, gadgets) for consistency</li>
                  <li>Use the chat interface to refine the image with follow-up requests</li>
                  <li>Click <strong>&quot;Use This Image&quot;</strong> to apply it to the shot</li>
                </ol>
                <p className="mt-3 text-gray-600 text-xs">
                  <Info className="w-3 h-3 inline mr-1" />
                  Tip: Reference your global assets to maintain visual consistency across shots
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Video className="w-5 h-5 text-indigo-600" />
                  Generating Videos
                </h3>
                <ol className="space-y-2 text-gray-700 list-decimal list-inside">
                  <li>Click the <Video className="w-4 h-4 inline" /> <strong>&quot;Generate Video&quot;</strong> button on any shot</li>
                  <li>Select a video model (Veo 3.1, SORA 2, Kling, Runway, etc.)</li>
                  <li>Provide a video prompt describing the motion and action</li>
                  <li>Optionally upload a reference image to guide the generation</li>
                  <li>Set duration and other parameters based on the model</li>
                  <li>Use the chat to refine the video generation</li>
                  <li>Click <strong>&quot;Use This Video&quot;</strong> to apply it to the shot</li>
                </ol>
                <p className="mt-3 text-gray-600 text-xs">
                  <Info className="w-3 h-3 inline mr-1" />
                  Note: Video generation may take several minutes depending on the model and duration
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  AI Enhancement
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Click <Sparkles className="w-4 h-4 inline" /> <strong>&quot;Enhance&quot;</strong> to improve shot descriptions using AI</li>
                  <li>Use <strong>&quot;Auto-Populate&quot;</strong> to automatically generate AV script from screenplay</li>
                  <li>AI will analyze your screenplay and create corresponding segments and shots</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-indigo-600" />
                  Importing and Exporting
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Use <Menu className="w-4 h-4 inline" /> <strong>&quot;More Actions&quot;</strong> → <strong>&quot;Import AV&quot;</strong> to import from external files</li>
                  <li>Download <Package className="w-4 h-4 inline" /> <strong>&quot;Blender Plugin&quot;</strong> or <Video className="w-4 h-4 inline" /> <strong>&quot;Resolve Plugin&quot;</strong> for integration</li>
                  <li>Get API keys via <Key className="w-4 h-4 inline" /> <strong>&quot;Get API&quot;</strong> for external automation</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  Version Control
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Save stable versions of your script using <History className="w-4 h-4 inline" /> <strong>&quot;Save Stable Version&quot;</strong></li>
                  <li>Restore previous versions from the stable versions panel</li>
                  <li>Compare versions to track changes over time</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                  Comments
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Add comments to segments and shots for collaboration</li>
                  <li>Comments are visible to all team members with access</li>
                  <li>Use comments to provide feedback and notes</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Save className="w-5 h-5 text-indigo-600" />
                  Saving Your Work
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Changes are automatically saved at regular intervals as you work</li>
                  <li>Use the <Save className="w-4 h-4 inline" /> <strong>&quot;Save&quot;</strong> button to manually save your work</li>
                  <li><strong>Important:</strong> Always use the manual save button when finishing your work to ensure all changes are saved</li>
                  <li>Real-time sync ensures changes are synced across all collaborators</li>
                </ul>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-800 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <strong>Real-time Sync:</strong> Changes are automatically saved and synced across all collaborators in real-time
                </p>
              </div>
            </div>
          ),
        };

      case 'av-preview':
        return {
          title: 'AV Preview Help',
          content: (
            <div className="space-y-6 text-sm">
              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Play className="w-5 h-5 text-indigo-600" />
                  Overview
                </h3>
                <p className="text-gray-700 mb-4">
                  AV Preview is a timeline-based editor where you can assemble, edit, and preview your episode. 
                  Drag clips, adjust timing, mix audio, and export your final composition.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Play className="w-5 h-5 text-indigo-600" />
                  Playback Controls
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li><Play className="w-4 h-4 inline" /> <strong>Play/Pause:</strong> Control playback of your timeline</li>
                  <li><strong>Skip Back:</strong> Jump to the beginning of the timeline</li>
                  <li>Use the timeline scrubber to navigate to any point in your episode</li>
                  <li>Zoom in/out to see more detail or a broader view</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-indigo-600" />
                  Editing Tools
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li><Scissors className="w-4 h-4 inline" /> <strong>Razor Tool (C):</strong> Click on a clip to split it at the playhead</li>
                  <li><strong>Drag Clips:</strong> Click and drag clips to reposition them on the timeline</li>
                  <li><strong>Trim Clips:</strong> Hover over clip edges and drag to adjust start/end points</li>
                  <li><strong>Delete:</strong> Select a clip and press Delete or use the trash icon</li>
                  <li><strong>Lock Length:</strong> Toggle to prevent accidental trimming when dragging</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-indigo-600" />
                  Audio Controls
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Adjust volume for individual clips using the volume slider</li>
                  <li>Mute/unmute video clips to control audio playback</li>
                  <li>View audio waveforms to see audio levels visually</li>
                  <li>Mix multiple audio tracks for layered sound</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <GripVertical className="w-5 h-5 text-indigo-600" />
                  Timeline Management
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Drag clips between tracks to reorganize</li>
                  <li>Select multiple clips by clicking while holding Shift</li>
                  <li>Use the timeline scale slider to adjust zoom level</li>
                  <li>Clips automatically snap to prevent gaps</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Download className="w-5 h-5 text-indigo-600" />
                  Export Options
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li><Download className="w-4 h-4 inline" /> <strong>Export FCPXML:</strong> Export for Final Cut Pro</li>
                  <li><strong>Render Video:</strong> Generate a final video file from your timeline</li>
                  <li>Export settings allow you to customize resolution and quality</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  Stable Versions
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Save stable versions of your preview to preserve work</li>
                  <li>Restore previous versions if needed</li>
                  <li>Compare versions to see what changed</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Save className="w-5 h-5 text-indigo-600" />
                  Saving Your Work
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Changes are automatically saved at regular intervals as you work</li>
                  <li>Use the <Save className="w-4 h-4 inline" /> <strong>&quot;Save&quot;</strong> button to manually save your work</li>
                  <li><strong>Important:</strong> Always use the manual save button when finishing your work to ensure all changes are saved</li>
                </ul>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-blue-800 text-xs">
                  <Info className="w-4 h-4 inline mr-1" />
                  <strong>Tip:</strong> Use keyboard shortcuts for faster editing. Press <kbd className="px-1 py-0.5 bg-white border rounded text-xs">C</kbd> to toggle razor tool.
                </p>
              </div>
            </div>
          ),
        };

      case 'screenwriting':
        return {
          title: 'Screenwriting Help',
          content: (
            <div className="space-y-6 text-sm">
              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  Overview
                </h3>
                <p className="text-gray-700 mb-4">
                  The Screenwriting editor allows you to create professional screenplays with proper formatting. 
                  Add scenes, dialogue, character actions, and more using industry-standard screenplay elements.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Type className="w-5 h-5 text-indigo-600" />
                  Screenplay Elements
                </h3>
                <div className="space-y-3 text-gray-700">
                  <div className="flex items-start gap-3">
                    <Type className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong className="text-red-600">Scene Setting:</strong> Describes the location and time of day. 
                      Format: &quot;INT./EXT. LOCATION - TIME OF DAY&quot;. Always in UPPERCASE, bold.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong className="text-blue-600">Character:</strong> The name of the character speaking. 
                      Always in UPPERCASE, centered on the page, bold.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong className="text-green-600">Action:</strong> Describes what&apos;s happening in the scene. 
                      Written in present tense, left-aligned with standard margins.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MessageSquare className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong className="text-orange-600">Parenthetical:</strong> Stage directions within dialogue. 
                      Appears in parentheses, indented, italicized.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <AlignLeft className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong className="text-purple-600">Dialogue:</strong> The spoken lines by characters. 
                      Positioned below the character name, indented from both margins.
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  Adding Elements
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Click <strong>&quot;Add Element&quot;</strong> to insert a new screenplay element</li>
                  <li>Select the element type from the dropdown (Scene Setting, Character, Dialogue, etc.)</li>
                  <li>Type your content in the text field</li>
                  <li>Elements are automatically formatted according to industry standards</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-indigo-600" />
                  Editing Elements
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Click on any element to edit its content</li>
                  <li>Use <GripVertical className="w-4 h-4 inline" /> drag handles to reorder elements</li>
                  <li>Click <Trash2 className="w-4 h-4 inline" /> to delete an element</li>
                  <li>Changes are automatically saved at regular intervals as you type</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Save className="w-5 h-5 text-indigo-600" />
                  Saving Your Work
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Changes are automatically saved at regular intervals as you work</li>
                  <li>Use the <Save className="w-4 h-4 inline" /> <strong>&quot;Save&quot;</strong> button to manually save your work</li>
                  <li><strong>Important:</strong> Always use the manual save button when finishing your work to ensure all changes are saved</li>
                  <li>The "Last saved" timestamp shows when your work was last saved</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-indigo-600" />
                  AI Features
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li><Wand2 className="w-4 h-4 inline" /> <strong>Auto-Create:</strong> Generate a complete screenplay using AI based on your episode description</li>
                  <li><Sparkles className="w-4 h-4 inline" /> <strong>Enhance:</strong> Improve individual elements with AI suggestions</li>
                  <li><BookOpen className="w-4 h-4 inline" /> <strong>Narrative Descriptions:</strong> Generate prose descriptions from your screenplay</li>
                  <li><Copy className="w-4 h-4 inline" /> <strong>Copy Script From:</strong> Import screenplay from another episode</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                  Comments
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Click the <MessageSquare className="w-4 h-4 inline" /> comment icon on any element</li>
                  <li>Add comments to provide feedback or notes</li>
                  <li>Comments appear in a panel on the right side, aligned with the element</li>
                  <li>All team members can view and respond to comments</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-indigo-600" />
                  Preview and Export
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li><Eye className="w-4 h-4 inline" /> <strong>Preview:</strong> View your screenplay in a clean, formatted view</li>
                  <li><Download className="w-4 h-4 inline" /> <strong>Export PDF:</strong> Download your screenplay as a PDF file</li>
                  <li><Download className="w-4 h-4 inline" /> <strong>Export VO:</strong> Export voice-over script format</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  Version Control
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Save stable versions of your screenplay</li>
                  <li>Restore previous versions if needed</li>
                  <li>Track changes over time</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-indigo-600" />
                  Automatic Translation
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Click the <Wand2 className="w-4 h-4 inline" /> translation button when viewing EN version</li>
                  <li>Confirm translation in the popup dialog</li>
                  <li>Automatically translates from Polish (PL) to English (EN)</li>
                  <li>Can also translate from English (EN) to Polish (PL)</li>
                  <li>Translation preserves element types and structure</li>
                  <li>Review and edit translations as needed after generation</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
                  <Type className="w-5 h-5 text-indigo-600" />
                  Language Support
                </h3>
                <ul className="space-y-2 text-gray-700 list-disc list-inside">
                  <li>Switch between Polish (PL) and English (EN) versions using the language toggle</li>
                  <li>Both versions are maintained separately</li>
                  <li>Elements are color-coded to show which language was last edited</li>
                  <li>Use automatic translation to convert between languages</li>
                </ul>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-indigo-800 text-xs">
                  <Info className="w-4 h-4 inline mr-1" />
                  <strong>Industry Standard:</strong> Screenplay formatting follows industry conventions used in professional film and television production.
                </p>
              </div>
            </div>
          ),
        };

      default:
        return {
          title: 'Help',
          content: (
            <div className="text-sm text-gray-700">
              <p>Select a tab to view help instructions for that section.</p>
            </div>
          ),
        };
    }
  };

  const { title, content } = getHelpContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <Button onClick={onClose} variant="default">
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
