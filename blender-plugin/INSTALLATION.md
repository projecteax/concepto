# Blender Plugin Installation Guide

## Quick Start

1. **Get API Configuration from Concepto**:
   - Open Concepto app
   - Go to AV Script tab
   - Click "Get API" button
   - Copy all the configuration (or individual fields)

2. **Install Plugin in Blender**:
   - Copy `concepto_blender_plugin` folder to Blender addons directory
   - Enable in Blender Preferences > Add-ons
   - Open Concepto panel (N key in 3D viewport)

3. **Configure Plugin**:
   - Paste API configuration
   - Click "Configure API"
   - Click "Load Episode"

## Detailed Installation

### Step 1: Locate Blender Addons Directory

**Windows:**
```
%APPDATA%\Blender Foundation\Blender\3.6\scripts\addons\
```

**macOS:**
```
~/Library/Application Support/Blender/3.6/scripts/addons/
```

**Linux:**
```
~/.config/blender/3.6/scripts/addons/
```

*Note: Version number (3.6) may vary based on your Blender version*

### Step 2: Copy Plugin Folder

Copy the entire `concepto_blender_plugin` folder to the addons directory.

### Step 3: Enable Plugin

1. Open Blender
2. Go to `Edit > Preferences > Add-ons`
3. Search for "Concepto"
4. Check the box next to "Concepto AV Script Sync"
5. The plugin is now active!

### Step 4: Access Plugin

1. Open a 3D Viewport
2. Press `N` to open the sidebar
3. Click on the "Concepto" tab

## Configuration

### First Time Setup

1. **Get API Info from Concepto**:
   - In Concepto app, click "Get API" button
   - Copy the JSON configuration or individual fields

2. **Paste in Blender**:
   - API Endpoint: `https://your-app.com/api/external`
   - API Key: `ck_...`
   - Show ID: `show-123`
   - Episode ID: `episode-456`

3. **Configure**:
   - Click "Configure API" button
   - If successful, you'll see "✓ API Configured"

4. **Load Episode**:
   - Click "Load Episode" button
   - Segments and shots will be loaded

## Usage Workflow

1. **Select Segment**: Choose which segment (SC) to work with
2. **Browse Shots**: View shots in the list (paginated for performance)
3. **Select Shot**: Click on a shot to view/edit it
4. **View Images**: Click "View Images" to see main/start/end frames
5. **Select Image Type**: Choose which image to overwrite (Main/Start/End)
6. **Render**: Position viewport and click "Render Current View"
7. **Upload**: Review rendered image and click "Accept & Upload"

## Troubleshooting

### Plugin doesn't appear
- Check that folder is in correct addons directory
- Verify folder name is exactly `concepto_blender_plugin`
- Check Blender console for errors (Window > Toggle System Console)

### API connection fails
- Verify API endpoint URL is correct
- Check API key is valid
- Ensure internet connection is active
- Check Blender console for detailed error messages

### Images don't load
- Some image URLs may require authentication
- Check that URLs are accessible from your network
- Try opening URL in browser to verify

### Render fails
- Ensure viewport has content to render
- Check Blender console for render errors
- Verify you have write permissions to temp directory

## Requirements

- Blender 3.0 or higher
- Python `requests` library (included with Blender)
- Internet connection
- Valid Concepto API key

## Support

For issues or questions:
1. Check Blender console (Window > Toggle System Console)
2. Verify API configuration in Concepto app
3. Test API endpoints with curl/Postman

