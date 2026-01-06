# Quick Start Guide

## 1. Install the Plugin

### Option A: Use PowerShell Installer (Recommended)
```powershell
cd davinci-plugin
.\install.ps1
```

### Option B: Manual Installation
1. Copy `add_black_solid.py` to:
   ```
   C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts
   ```

## 2. Test the API Connection (Optional but Recommended)

Before using the plugin, test if DaVinci Resolve API is working:

1. Open DaVinci Resolve Studio 20
2. Go to **Workspace** > **Scripts**
3. Click on `test_api.py` (copy it to the Scripts folder first - it should appear in the menu)
4. Check the output - all steps should show ✓

## 3. Use the Plugin

1. **Open DaVinci Resolve Studio 20**
2. **Open a project** with a timeline
3. **Position the playhead** where you want the black solid
4. Go to **Workspace** > **Scripts**
5. Click on `add_black_solid.py` (it appears as a menu item)
6. **Done!** A 5-second black solid will be added to your timeline

## Troubleshooting

### Script doesn't appear in menu
- Make sure the file is in: `C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts`
- Restart DaVinci Resolve
- Check file name is exactly `add_black_solid.py` (must be .py extension)

### "Could not connect" error
- Make sure DaVinci Resolve Studio 20 is running
- The script runs automatically when you click it from Workspace > Scripts menu
- Make sure External Scripting is enabled: Preferences > System > General > External Scripting Using = Local

### "No timeline open" error
- Open a timeline in your project first
- Make sure a timeline is the active tab

### Script runs but clip doesn't appear
- Check that video track 1 is not locked
- Try running `test_api.py` to verify API methods work
- The script tries multiple methods - check the console output for which one succeeded

## What's Next?

Once this basic plugin works, you can:
- Modify the duration (change `5` seconds in the script)
- Change the color (modify RGB values)
- Add more automation features
- Integrate with Concepto app for AV script workflows

