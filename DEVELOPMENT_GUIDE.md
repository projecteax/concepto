# Development Guide - Preventing Server Errors

## 🚨 The Problem
Next.js development server sometimes gets into a corrupted state, causing:
- 500 Internal Server Errors
- `routes-manifest.json` not found errors
- React Client Manifest errors
- Black thumbnails and image loading issues

## ✅ The Solution

### Quick Fix Commands
```bash
# If you get 500 errors or server issues:
npm run clean          # Clean all caches and restart
npm run dev:clean      # Clean and start development server
npm run reset          # Nuclear option: clean, reinstall, restart
```

### What Each Command Does

#### `npm run clean`
- Kills all Next.js processes
- Removes `.next` build cache
- Clears `node_modules/.cache`
- Removes temporary files
- Clears webpack cache

#### `npm run dev:clean`
- Runs cleanup script
- Starts development server in stable mode

#### `npm run reset`
- Runs full cleanup
- Reinstalls dependencies
- Starts fresh development server

### When to Use Each Command

| Issue | Command | When |
|-------|---------|------|
| 500 errors | `npm run clean` | After any code changes |
| Server won't start | `npm run dev:clean` | When server is completely broken |
| Everything broken | `npm run reset` | Last resort, takes longer |

## 🔧 Permanent Fixes Applied

### 1. Next.js Configuration (`next.config.js`)
- Disabled Turbopack in development (more stable)
- Disabled webpack cache in development
- Added better error handling
- Disabled image optimization in development

### 2. Cleanup Script (`scripts/cleanup.sh`)
- Comprehensive cleanup of all build artifacts
- Kills problematic processes
- Removes temporary files
- Clears all caches

### 3. Package.json Scripts
- `dev:clean` - Clean and start
- `build:clean` - Clean and build
- `reset` - Nuclear option

## 🎯 Best Practices

### Before Making Changes
```bash
npm run clean  # Always clean before starting work
```

### After Making Changes
```bash
npm run clean  # Clean after any significant changes
```

### If You Get Errors
1. **First try**: `npm run clean`
2. **Still broken**: `npm run dev:clean`
3. **Still broken**: `npm run reset`

## 🚀 Development Workflow

```bash
# Start your day
npm run clean
npm run dev:stable

# Make changes to code
# If you get 500 errors:
npm run clean

# Continue development
# Repeat as needed
```

## 📝 Notes

- **Always use `npm run dev:stable`** instead of `npm run dev` for better stability
- **Clean frequently** - it's fast and prevents issues
- **Don't use Turbopack** in development - it's unstable
- **The cleanup script is safe** - it only removes build artifacts, not your code

## 🆘 Emergency Commands

If everything is broken:
```bash
# Nuclear option
npm run reset

# Or manual cleanup
rm -rf .next
rm -rf node_modules/.cache
pkill -f "next dev"
npm run dev:stable
```

This setup should prevent the recurring server errors you've been experiencing!
