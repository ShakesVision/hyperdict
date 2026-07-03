# Publishing the HyperDict Chrome Extension

## One-time setup

- A Google account + [Chrome Web Store developer registration](https://chrome.google.com/webstore/devconsole/) (one-time **US$5** fee).

## Build & package

```bash
# from the repo root
npm install
npm run build            # refreshes extension/vendor/*.min.js from source

# bump the version first (must match Web Store rules: increasing)
#   edit extension/manifest.json  ->  "version": "0.1.1"

# zip the extension folder's CONTENTS (not the folder itself)
cd extension
zip -r ../hyperdict-extension.zip . -x "PUBLISHING.md" "README.md" "icons/generate.mjs"
```

The zip must contain `manifest.json` at its root. `vendor/*.min.js` and
`icons/*.png` must be present (they are after `npm run build` + icon generation).

## Upload

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/) → **Add new item**.
2. Upload `hyperdict-extension.zip`.
3. Fill the listing:
   - **Name / summary / description** (see `manifest.json`).
   - **Category:** Productivity (or Education).
   - **Screenshots** (1280×800 or 640×400) — capture the popup on a page.
   - **Icon** 128×128 (already in the package).
4. **Privacy tab** — this is required and easy here because HyperDict collects nothing:
   - **Single purpose:** "Look up dictionary definitions for words on webpages."
   - **Permission justifications:**
     - `storage` — save the user's settings and dictionary list.
     - `activeTab` + `scripting` — open the dictionary popup on the current page.
     - `host_permissions: raw.githubusercontent.com` — fetch the StarDict
       dictionary files (read-only, static files).
   - **Data usage:** does **not** collect or sell user data. No analytics, no
     remote code — the dictionary logic is bundled; only static dictionary files
     are fetched.
5. Submit for review (usually a few days).

## Notes

- **No remote code:** all executable code is bundled in `vendor/` — this keeps
  the review smooth (Chrome rejects extensions that fetch/execute remote JS).
  Only *data* files (`.ifo/.idx/.dict.dz`) are fetched at runtime.
- **Dictionary hosting:** if you point the extension at your own dictionaries,
  the host must support HTTP Range + CORS (see the main README). To widen
  `host_permissions` beyond `raw.githubusercontent.com`, add those origins to
  `manifest.json` and re-justify them in the Privacy tab.
- **Firefox / Edge:** this MV3 manifest also loads in Edge (same store flow) and
  largely in Firefox (`about:debugging` → Load Temporary Add-on for testing).
- Keep `extension/manifest.json` `version` in step with releases.
