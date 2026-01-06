#!/usr/bin/env python3
"""
DaVinci Resolve API Diagnostic Tool
This script tests what API methods are actually available in your DaVinci Resolve installation
"""

import sys
import os

# Try to import DaVinci Resolve API
try:
    import DaVinciResolveScript as dvr_script
except ImportError:
    possible_paths = [
        os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
    ]
    
    for path in possible_paths:
        if os.path.exists(path) and path not in sys.path:
            sys.path.insert(0, path)
            try:
                import DaVinciResolveScript as dvr_script
                break
            except ImportError:
                continue
    else:
        print("ERROR: Could not import DaVinciResolveScript")
        sys.exit(1)

def test_api():
    """Test available API methods"""
    print("=" * 70)
    print("DaVinci Resolve API Diagnostic Tool")
    print("=" * 70)
    print()
    
    try:
        # Get Resolve
        resolve = dvr_script.scriptapp("Resolve")
        if not resolve:
            print("✗ Could not connect to DaVinci Resolve")
            return
        print("✓ Connected to DaVinci Resolve")
        
        # Get Project Manager
        project_manager = resolve.GetProjectManager()
        if not project_manager:
            print("✗ Could not get Project Manager")
            return
        print("✓ Got Project Manager")
        
        # Get Current Project
        project = project_manager.GetCurrentProject()
        if not project:
            print("⚠ No project open (this is OK for testing)")
            return
        print(f"✓ Current Project: {project.GetName()}")
        
        # Get Timeline
        timeline = project.GetCurrentTimeline()
        if not timeline:
            print("⚠ No timeline open (this is OK for testing)")
            return
        print(f"✓ Current Timeline: {timeline.GetName()}")
        
        # Get Media Pool
        media_pool = project.GetMediaPool()
        if not media_pool:
            print("✗ Could not get Media Pool")
            return
        print("✓ Got Media Pool")
        
        print()
        print("=" * 70)
        print("Testing Media Pool Methods:")
        print("=" * 70)
        
        # Test CreateColorClip
        print("\n1. Testing CreateColorClip...")
        try:
            method = getattr(media_pool, 'CreateColorClip', None)
            if method and callable(method):
                print("   ✓ CreateColorClip method exists and is callable")
                # Try with minimal parameters
                try:
                    result = media_pool.CreateColorClip({
                        "color": {"R": 0.0, "G": 0.0, "B": 0.0},
                        "duration": 120,
                        "width": 1920,
                        "height": 1080
                    })
                    if result:
                        print("   ✓ CreateColorClip works! Returned:", type(result))
                    else:
                        print("   ⚠ CreateColorClip returned None")
                except Exception as e:
                    print(f"   ✗ CreateColorClip failed: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print("   ✗ CreateColorClip method does not exist or is not callable")
        except Exception as e:
            print(f"   ✗ Error testing CreateColorClip: {e}")
        
        # Test CreateColorClips
        print("\n2. Testing CreateColorClips...")
        try:
            method = getattr(media_pool, 'CreateColorClips', None)
            if method and callable(method):
                print("   ✓ CreateColorClips method exists and is callable")
                try:
                    result = media_pool.CreateColorClips([{
                        "color": {"R": 0.0, "G": 0.0, "B": 0.0},
                        "duration": 120,
                        "width": 1920,
                        "height": 1080
                    }])
                    if result:
                        print("   ✓ CreateColorClips works! Returned:", type(result))
                    else:
                        print("   ⚠ CreateColorClips returned None")
                except Exception as e:
                    print(f"   ✗ CreateColorClips failed: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print("   ✗ CreateColorClips method does not exist or is not callable")
        except Exception as e:
            print(f"   ✗ Error testing CreateColorClips: {e}")
        
        # Test CreateGeneratorClip
        print("\n3. Testing CreateGeneratorClip...")
        try:
            method = getattr(media_pool, 'CreateGeneratorClip', None)
            if method and callable(method):
                print("   ✓ CreateGeneratorClip method exists and is callable")
                try:
                    result = media_pool.CreateGeneratorClip("Solid Color", 120)
                    if result:
                        print("   ✓ CreateGeneratorClip works! Returned:", type(result))
                    else:
                        print("   ⚠ CreateGeneratorClip returned None")
                except Exception as e:
                    print(f"   ✗ CreateGeneratorClip failed: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print("   ✗ CreateGeneratorClip method does not exist or is not callable")
        except Exception as e:
            print(f"   ✗ Error testing CreateGeneratorClip: {e}")
        
        print()
        print("=" * 70)
        print("Testing Timeline Methods:")
        print("=" * 70)
        
        # Test AddGenerator
        print("\n4. Testing AddGenerator...")
        try:
            method = getattr(timeline, 'AddGenerator', None)
            if method and callable(method):
                print("   ✓ AddGenerator method exists and is callable")
                try:
                    # Get current timecode or use 0
                    timecode = timeline.GetCurrentTimecode() or "00:00:00:00"
                    result = timeline.AddGenerator("Solid Color", timecode, 1)
                    if result:
                        print("   ✓ AddGenerator works! Returned:", type(result))
                        # Try to get properties
                        try:
                            if hasattr(result, 'GetProperties'):
                                props = result.GetProperties()
                                print(f"   ✓ Timeline item has GetProperties: {props}")
                        except:
                            pass
                    else:
                        print("   ⚠ AddGenerator returned None")
                except Exception as e:
                    print(f"   ✗ AddGenerator failed: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print("   ✗ AddGenerator method does not exist or is not callable")
        except Exception as e:
            print(f"   ✗ Error testing AddGenerator: {e}")
        
        # Test InsertClip
        print("\n5. Testing InsertClip...")
        try:
            if hasattr(timeline, 'InsertClip'):
                print("   ✓ InsertClip method exists")
            else:
                print("   ✗ InsertClip method does not exist")
        except Exception as e:
            print(f"   ✗ Error testing InsertClip: {e}")
        
        # Test InsertClips
        print("\n6. Testing InsertClips...")
        try:
            if hasattr(timeline, 'InsertClips'):
                print("   ✓ InsertClips method exists")
            else:
                print("   ✗ InsertClips method does not exist")
        except Exception as e:
            print(f"   ✗ Error testing InsertClips: {e}")
        
        # Test AppendToTimeline
        print("\n7. Testing AppendToTimeline...")
        try:
            if hasattr(timeline, 'AppendToTimeline'):
                print("   ✓ AppendToTimeline method exists")
            else:
                print("   ✗ AppendToTimeline method does not exist")
        except Exception as e:
            print(f"   ✗ Error testing AppendToTimeline: {e}")
        
        print()
        print("=" * 70)
        print("Listing all Media Pool methods:")
        print("=" * 70)
        media_pool_methods = [m for m in dir(media_pool) if not m.startswith('_') and callable(getattr(media_pool, m))]
        for method in sorted(media_pool_methods):
            if 'color' in method.lower() or 'generator' in method.lower() or 'create' in method.lower():
                print(f"  - {method}")
        
        print()
        print("=" * 70)
        print("Listing all Timeline methods:")
        print("=" * 70)
        timeline_methods = [m for m in dir(timeline) if not m.startswith('_') and callable(getattr(timeline, m))]
        for method in sorted(timeline_methods):
            if 'generator' in method.lower() or 'insert' in method.lower() or 'append' in method.lower() or 'add' in method.lower():
                print(f"  - {method}")
        
        print()
        print("=" * 70)
        print("Diagnostic Complete!")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n✗ Error during diagnostic: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_api()

