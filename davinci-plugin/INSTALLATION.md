# DaVinci Resolve Plugin Installation Guide

## Quick Installation Steps

### Step 1: Find Your DaVinci Resolve Scripts Folder

**Windows (for this user):**
```
C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts
```

**To access this folder:**
1. Press `Win + R`
2. Type: `C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts`
3. Press Enter
4. If the `Scripts` folder doesn't exist, create it (along with parent folders if needed)
5. Copy `add_black_solid.py` into this folder

### Step 2: Copy the Script File

Copy `add_black_solid.py` from this directory to:
```
C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\add_black_solid.py
```

### Step 3: Access in DaVinci Resolve

1. Open **DaVinci Resolve Studio 20**
2. Open a project with a timeline
3. Go to: **Workspace** > **Scripts** > **Run Script**
4. Select `add_black_solid.py` from the list
5. The script will execute and add a 5-second black solid to your timeline

## Automated Installation (PowerShell)

If you prefer to use PowerShell, run this command from the `davinci-plugin` directory:

```powershell
$scriptsDir = "$env:APPDATA\Roaming\Blackmagic Design\DaVinci Resolve\Support\Scripts"
New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
Copy-Item "add_black_solid.py" -Destination "$scriptsDir\add_black_solid.py"
Write-Host "✓ Plugin installed to: $scriptsDir" -ForegroundColor Green
```

## Verification

To verify the installation:

1. Open DaVinci Resolve Studio 20
2. Go to **Workspace** > **Scripts** > **Run Script**
3. You should see `add_black_solid.py` in the list
4. If you see it, the installation was successful!

## Running the Script

### Method 1: Through DaVinci Resolve UI (Recommended)

1. Open DaVinci Resolve Studio 20
2. Open a project
3. Open a timeline
4. Position the playhead where you want the black solid
5. Go to **Workspace** > **Scripts** > **Run Script**
6. Select `add_black_solid.py`
7. The black solid will be added automatically

### Method 2: Keyboard Shortcut (If configured)

Some versions of DaVinci Resolve allow you to assign keyboard shortcuts to scripts. Check:
- **DaVinci Resolve** > **Keyboard Customization**
- Look for "Run Script" or "add_black_solid"

## Troubleshooting

### Script doesn't appear in Workspace > Scripts menu

**Problem:** The script file isn't in the correct location.

**Solution:**
1. Verify the file path: `C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\add_black_solid.py`
2. Check the file name is exactly `add_black_solid.py` (case-sensitive on some systems)
3. Restart DaVinci Resolve
4. Make sure you're using DaVinci Resolve Studio 20 (not the free version)

### "Could not connect to DaVinci Resolve" error

**Problem:** The script is being run outside of DaVinci Resolve.

**Solution:**
- Always run scripts through DaVinci Resolve: **Workspace** > **Scripts** > **Run Script**
- Do not double-click the `.py` file or run it from command line

### "No timeline is currently open" error

**Problem:** You need an active timeline to add clips.

**Solution:**
1. Open a project in DaVinci Resolve
2. Open or create a timeline
3. Position the playhead where you want the black solid
4. Run the script again

### Script runs but doesn't add the clip

**Problem:** Timeline track might be locked or API method unavailable.

**Solution:**
1. Check that video track 1 is not locked (lock icon in timeline)
2. Ensure there's space at the playhead position
3. Try moving the playhead to a different position
4. Check DaVinci Resolve version compatibility (Studio 20 or later)

## Alternative Installation Locations

**Note:** The correct location for scripts to appear in **Workspace > Scripts** for this installation is:
```
C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts
```

## Uninstallation

To remove the plugin:

1. Navigate to: `C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts`
2. Delete `add_black_solid.py`
3. Restart DaVinci Resolve

Or use PowerShell:

```powershell
Remove-Item "C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\add_black_solid.py"
```

## Next Steps

Once installed, you can:
- Run the script anytime you need a black solid
- Modify the script to customize duration or color
- Create additional scripts for other automation tasks
- Integrate with Concepto app for AV script workflows

## Support

For additional help:
- Check the main README.md for usage instructions
- Review DaVinci Resolve Scripting documentation (Help > Documentation > Developer)
- Contact the Concepto team for plugin-specific issues

