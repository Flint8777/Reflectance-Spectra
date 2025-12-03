# Icon Setup

This directory contains application icons for the Reflectance Spectra Viewer.

## Required Files

- `icon.png` - Main icon (256x256 or larger, PNG format)
- `icon.ico` - Windows icon (multi-resolution ICO format)
- `icon.icns` - macOS icon (optional, for macOS builds)

## How to Create Icons

### 1. Design the Icon
Create a 256x256 (or 512x512) PNG image representing the application.
Suggested theme: spectrum/wavelength visualization, graph, or scientific measurement.

### 2. Convert to Platform-Specific Formats

**For Windows (.ico):**
- Use online converters: https://convertio.co/png-ico/
- Or use ImageMagick: `convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`

**For macOS (.icns):**
- Use online converters or the `iconutil` command on macOS
- Or use electron-builder auto-conversion from PNG

## Current Status
⚠️ **Default icons are placeholder.** Please add your custom icon files here.

Once added, rebuild the app:
```bash
npm run electron:build:win
```
