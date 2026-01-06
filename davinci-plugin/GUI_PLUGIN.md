# GUI Plugin Guide

## Overview

The **GUI version** (`add_black_solid_gui.py`) provides a user-friendly interface for adding solid colors to your DaVinci Resolve timeline.

## Features

### User Interface Elements

1. **Duration Control**
   - Adjustable duration in seconds (0.1 to 3600 seconds)
   - Default: 5 seconds
   - Supports decimal values (e.g., 2.5 seconds)

2. **Color Picker**
   - Click the color button to open a color picker dialog
   - Default: Black (RGB: 0, 0, 0)
   - Choose any color for your solid

3. **Video Track Selection**
   - Select which video track to add the solid to (1-10)
   - Default: Track 1

4. **Insert Position**
   - Option to insert at playhead position (checked by default)
   - If unchecked, appends to end of timeline

5. **Status Feedback**
   - Real-time status messages
   - Green for success
   - Red for errors
   - Blue for processing

## Usage

1. **Open DaVinci Resolve Studio 20**
2. **Open a project** with a timeline
3. **Position the playhead** where you want the solid (if inserting at playhead)
4. Go to **Workspace > Scripts > Utility**
5. Click on **`add_black_solid_gui.py`**
6. A GUI window will open
7. **Configure your settings:**
   - Set duration
   - Pick a color (optional, defaults to black)
   - Select video track
   - Choose insert position
8. Click **"Add to Timeline"**
9. The solid will be added and status will update

## GUI Libraries

The plugin supports multiple GUI frameworks:

- **PySide2/PySide6** (Qt) - Preferred, if available in DaVinci Resolve
- **Tkinter** - Fallback, built into Python

The plugin will automatically detect and use the best available option.

## Examples

### Quick Black Solid
- Duration: 5 seconds
- Color: Black (default)
- Track: 1
- Position: At playhead
- Just click "Add to Timeline"!

### Custom Color Bumper
- Duration: 3 seconds
- Color: Your brand color (pick from color picker)
- Track: 2
- Position: At playhead

### Timeline End Marker
- Duration: 1 second
- Color: Black
- Track: 1
- Position: End of timeline (uncheck "at playhead")

## Troubleshooting

### GUI doesn't open
- Ensure DaVinci Resolve Studio is running
- Check that a project and timeline are open
- PySide2/PySide6 should be included with DaVinci Resolve

### Color picker doesn't work
- If PySide is not available, tkinter color picker will be used
- Some systems may have limited color picker functionality

### "Processing..." hangs
- Check that timeline track is not locked
- Verify playhead position is valid
- Try appending to end instead of inserting at playhead

## Technical Details

- **Location**: `C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Fusion\Scripts\Utility\`
- **File**: `add_black_solid_gui.py`
- **Size**: ~16 KB
- **Dependencies**: DaVinciResolveScript API, PySide (preferred) or Tkinter

## Comparison: GUI vs Command-Line

| Feature | GUI Version | Command-Line Version |
|---------|-------------|---------------------|
| User-friendly | ✅ Yes | ❌ No |
| Customizable | ✅ Full control | ❌ Fixed 5s black |
| Color selection | ✅ Color picker | ❌ Black only |
| Duration control | ✅ Adjustable | ❌ Fixed 5s |
| Track selection | ✅ Choose track | ❌ Track 1 only |
| Status feedback | ✅ Visual | ❌ Console only |

**Recommendation**: Use the GUI version for all workflows!


