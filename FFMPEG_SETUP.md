# FFmpeg Setup for Video Rendering (Optional - Local Development Only)

> **Note**: For production deployment (Vercel, etc.), video rendering uses FFmpeg WebAssembly automatically - no installation needed!
> 
> This guide is only for **local development** if you want to use native FFmpeg instead of WASM (faster, but requires installation).

## Windows Installation

### Option 1: Using Chocolatey (Recommended)
1. Install Chocolatey if you don't have it: https://chocolatey.org/install
2. Open PowerShell as Administrator
3. Run: `choco install ffmpeg`

### Option 2: Manual Installation
1. Download FFmpeg from: https://www.gyan.dev/ffmpeg/builds/
2. Extract the ZIP file to a location like `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to your system PATH:
   - Open "Environment Variables" in Windows Settings
   - Edit the "Path" variable
   - Add `C:\ffmpeg\bin`
   - Restart your terminal/IDE

### Option 3: Using Scoop
1. Install Scoop: https://scoop.sh/
2. Run: `scoop install ffmpeg`

## Verify Installation

After installation, verify FFmpeg is working:
```bash
ffmpeg -version
```

You should see version information. If you get "command not found", make sure FFmpeg is in your PATH and restart your terminal.

## macOS Installation

```bash
brew install ffmpeg
```

## Linux Installation

### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

### Fedora
```bash
sudo dnf install ffmpeg
```

## Troubleshooting

- **"FFmpeg is not installed" error**: Make sure FFmpeg is in your system PATH
- **Restart required**: After installing, restart your development server (`npm run dev`)
- **Permission issues**: On Linux/macOS, you may need `sudo` for installation

## Production Deployment

For production servers (Vercel, etc.), FFmpeg needs to be available in the deployment environment. Consider:
- Using a Docker container with FFmpeg
- Using a separate rendering service
- Using cloud-based video processing APIs

