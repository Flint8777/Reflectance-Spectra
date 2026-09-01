# Icon Setup

This directory contains application icons for the Reflectance Spectra Viewer.

## Files

- `icon.png` — 1024x1024 master icon. Used for macOS builds; electron-builder converts it to `.icns`
- `icon.ico` — Windows icon (256 / 128 / 64 / 48 / 32 / 16 px in one file)
- `make_icon.py` — generates both files above

Both are referenced from `package.json` (`build.icon` and `build.win.icon`).

## Design

A dark navy rounded tile with three reflectance spectra (white / cyan / orange —
the app's own colour cycle) sharing an absorption dip, over a faint axis.
It stays readable down to 16 px and works on light and dark taskbars.

## Regenerating

```bash
uv run --with pillow python electron/icons/make_icon.py   # from the repo root
pnpm run electron:build:win
```

Edit the `curves` list in `make_icon.py` to change line shape, colour or spacing.
