# Working Directory

**DaVinci Resolve Scripts Directory:**
```
C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts
```

This is the correct location for DaVinci Resolve scripts. Scripts placed here will appear in:
**Workspace > Scripts** menu in DaVinci Resolve.

## Installed Files

- `add_black_solid_gui.py` - **GUI plugin** to add solid colors (RECOMMENDED)
- `add_black_solid.py` - Command-line plugin to add 5-second black solid
- `test_api.py` - API connection test script

## Quick Access

To open this directory in File Explorer:
1. Press `Win + R`
2. Type: `C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts`
3. Press Enter

Or use PowerShell:
```powershell
cd "C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts"
explorer .
```

## Notes

- All plugin scripts should be placed directly in this directory
- Scripts will appear in DaVinci Resolve under: **Workspace > Scripts > Run Script**
- No subdirectories needed - place `.py` files directly here

