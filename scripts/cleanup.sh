#!/bin/bash

# Kill any running Next.js processes
echo "🔄 Killing existing Next.js processes..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "next build" 2>/dev/null || true

# Wait a moment for processes to fully terminate
sleep 2

# Remove build artifacts and caches
echo "🧹 Cleaning build artifacts..."
rm -rf .next 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true
rm -rf .next/cache 2>/dev/null || true

# Remove any temporary files
echo "🗑️ Removing temporary files..."
find . -name "*.tmp" -delete 2>/dev/null || true
find . -name "*.log" -delete 2>/dev/null || true

# Clear any webpack cache
echo "📦 Clearing webpack cache..."
rm -rf .next/cache/webpack 2>/dev/null || true

echo "✅ Cleanup complete!"
