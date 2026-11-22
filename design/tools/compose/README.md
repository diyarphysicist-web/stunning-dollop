# Screen composers

Some screens are variants of a base screen (a dialog over a workspace, an empty or error state).
These scripts rebuild them from their base so the variants never drift. Run from the repository root:

```bash
python design/tools/compose/dialogs.py    # 16-generate-series, 16-save-tables, 17-layout-presets, 17-shortcuts  (base: 03)
python design/tools/compose/settings.py   # 17-settings-defaults, 17-settings-display
python design/tools/compose/flair_star.py # 13-flair-star (base: 13-longitudinal; needs render_phantom_imagery.py output)
python design/tools/compose/states.py     # 18-directory-empty, 18-directory-loading-error (base: 01), 18-dsc-computing (03), 18-mismatch-error-invalid (05-2x2)
python design/tools/inject_plots.py       # refill generated regions
pnpm design:render 1                      # re-render PNGs
```
