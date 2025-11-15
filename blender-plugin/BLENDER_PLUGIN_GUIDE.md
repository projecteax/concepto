# Blender Plugin User Guide

## Quick Start

### 1. Get API Configuration
1. Open Concepto app
2. Navigate to AV Script tab
3. Click **"Get API"** button
4. Click **"Copy All Configuration"** button
5. Save the JSON somewhere (you'll need it)

### 2. Install Plugin in Blender
1. Copy `concepto_blender_plugin` folder to Blender addons directory:
   - **Windows**: `%APPDATA%\Blender Foundation\Blender\3.6\scripts\addons\`
   - **macOS**: `~/Library/Application Support/Blender/3.6/scripts/addons/`
   - **Linux**: `~/.config/blender/3.6/scripts/addons/`
2. Open Blender
3. Go to `Edit > Preferences > Add-ons`
4. Search for "Concepto"
5. Enable "Concepto AV Script Sync"

### 3. Configure Plugin
1. In Blender 3D viewport, press `N` to open sidebar
2. Click **"Concepto"** tab
3. Click **"Paste JSON Config"** button
4. Paste the JSON you copied from Concepto
5. Click **"OK"**
6. Plugin will auto-configure and load episode

## Workflow

### Selecting a Segment
1. After loading episode, segments appear in "Select Segment" panel
2. Click on a segment (e.g., "SC01: Opening Scene")
3. Only shots from that segment will be shown

### Working with Shots
- **View Shots**: Shots appear in rows showing:
  - Shot number/name (click to select)
  - Visual description (click to edit)
  - "View Images" button (if image exists)
- **Search**: Use search box to filter shots
- **Pagination**: Navigate through shots (20 per page)

### Editing Visual Description
1. Click on the visual text in shot row
2. Edit dialog opens
3. Modify text
4. Click "OK" to save
5. Changes sync to Concepto immediately

### Managing Images
1. Click **"View Images"** on a shot
2. In "Shot Images" panel, you'll see:
   - **Main Image**: The main storyboard image
   - **Start Frame**: First frame of shot
   - **End Frame**: Last frame of shot
3. For each image:
   - Click **"Select"** to choose which to overwrite
   - Click **"Enlarge"** to view full-size in image editor

### Rendering and Uploading
1. **Select Image Type**: Click "Select" next to Main/Start/End frame
2. **Position Viewport**: Set up your scene in Blender viewport
3. **Render**: Click **"Render Current View"**
4. **Preview**: Rendered image appears in preview
5. **Upload**: Click **"Accept & Upload"** to replace the image
6. Image is uploaded to Concepto and replaces the existing one

## UI Layout

The plugin has 4 main panels (in order):

1. **API Configuration**: Setup API connection
2. **Select Segment**: Choose which segment (SC) to work with
3. **Shots**: List of shots with search and pagination
4. **Shot Images**: View and manage images for selected shot

## Tips

- **Performance**: Plugin shows 20 shots per page for better performance
- **Search**: Use search to quickly find shots by name or visual text
- **Segment Filtering**: Always select a segment first to reduce shot list
- **Image Preview**: Rendered images are saved temporarily - upload or cancel to clean up
- **Auto-sync**: Changes sync immediately to Concepto (no manual save needed)

## Troubleshooting

### Plugin doesn't appear
- Check addons directory path
- Verify folder name is exactly `concepto_blender_plugin`
- Check Blender console (Window > Toggle System Console)

### "API connection failed"
- Verify API endpoint URL
- Check API key is correct
- Ensure internet connection
- Check Blender console for detailed errors

### "Episode not found"
- Verify Episode ID is correct
- Check episode exists in Concepto
- Try reloading episode

### Render doesn't work
- Ensure viewport has content
- Check Blender console for errors
- Verify write permissions to temp directory

### Images don't upload
- Check internet connection
- Verify API key is still valid
- Check Blender console for errors
- Ensure image was rendered successfully

## Keyboard Shortcuts

- `N` - Toggle sidebar (to access Concepto panel)
- Standard Blender shortcuts work as normal

## Advanced Usage

### Manual Configuration
Instead of pasting JSON, you can manually enter:
- API Endpoint
- API Key
- Show ID
- Episode ID
- Segment ID (optional)
- Shot ID (optional)

### Batch Operations
- Select multiple shots by clicking on them
- Edit visual descriptions in sequence
- Render and upload images for multiple shots

## Support

For issues:
1. Check Blender console (Window > Toggle System Console)
2. Verify API configuration in Concepto
3. Test API with curl/Postman
4. Check plugin logs in Blender console

