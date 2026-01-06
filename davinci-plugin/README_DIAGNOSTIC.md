# Diagnostic Instructions

## Step 1: Run the Diagnostic Script

The diagnostic script will tell us exactly which methods are available in your DaVinci Resolve installation.

1. **Open DaVinci Resolve Studio 20**
2. **Open a project** with a timeline
3. Go to **Workspace > Scripts > Utility**
4. Run **`diagnose_api.py`**
5. **Copy the entire output** from the console
6. **Share the output** with me

## What the Diagnostic Shows

The script tests:
- ✅ Which methods exist in Media Pool
- ✅ Which methods exist in Timeline
- ✅ Which methods are actually callable
- ✅ Which methods work when called
- ✅ Lists all available methods

## Step 2: Based on Results

Once I see the diagnostic output, I'll update the plugin to use the **correct methods** that actually exist in your DaVinci Resolve version.

## Current Error

Right now, the plugin is trying methods that don't exist or aren't callable:
- `AddGenerator` - NoneType not callable
- `CreateColorClip` - NoneType not callable  
- `CreateColorClips` - NoneType not callable

This means your version might use different method names or a completely different API approach. The diagnostic will reveal what's actually available!


