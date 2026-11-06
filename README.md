# Yagi Designer

A static web app for designing Yagi-Uda antennas, built on James L. Lawson's *Yagi Antenna Design* (ARRL, 1986) and checked with a full-wave method-of-moments solver.

Pick one of Lawson's reference designs, set the frequency and element diameter (lengths are rescaled with his ch. 7 radius scaling), edit the elements, and compare the two analyses side by side: forward gain, front-to-back ratio, feed impedance, SWR, E- and H-plane patterns, and frequency sweeps.

Same shape as [`../moon`](../moon): a sidebar of controls beside a main view, no backend, with the design kept in the URL hash so links can be shared. Unlike moon it's written in TypeScript, so there's a small build step (Vite).

## Analysis engines

| Engine | What it is |
|---|---|
| `lawson` | Lawson ch. 1 as printed: 73 + jX self-impedance fit, Table 1.3 half-wave mutual impedances, Carter circuit solve. Reproduces his published gains to ≤ 0.35 dB. |
| `mom` | Thin-wire Galerkin method of moments (triangle basis, reduced kernel, delta-gap feed): the NEC family. Runs in a Web Worker. |
| `emf` | Lawson's circuit model with exact induced-EMF impedances (comparison only). |

**[docs/lawson-vs-mom.md](docs/lawson-vs-mom.md)** compares them on every reference design in the book. In short: gain agrees to about 0.5 dB, but Lawson's deep front-to-back nulls shift by about 0.5–1 % in frequency under MoM, so treat his F/B and impedance numbers as approximate and re-tune in MoM.

`refs/` (git-ignored) holds the scanned book.

, shareable URLs
- ⏳ **Design method:** `src/starter.ts` is a rough *placeholder* geometry, not a validated design
- ⏳ **Analysis engine** (gain / F/B / impedance / patterns), still to be chosen. The `Analysis` interface lives in `src/model.ts`.

## Develop

Requires Node ≥ 22 (installed locally at `~/.local/node`; add `~/.local/node/bin` to `PATH`).

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # typecheck + production build into dist/
npm run compare    # run the book's reference designs through all engines
```

## Layout

| Path | Purpose |
|---|---|
| `src/analysis/engines/` | `lawson.ts`, `mom.ts`, `emf.ts` (+ shared `circuit.ts`) |
| `src/analysis/analyze.ts` | Engine-agnostic gain / F/B / patterns / sweeps |
| `src/data/lawson.ts` | Tables transcribed from the book (1.3, 1.4, 1.5, 7.1) |
| `src/templates.ts` | Starting designs + Lawson radius scaling (eqs. 7.1–7.6) |
| `src/worker.ts` | Runs the analysis off the main thread |
| `src/charts.ts`, `src/layout.ts` | SVG polar/sweep charts and antenna top view |
| `src/main.ts` | UI wiring; the design lives in the URL hash (`src/hash.ts`) |
| `tests/` | Vitest: impedance tables, Hallén resonant lengths, the book's gains, NBS data |
| `scripts/compare.ts` | Comparison tables for `docs/lawson-vs-mom.md` |

## Host on GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys `dist/` on every push to `main`. In the repository, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Vite's `base: './'` keeps paths relative, so it works from `https://<user>.github.io/<repo>/`.
