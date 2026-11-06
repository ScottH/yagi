# Yagi Designer

A static web app for designing Yagi-Uda antennas: pick a frequency, element count and element diameter, get a starting geometry, edit it, and (soon) see gain, front-to-back ratio, feed impedance and radiation patterns.

Same shape as [`../moon`](../moon): a sidebar of controls beside a main view, no backend, with the design kept in the URL hash so links can be shared. Unlike moon it's written in TypeScript, so there's a small build step (Vite).

## Status

- ✅ Project scaffold, UI shell, editable element table, top-view drawing, shareable URLs
- ⏳ **Design method:** `src/starter.ts` is a rough *placeholder* geometry, not a validated design
- ⏳ **Analysis engine** (gain / F/B / impedance / patterns), still to be chosen. The `Analysis` interface lives in `src/model.ts`.

## Develop

Requires Node ≥ 22 (installed locally at `~/.local/node`; add `~/.local/node/bin` to `PATH`).

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # typecheck + production build into dist/
```

## Layout

| File | Purpose |
|---|---|
| `src/model.ts` | Types (`Design`, `YagiElement`, `Analysis`), wavelength, SWR. Lengths in metres. |
| `src/starter.ts` | Placeholder starting geometry |
| `src/hash.ts` | Encode/decode a design in the URL hash |
| `src/layout.ts` | SVG top view of the antenna |
| `src/main.ts` | UI wiring |
| `tests/` | Vitest unit tests |

## Host on GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys `dist/` on every push to `main`. In the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Vite's `base: './'` keeps paths relative, so it works from `https://<user>.github.io/<repo>/`.
