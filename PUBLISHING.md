# Publishing HyperDict

A short, repeatable checklist to ship a release to **npm** and update the
**GitHub Pages** demo.

## What gets published

The `files` field in `package.json` limits the npm tarball to:

- `dist/` — compiled ESM (`index.js`, `ui.js`) + `.d.ts` types + the minified
  browser bundles (`hyperdict.min.js`, `hyperdict-ui.min.js`) and source maps
- `LICENSE`, `NOTICE`, `README.md`

Source (`src/`), tests, and `docs/` are **not** shipped.

Entry points (`exports` in `package.json`):

- `hyperdict` → core engine (`dist/index.js`)
- `hyperdict/ui` → popup UI (`dist/ui.js`)

## One-time setup

1. `npm login` (create an npm account if needed).
2. **Check the name is free:** `npm view hyperdict`. If it's taken, publish under
   a scope — set `"name": "@shakeeb/hyperdict"` in `package.json` and publish with
   `--access public` (scoped packages are private by default).

## Release steps

```bash
# 1. Make sure the tree is clean and on main
git switch main && git pull

# 2. Bump the version (updates package.json + creates a git tag)
npm version patch        # or: minor / major

# 3. Publish. prepublishOnly automatically runs tests + build first.
npm publish              # add --access public if the name is scoped

# 4. Push the commit + tag
git push --follow-tags
```

`prepublishOnly` = `npm run test:run && npm run build`, so a release **cannot**
go out with failing tests or a stale build.

## GitHub Pages (the live demo)

The demo lives in `docs/` (with `.nojekyll`), so enable Pages once:

- Repo **Settings → Pages → Build and deployment → Source: “Deploy from a
  branch”, Branch: `main`, Folder: `/docs`.**

It publishes at `https://shakesvision.github.io/hyperdict/`. `npm run build`
refreshes `docs/hyperdict*.min.js`; commit those so the live demo tracks the code.

## Using the published package

```js
// npm / bundler
import { HyperDict } from 'hyperdict';
import { mountHyperDictUI } from 'hyperdict/ui';
```

```html
<!-- via CDN, no build step (Blogger / static sites) -->
<script src="https://cdn.jsdelivr.net/npm/hyperdict/dist/hyperdict.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/hyperdict/dist/hyperdict-ui.min.js"></script>
<!-- globals: window.HyperDict, window.HyperDictUI -->
```

## Notes

- fflate is a bundled runtime dependency; consumers don't need to add it.
- The Apache-2.0 banner is embedded in every bundle (esbuild `banner`), so
  attribution survives minification.
