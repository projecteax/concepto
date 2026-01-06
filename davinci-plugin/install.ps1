# Concepto DaVinci Resolve Plugin Installer
# Installs the add_black_solid.py script to DaVinci Resolve Scripts directory

Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "Concepto DaVinci Resolve Plugin Installer" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Get the scripts directory (correct location for this user)
$scriptsDir = "C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts"

# Create directory if it doesn't exist
if (-not (Test-Path $scriptsDir)) {
    Write-Host "Creating scripts directory: $scriptsDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
}

# Get the current script location
$scriptPath = Join-Path $PSScriptRoot "add_black_solid.py"
$destinationPath = Join-Path $scriptsDir "add_black_solid.py"

# Check if source file exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Could not find add_black_solid.py in current directory" -ForegroundColor Red
    Write-Host "Expected location: $scriptPath" -ForegroundColor Red
    exit 1
}

# Copy the file
try {
    Copy-Item -Path $scriptPath -Destination $destinationPath -Force
    Write-Host "✓ Plugin installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installation location: $destinationPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Open DaVinci Resolve Studio 20" -ForegroundColor White
    Write-Host "2. Open a project with a timeline" -ForegroundColor White
    Write-Host "3. Go to: Workspace > Scripts > Run Script" -ForegroundColor White
    Write-Host "4. Select 'add_black_solid.py'" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "ERROR: Failed to install plugin: $_" -ForegroundColor Red
    exit 1
}

