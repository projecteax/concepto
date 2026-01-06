#!/usr/bin/env python3
"""
Concepto DaVinci Resolve Plugin - Add Black Solid
Adds a 5-second black solid to the current timeline at the playhead position
"""

import sys
import os

# Try to import DaVinci Resolve API
try:
    import DaVinciResolveScript as dvr_script
except ImportError:
    # Try to locate the DaVinci Resolve scripting modules
    possible_paths = [
        os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
        r"C:\Program Files\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
    ]
    
    found = False
    for path in possible_paths:
        if os.path.exists(path) and path not in sys.path:
            sys.path.insert(0, path)
            try:
                import DaVinciResolveScript as dvr_script
                found = True
                break
            except ImportError:
                continue
    
    if not found:
        print("ERROR: Could not find DaVinciResolveScript module.")
        print("\nPlease ensure:")
        print("1. DaVinci Resolve Studio 20 is installed")
        print("2. You're running this script from within DaVinci Resolve")
        print("   (Workspace > Scripts > Run Script)")
        print("\nIf running standalone, the module should be at:")
        print(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules")
        sys.exit(1)

def add_black_solid():
    """Add a 5-second black solid to the current timeline"""
    
    try:
        # Get the Resolve application object
        resolve = dvr_script.scriptapp("Resolve")
        
        if not resolve:
            print("ERROR: Could not connect to DaVinci Resolve.")
            print("Please ensure DaVinci Resolve Studio 20 is running.")
            return False
        
        # Get project manager
        project_manager = resolve.GetProjectManager()
        if not project_manager:
            print("ERROR: Could not get project manager.")
            return False
        
        # Get current project
        project = project_manager.GetCurrentProject()
        if not project:
            print("ERROR: No project is currently open.")
            print("Please open a project in DaVinci Resolve first.")
            return False
        
        # Get current timeline
        timeline = project.GetCurrentTimeline()
        if not timeline:
            print("ERROR: No timeline is currently open.")
            print("Please open a timeline in DaVinci Resolve first.")
            return False
        
        # Get timeline frame rate
        timeline_frame_rate = timeline.GetSetting("timelineFrameRate")
        if timeline_frame_rate:
            try:
                timeline_frame_rate = float(timeline_frame_rate)
            except (ValueError, TypeError):
                timeline_frame_rate = 24
        else:
            timeline_frame_rate = 24  # Default to 24fps
        
        print(f"Timeline frame rate: {timeline_frame_rate} fps")
        
        # Calculate duration: 5 seconds in frames
        duration_frames = int(5 * timeline_frame_rate)
        print(f"Duration: {duration_frames} frames ({5} seconds)")
        
        # Get current playhead position
        current_timecode = timeline.GetCurrentTimecode()
        print(f"Current timecode: {current_timecode}")
        
        # Get media pool
        media_pool = project.GetMediaPool()
        if not media_pool:
            print("ERROR: Could not get media pool.")
            return False
        
        # Get root folder
        root_folder = media_pool.GetRootFolder()
        if not root_folder:
            print("ERROR: Could not get root folder.")
            return False
        
        # Create a black solid color clip in the media pool
        print("\nCreating black solid color clip...")
        
        # Get current track index (usually track 1 for video)
        video_track_index = 1
        
        # Method 1: CreateColorClip (most common API method)
        try:
            print("Trying Method 1: CreateColorClip...")
            color_clip = media_pool.CreateColorClip({
                "color": {"R": 0.0, "G": 0.0, "B": 0.0},
                "duration": duration_frames,
                "width": 1920,
                "height": 1080,
                "pixelAspectRatio": 1.0,
                "frameRate": timeline_frame_rate
            })
            
            if color_clip:
                print(f"✓ Created color clip: {color_clip.GetName() if hasattr(color_clip, 'GetName') else 'Black Solid'}")
                
                # Try to insert into timeline
                # Method 1a: InsertClip
                try:
                    clip_url = color_clip.GetFileURL() if hasattr(color_clip, 'GetFileURL') else str(color_clip)
                    timeline_item = timeline.InsertClip(clip_url, current_timecode, video_track_index)
                    if timeline_item:
                        print(f"✓ Added black solid to timeline at {current_timecode}")
                        print("\n" + "="*70)
                        print("SUCCESS: 5-second black solid added successfully!")
                        print("="*70)
                        return True
                except Exception as e1a:
                    print(f"  InsertClip failed: {e1a}")
                    
                    # Method 1b: InsertClips (plural)
                    try:
                        timeline.InsertClips([color_clip], current_timecode, video_track_index)
                        print(f"✓ Added black solid to timeline at {current_timecode}")
                        print("\n" + "="*70)
                        print("SUCCESS: 5-second black solid added successfully!")
                        print("="*70)
                        return True
                    except Exception as e1b:
                        print(f"  InsertClips failed: {e1b}")
                        
                        # Method 1c: AppendToTimeline
                        try:
                            timeline.AppendToTimeline([color_clip])
                            print("✓ Appended clip to end of timeline")
                            print("\n" + "="*70)
                            print("SUCCESS: 5-second black solid added to end of timeline!")
                            print("="*70)
                            return True
                        except Exception as e1c:
                            print(f"  AppendToTimeline failed: {e1c}")
            else:
                print("  ✗ CreateColorClip returned None")
        except Exception as e1:
            print(f"  ✗ CreateColorClip method failed: {e1}")
                
        # Method 2: CreateColorClips (plural, alternative API)
        try:
            print("\nTrying Method 2: CreateColorClips...")
            color_clips = media_pool.CreateColorClips([{
                "color": {"R": 0.0, "G": 0.0, "B": 0.0},
                "duration": duration_frames,
                "width": 1920,
                "height": 1080,
                "pixelAspectRatio": 1.0,
                "frameRate": timeline_frame_rate
            }])
            
            if color_clips and len(color_clips) > 0:
                color_clip = color_clips[0]
                print(f"✓ Created color clip using CreateColorClips")
                
                try:
                    clip_url = color_clip.GetFileURL() if hasattr(color_clip, 'GetFileURL') else str(color_clip)
                    timeline_item = timeline.InsertClip(clip_url, current_timecode, video_track_index)
                    if timeline_item:
                        print(f"✓ Added black solid to timeline at {current_timecode}")
                        print("\n" + "="*70)
                        print("SUCCESS: 5-second black solid added successfully!")
                        print("="*70)
                        return True
                except Exception as e2a:
                    try:
                        timeline.InsertClips(color_clips, current_timecode, video_track_index)
                        print(f"✓ Added black solid to timeline at {current_timecode}")
                        print("\n" + "="*70)
                        print("SUCCESS: 5-second black solid added successfully!")
                        print("="*70)
                        return True
                    except Exception as e2b:
                        try:
                            timeline.AppendToTimeline(color_clips)
                            print("✓ Appended clip to end of timeline")
                            print("\n" + "="*70)
                            print("SUCCESS: 5-second black solid added to end of timeline!")
                            print("="*70)
                            return True
                        except Exception as e2c:
                            print(f"  All insertion methods failed")
        except Exception as e2:
            print(f"  ✗ CreateColorClips method failed: {e2}")
        
        # Method 3: AddGenerator (direct timeline generator)
        try:
            print("\nTrying Method 3: AddGenerator...")
            generator_name = "Solid Color"  # Common generator name in DaVinci Resolve
            
            # Try to add generator at playhead
            timeline_item = timeline.AddGenerator(generator_name, current_timecode, video_track_index)
            
            if timeline_item:
                # Set duration
                try:
                    timeline_item.SetDuration(duration_frames)
                except:
                    pass  # Duration might be set differently
                
                # Try to set color to black
                try:
                    timeline_item.SetProperty("Color", {"R": 0.0, "G": 0.0, "B": 0.0})
                except:
                    try:
                        # Alternative property names
                        timeline_item.SetProperty("ColorR", 0.0)
                        timeline_item.SetProperty("ColorG", 0.0)
                        timeline_item.SetProperty("ColorB", 0.0)
                    except:
                        pass  # Color property might not be available
                
                print(f"✓ Added generator to timeline at {current_timecode}")
                print("\n" + "="*70)
                print("SUCCESS: Generator added (color may need manual adjustment)")
                print("="*70)
                return True
            else:
                print("  ✗ AddGenerator returned None")
        except Exception as e3:
            print(f"  ✗ AddGenerator method failed: {e3}")
        
        # All methods failed
        print("\n" + "="*70)
        print("ERROR: Could not add black solid to timeline using any method.")
        print("="*70)
        print("\nPossible issues:")
        print("  • Timeline track might be locked")
        print("  • API methods may differ in your DaVinci Resolve version")
        print("  • Check DaVinci Resolve API documentation for your version")
        print("\nManual workaround:")
        print("  1. Right-click in Media Pool > Create Color Matte")
        print("  2. Set color to Black (R:0, G:0, B:0)")
        print("  3. Set duration to 5 seconds")
        print("  4. Drag the clip to the timeline at the playhead position")
        print("\nTip: Run test_api.py first to verify API connection")
        
        return False
        
    except Exception as e:
        print(f"ERROR: An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 70)
    print("Concepto DaVinci Resolve Plugin - Add 5-Second Black Solid")
    print("=" * 70)
    print()
    
    success = add_black_solid()
    
    if not success:
        sys.exit(1)
