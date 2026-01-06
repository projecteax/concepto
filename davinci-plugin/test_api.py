#!/usr/bin/env python3
"""
Test script to check if DaVinci Resolve API is accessible
Run this from within DaVinci Resolve to diagnose connection issues
"""

import sys
import os

print("=" * 70)
print("DaVinci Resolve API Connection Test")
print("=" * 70)
print()

# Try to import DaVinci Resolve API
print("Step 1: Importing DaVinci Resolve API module...")
try:
    import DaVinciResolveScript as dvr_script
    print("✓ Successfully imported DaVinciResolveScript")
except ImportError:
    print("✗ Failed to import DaVinciResolveScript")
    print("\nTrying to locate module...")
    
    possible_paths = [
        os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
        r"C:\Program Files\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
    ]
    
    for path in possible_paths:
        print(f"  Checking: {path}")
        if os.path.exists(path):
            print(f"  ✓ Path exists")
            if path not in sys.path:
                sys.path.insert(0, path)
                try:
                    import DaVinciResolveScript as dvr_script
                    print(f"  ✓ Successfully imported from {path}")
                    break
                except ImportError:
                    print(f"  ✗ Import failed from {path}")
        else:
            print(f"  ✗ Path does not exist")
    else:
        print("\nERROR: Could not find DaVinciResolveScript module")
        print("\nPlease ensure:")
        print("1. DaVinci Resolve Studio 20 is installed")
        print("2. You're running this from within DaVinci Resolve")
        print("   (Workspace > Scripts > Run Script)")
        sys.exit(1)

print()

# Try to get Resolve object
print("Step 2: Connecting to DaVinci Resolve...")
try:
    resolve = dvr_script.scriptapp("Resolve")
    if resolve:
        print("✓ Successfully connected to DaVinci Resolve")
    else:
        print("✗ Could not connect to DaVinci Resolve")
        print("  Make sure DaVinci Resolve Studio 20 is running")
        sys.exit(1)
except Exception as e:
    print(f"✗ Error connecting: {e}")
    sys.exit(1)

print()

# Get project manager
print("Step 3: Getting project manager...")
try:
    project_manager = resolve.GetProjectManager()
    if project_manager:
        print("✓ Project manager retrieved")
    else:
        print("✗ Could not get project manager")
        sys.exit(1)
except Exception as e:
    print(f"✗ Error getting project manager: {e}")
    sys.exit(1)

print()

# Get current project
print("Step 4: Getting current project...")
try:
    project = project_manager.GetCurrentProject()
    if project:
        project_name = project.GetName()
        print(f"✓ Current project: {project_name}")
    else:
        print("⚠ No project is currently open")
        print("  (This is okay for testing, but you'll need a project to use the plugin)")
except Exception as e:
    print(f"✗ Error getting project: {e}")

print()

# Get current timeline
if project:
    print("Step 5: Getting current timeline...")
    try:
        timeline = project.GetCurrentTimeline()
        if timeline:
            timeline_name = timeline.GetName()
            frame_rate = timeline.GetSetting("timelineFrameRate")
            print(f"✓ Current timeline: {timeline_name}")
            print(f"  Frame rate: {frame_rate} fps")
        else:
            print("⚠ No timeline is currently open")
            print("  (You'll need a timeline open to use the plugin)")
    except Exception as e:
        print(f"✗ Error getting timeline: {e}")

print()

# Get media pool
if project:
    print("Step 6: Getting media pool...")
    try:
        media_pool = project.GetMediaPool()
        if media_pool:
            print("✓ Media pool retrieved")
        else:
            print("✗ Could not get media pool")
    except Exception as e:
        print(f"✗ Error getting media pool: {e}")

print()
print("=" * 70)
print("Test completed!")
print("=" * 70)
print()
print("If all steps passed, the API is working correctly.")
print("You should be able to run add_black_solid.py successfully.")


