import { type Design, C0 } from '../model';

// Reference data transcribed from J. L. Lawson, "Yagi Antenna Design"
// (ARRL, 1986). Dimensions in wavelengths at the design frequency.

/**
 * Table 1.3 — mutual impedance (ohms) of thin half-wave dipoles side by side,
 * spacing 0…2 λ in 0.05 λ steps: [R_mut, X_mut]. s = 0 is the self-impedance.
 */
export const TABLE_1_3: ReadonlyArray<readonly [number, number]> = [
  [73.1, 42.5], [71.7, 24.3], [67.3, 7.5], [60.4, -7.1], [51.4, -19.2],
  [40.8, -28.4], [29.3, -34.4], [17.5, -37.4], [6.2, -37.4], [-4.0, -34.8],
  [-12.5, -29.9], [-19.1, -23.4], [-23.3, -15.9], [-25.2, -7.9], [-24.9, -0.3],
  [-22.5, 6.6], [-18.5, 12.3], [-13.3, 16.3], [-7.5, 18.6], [-1.6, 19.0],
  [4.0, 17.7], [8.8, 15.0], [12.3, 11.2], [14.5, 6.7], [15.3, 1.9],
  [14.6, -2.7], [12.6, -6.7], [9.6, -9.8], [6.0, -11.9], [2.0, -12.7],
  [-1.9, -12.3], [-5.4, -10.8], [-8.2, -8.4], [-10.0, -5.3], [-10.9, -2.0],
  [-10.6, 1.4], [-9.4, 4.5], [-7.4, 7.0], [-4.8, 8.7], [-1.9, 9.5],
  [1.1, 9.4],
];
export const TABLE_1_3_STEP = 0.05;

export interface ReferenceDesign {
  name: string;
  /** Element radius, λ. */
  radius: number;
  /** [x position, length] in λ, reflector first, then driver, then directors. */
  elements: ReadonlyArray<readonly [number, number]>;
  /** Lawson's computed free-space results. */
  lawson: { gainDbi: number; frontToBackDb?: number };
  /** NBS TN 688 measured gain (dBi), from Table 1.5 column 1. */
  nbsMeasuredDbi?: number;
  /** Gain from integrating the measured NBS patterns, Table 1.5 column 3. */
  nbsPatternDbi?: number;
}

// Table 1.4: reflector 0.2 λ behind the driver, element diameter 0.0085 λ.
// The driver length is not given (and does not affect gain or F/B in
// Lawson's model); 0.47 λ is assumed.
const NBS_DRIVER = 0.47;
function nbs(name: string, reflector: number, spacing: number, directors: number[],
  lawson: number, measured: number, pattern: number): ReferenceDesign {
  return {
    name, radius: 0.0085 / 2,
    elements: [[-0.2, reflector], [0, NBS_DRIVER], ...directors.map((l, i) => [(i + 1) * spacing, l] as const)],
    lawson: { gainDbi: lawson }, nbsMeasuredDbi: measured, nbsPatternDbi: pattern,
  };
}

export const NBS_DESIGNS: ReferenceDesign[] = [
  // 2-element: reflector length not stated by NBS; Lawson assumed 0.482 λ.
  nbs('NBS 2 el (0.2 λ)', 0.482, 0.2, [], 6.7, 4.8, 6.7),
  nbs('NBS 3 el (0.4 λ)', 0.482, 0.2, [0.442], 9.2, 9.3, 9.6),
  nbs('NBS 5 el (0.8 λ)', 0.482, 0.2, [0.428, 0.424, 0.428], 10.7, 11.4, 11.4),
  nbs('NBS 6 el (1.2 λ)', 0.482, 0.25, [0.428, 0.420, 0.420, 0.428], 11.8, 12.4, 12.6),
  nbs('NBS 12 el (2.2 λ)', 0.482, 0.2,
    [0.432, 0.415, 0.407, 0.398, 0.390, 0.390, 0.390, 0.390, 0.398, 0.407], 14.0, 14.4, 14.3),
  nbs('NBS 17 el (3.2 λ)', 0.482, 0.2,
    [0.428, 0.420, 0.407, 0.398, 0.394, 0.390, 0.386, 0.386, 0.386, 0.386, 0.386, 0.386, 0.386, 0.386, 0.386], 15.2, 15.6, 15.5),
  nbs('NBS 15 el (4.2 λ)', 0.475, 0.308,
    [0.424, 0.424, 0.420, 0.407, 0.403, 0.398, 0.394, 0.390, 0.390, 0.390, 0.390, 0.390, 0.390], 15.7, 16.4, 16.2),
];

// Table 7.1: Lawson's preferred free-space designs, radius 0.00052599 λ.
const R71 = 0.00052599;
export const PREFERRED_DESIGNS: ReferenceDesign[] = [
  { name: 'Lawson 2 el', radius: R71, elements: [[0, 0.49366], [0.15, 0.4705]], lawson: { gainDbi: 6.9, frontToBackDb: 8.0 } },
  { name: 'Lawson 3 el', radius: R71, elements: [[0, 0.49404], [0.15, 0.48572], [0.3, 0.46525]], lawson: { gainDbi: 8.3, frontToBackDb: 31.2 } },
  { name: 'Lawson 4 el', radius: R71, elements: [[0, 0.49136], [0.25, 0.47895], [0.5, 0.46273], [0.75, 0.46273]], lawson: { gainDbi: 10.6, frontToBackDb: 44.0 } },
  { name: 'Lawson 5 el', radius: R71, elements: [[0, 0.49944], [0.1875, 0.48031], [0.375, 0.45187], [0.5625, 0.45187], [0.75, 0.45187]], lawson: { gainDbi: 10.5, frontToBackDb: 32.4 } },
  { name: 'Lawson 6 el', radius: R71, elements: [[0, 0.49478], [0.15, 0.48038], [0.3, 0.44766], [0.45, 0.44766], [0.6, 0.44766], [0.75, 0.44766]], lawson: { gainDbi: 10.7, frontToBackDb: 46.8 } },
];

/** A reference design as a Design at λ = 1 m (so dimensions in λ are metres). */
export function referenceToDesign(r: ReferenceDesign): Design {
  const drv = r.elements.length >= 2 ? 1 : 0;
  return {
    frequency: C0,
    diameter: 2 * r.radius,
    elements: r.elements.map(([x, length], i) => ({ role: i === drv ? 'driven' : i < drv ? 'reflector' : 'director', x, length })),
  };
}
