# Concepto Blender Plugin

Blender addon for syncing AV script data and images with the Concepto app.

## Installation

1. Copy the `concepto_blender_plugin` folder to your Blender addons directory:
   - **Windows**: `%APPDATA%\Blender Foundation\Blender\3.x\scripts\addons\`
   - **macOS**: `~/Library/Application Support/Blender/3.x/scripts/addons/`
   - **Linux**: `~/.config/blender/3.x/scripts/addons/`

2. Open Blender
3. Go to `Edit > Preferences > Add-ons`
4. Search for "Concepto"
5. Enable the "Concepto AV Script Sync" addon

## Setup

1. In Concepto app, go to AV Script tab
2. Click "Get API" button
3. Copy the API configuration (or individual fields)
4. In Blender, open the Concepto panel (N key in 3D viewport, then Concepto tab)
5. Paste the configuration:
   - API Endpoint
   - API Key
   - Show ID
   - Episode ID
6. Click "Configure API"
7. Click "Load Episode"

## Usage

### Selecting a Segment
1. After loading episode, segments appear in "Select Segment" panel
2. Click on a segment (e.g., "SC01: Opening Scene")
3. Shots from that segment will appear in the Shots list

### Viewing Shots
- Shots are displayed in rows showing:
  - Shot number/name
  - Visual description (truncated)
  - "View Images" button if image exists
- Use search box to filter shots
- Use pagination to navigate through many shots (20 per page)

### Managing Images
1. Click "View Images" on a shot
2. In "Shot Images" panel, you'll see:
   - Main Image
   - Start Frame
   - End Frame
3. Click "Select" next to an image type to choose which to overwrite
4. Click "Enlarge" to view full-size image

### Rendering and Uploading
1. Select an image type (Main/Start/End)
2. Position your viewport in Blender
3. Click "Render Current View"
4. Preview the rendered image
5. Click "Accept & Upload" to replace the selected image
6. The image will be uploaded to Concepto and replace the existing one

## Features

- **Efficient UI**: Handles hundreds of shots with pagination
- **Segment Filtering**: Filter shots by segment
- **Search**: Search shots by name or visual description
- **Image Management**: View, enlarge, and replace main/start/end frames
- **Real-time Sync**: Changes are immediately reflected in Concepto app

## Requirements

- Blender 3.0 or higher
- Python `requests` library (usually included with Blender)
- Internet connection for API access

## Troubleshooting

### "API connection failed"
- Check API endpoint URL
- Verify API key is correct
- Ensure you're connected to the internet

### "Episode not found"
- Verify Episode ID is correct
- Check that the episode exists in Concepto

### "Upload failed"
- Check internet connection
- Verify API key is still valid
- Ensure image file was rendered successfully

### Images not loading
- Check that image URLs are accessible
- Some URLs may require authentication - this is a known limitation

## Development

To modify the plugin:
1. Edit files in `concepto_blender_plugin/` folder
2. In Blender, go to `Edit > Preferences > Add-ons`
3. Find "Concepto AV Script Sync"
4. Click "Reload" button (or disable/enable)

## File Structure

```
concepto_blender_plugin/
├── __init__.py          # Plugin registration
├── properties.py        # Blender properties and data structures
├── operators.py         # Blender operators (actions)
├── panels.py            # UI panels
└── api_client.py        # API client for Concepto
```

