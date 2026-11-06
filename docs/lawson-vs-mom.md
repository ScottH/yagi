# Lawson's method vs. method of moments

How the analysis in J. L. Lawson, *Yagi Antenna Design* (ARRL, 1986) compares with a
full-wave method-of-moments (MoM) solver, using the reference designs printed in
the book. Reproduce every number here with `npm run compare`.

## The two methods

**Lawson (ch. 1).** Each element is a one-port with an *assumed* sinusoidal current.
The elements are coupled through an N×N impedance matrix (Carter's method), and the
model solves `Z·I = V` with the parasitic elements shorted.

| Term | Lawson's approximation |
|---|---|
| Self-impedance | `Z = 73 + jX` (eq. 1.14). X is linear in length about a resonant length; thickness enters through K = λ/a. Fitted to Hallén/Uda–Mushiake data (eqs. 1.2–1.7). R is fixed at 73 Ω. |
| Mutual impedance | Table 1.3 for **thin half-wave** dipoles, interpolated by spacing; asymptotic beyond 2 λ (eqs. 1.15–1.16). It does **not** depend on element length or radius. |
| Pattern / gain | Sum of half-wave-dipole patterns weighted by the centre currents (eq. 1.24). |

**Method of moments** (`src/analysis/engines/mom.ts`). This solves for the actual
current distribution on every element, using thin-wire Galerkin with triangle basis
functions, the reduced kernel and a delta-gap feed: the same family as NEC. It makes
no assumption about current shape, and length, radius and spacing all enter exactly.
It also extends naturally to things Lawson handles with separate empirical corrections:
tapered elements (ch. 7), ground (ch. 5) and stacking (ch. 6).

A third engine, **induced EMF**, keeps Lawson's circuit model but computes every
impedance exactly for the real lengths (sinusoidal current). It shows how much of
the difference comes from the impedance tables and how much from the
current-shape assumption itself.

## Reproducing the book

Implemented exactly as printed, eq. 1.26 (`g = 1 − cos πl` with centre currents)
contradicts the model's own fixed 73 Ω radiation resistance: a lone 0.47 λ dipole
would come out at 1.3 dBi. Normalising the element pattern to 1 broadside (every
element radiates like a half-wave dipole, consistent with R = 73 Ω) reproduces all
12 of Lawson's published gains to ≤ 0.35 dB. That is evidently what his program
did, so the `lawson` engine uses it.

Lawson's front-to-back figures above ~35 dB are deep nulls that move with sub-ohm
impedance changes. The engine finds his 44.0 dB (4 el) and 32.4 dB (5 el) peaks
within 0.15 % of the design frequency.

## Results

Gain in dBi, F/B in dB, free space, lossless. MoM uses 24 segments per element.

### NBS TN 688 designs (Lawson Tables 1.4 and 1.5)

| Design | NBS pattern-integrated | Lawson (book) | Lawson (ours) | Induced EMF | **MoM** |
|---|---|---|---|---|---|
| 2 el, 0.2 λ | 6.7 | 6.7 | 6.7 | 6.6 | **6.5** |
| 3 el, 0.4 λ | 9.6 | 9.2 | 9.3 | 9.2 | **9.6** |
| 5 el, 0.8 λ | 11.4 | 10.7 | 10.9 | 10.5 | **11.1** |
| 6 el, 1.2 λ | 12.6 | 11.8 | 12.1 | 11.4 | **12.3** |
| 12 el, 2.2 λ | 14.3 | 14.0 | 14.2 | 13.4 | **14.2** |
| 17 el, 3.2 λ | 15.5 | 15.2 | 14.9 | 14.5 | **15.3** |
| 15 el, 4.2 λ | 16.2 | 15.7 | 15.7 | 14.7 | **16.0** |
| **mean \|error\| vs NBS** | | 0.43 | 0.36 | 0.86 | **0.19** |

"NBS pattern-integrated" is Lawson's own integration of the measured NBS patterns
(Table 1.5, column 3). He treats it as the most reliable experimental number, since
the NBS absolute gain measurements carry a ground-reflection error.

### Lawson's preferred designs (Table 7.1)

| Design | Lawson (book) G / F/B | MoM G / F/B | MoM Z in (Ω) | Lawson Z in (Ω) |
|---|---|---|---|---|
| 2 el | 6.9 / 8.0 | 6.7 / 9.4 | 36 + j12 | 33 + j3 |
| 3 el | 8.3 / **31.2** | 8.6 / **20.2** | 13 + j12 | 15 + j0 |
| 4 el | 10.6 / **44.0** | 11.1 / **16.6** | 20 + j17 | 27 + j1 |
| 5 el | 10.5 / **32.4** | 10.6 / **26.2** | 29 + j10 | 29 + j1 |
| 6 el | 10.7 / **46.8** | 10.8 / **27.5** | 21 + j11 | 20 + j0 |

## Findings

1. **Gain agrees.** Lawson's model predicts forward gain within about 0.5 dB of MoM
   and of the measurements, all the way to 4.2 λ booms. For gain and pattern shape,
   his method holds up.
2. **The deep F/B nulls don't survive.** Lawson optimised these designs for F/B
   within his own model, but a full-wave solution gives 17–28 dB instead of 31–47 dB.
   The null is still there; it has moved by roughly 0.5–1 % in frequency (see the
   F/B sweep in the app), because the half-wave mutual-impedance table and the
   linear reactance fit are off by a few ohms, and an F/B null is sensitive to
   about 1 Ω. Lawson warns about exactly this himself (ch. 1, "Validation").
   Re-tuning the parasitic lengths in MoM recovers the deep null.
3. **Feed impedance differs mostly in reactance.** MoM gives about 10–15 Ω more
   inductive reactance. Part of that is real: Lawson's fit is calibrated only near
   0.45–0.5 λ, and R is fixed at 73 Ω. Part is the delta-gap feed model, whose
   reactance creeps upward as segments are refined (see the convergence block in
   `npm run compare`). Resistance agrees to within a few ohms. Matching networks
   should be designed from the MoM numbers and trimmed on the real antenna.
4. **Exact induced EMF is *worse* than Lawson's tables** for long arrays (mean
   0.86 dB vs 0.36 dB). Lawson's self-reactance comes from Hallén's theory, which
   handles element thickness better than the sinusoidal-current integral does. So
   "more exact" impedances inside the wrong current model don't help.
5. **MoM matches Hallén's theory** for resonant length to within 0.7 % (Table 1.2:
   0.930/0.927, 0.951/0.958 and 0.968/0.971 × λ/2 at K = 200, 1000 and 10⁴).

## Recommendation

Use **MoM as the source of truth** for analysis, and use **Lawson's book for design
methodology**: his parametric studies (chs. 2–3), radius scaling (ch. 7, already
used to scale the starting designs) and taper/boom corrections give excellent
starting points. Keep the Lawson engine as an instant cross-check and as a fast inner
loop for optimisation, but treat F/B and matching numbers from it as approximate,
and re-tune in MoM.

The app runs both and overlays them, so the differences are visible on every design.

## Not yet modelled

- Tapered (telescoping) elements: MoM can model stepped radii directly instead of
  using Lawson's ch. 7 equivalent-length correction.
- Boom and mounting hardware (ch. 7).
- Ground (ch. 5) and stacking (ch. 6): image method in MoM.
- Conductor loss, and matching networks.
