# Concepto DaVinci Resolve Plugin

A simple plugin for DaVinci Resolve Studio 20 that adds a 5-second black solid to your timeline with one click.

## Features

- **Add Black Solid**: Automatically adds a 5-second black solid color clip to the current timeline
- **Smart Positioning**: Inserts the clip at the current playhead position
- **Easy to Use**: Just run the script from within DaVinci Resolve

## Installation

### For DaVinci Resolve Studio 20 (Windows)

1. **Locate the Scripts Directory**

   The scripts directory for DaVinci Resolve on Windows (for this installation):
   ```
   C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts
   ```

2. **Copy the Script**

   Copy `add_black_solid.py` to the scripts directory above.

3. **Access the Script in DaVinci Resolve**

   - Open DaVinci Resolve Studio 20
   - Go to `Workspace` > `Scripts`
   - Click on `add_black_solid.py` (it should appear in the menu)
   - The script will run and add a 5-second black solid to your timeline

## Quick Setup

### Option 1: Manual Copy (One-time setup)

1. Open File Explorer
2. Navigate to: `C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts`
   - Press `Win+R`, type the path above, press Enter
3. If the `Scripts` folder doesn't exist, create it (and parent folders if needed)
4. Copy `add_black_solid.py` to this folder
5. Restart DaVinci Resolve if it was running

### Option 2: Using PowerShell (Quick install)

Open PowerShell and run:

```powershell
$scriptsDir = "C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts"
New-Item -ItemType Directory -Force -Path $scriptsDir
Copy-Item "add_black_solid.py" -Destination $scriptsDir
```

## Usage

1. **Open DaVinci Resolve Studio 20**
2. **Open a Project** with a timeline
3. **Position the Playhead** where you want the black solid inserted
4. **Run the Script**:
   - Go to `Workspace` > `Scripts`
   - Click on `add_black_solid.py` (it appears as a menu item)
   - The script will add a 5-second black solid at the playhead position

## What the Script Does

1. Connects to DaVinci Resolve
2. Gets the current project and timeline
3. Reads the timeline frame rate
4. Creates a black solid color clip (5 seconds duration)
5. Inserts it at the current playhead position on track 1

## Troubleshooting

### "Could not find DaVinciResolveScript module"

- Ensure DaVinci Resolve Studio 20 is installed
- Run the script from within DaVinci Resolve (Workspace > Scripts > Run Script)
- Do not run the script directly from Python outside of DaVinci Resolve

### "No project is currently open"

- Open a project in DaVinci Resolve before running the script

### "No timeline is currently open"

- Open a timeline in your project before running the script

### "Could not add black solid to timeline"

- Ensure the video track is not locked
- Check that there's space at the playhead position
- Try the manual workaround described in the error message

## Testing the API Connection

Before using the plugin, you can test if DaVinci Resolve API is working correctly:

1. Copy `test_api.py` to the same Scripts folder
2. In DaVinci Resolve, go to **Workspace** > **Scripts** > **Run Script**
3. Select `test_api.py`
4. Review the output - all steps should show ✓ (checkmark)

This helps diagnose any API connection issues before running the main plugin.

## Requirements

- DaVinci Resolve Studio 20 (or later)
- Windows (script can be adapted for macOS/Linux)
- Python 3.6+ (comes with DaVinci Resolve)

## Notes

- The script adds the black solid to video track 1
- Duration is exactly 5 seconds based on the timeline frame rate
- The clip is inserted at the current playhead position
- If insertion at playhead fails, it will try to append to the end of the timeline

## Future Enhancements

Possible improvements:
- GUI panel for easier access
- Customizable duration
- Multiple track support
- Color picker for custom colors
- Integration with Concepto app for AV script synchronization

## Support

For issues or questions, please check the DaVinci Resolve documentation or contact the Concepto team.

