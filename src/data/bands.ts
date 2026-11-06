// Amateur bands where Yagis are common, in MHz. Full-band edges follow the
// US / ITU Region 2 allocations; Region 1 variants are listed where they
// differ (individual countries vary — check your licence). "Segments" are
// popular operating ranges that are a better optimisation target than a
// whole wide band.

export interface Band { id: string; label: string; lo: number; hi: number }
export interface BandGroup { label: string; bands: Band[] }

export const BAND_GROUPS: BandGroup[] = [
  {
    label: 'HF (Region 2 / US)',
    bands: [
      { id: '40m', label: '40 m  7.000–7.300', lo: 7.0, hi: 7.3 },
      { id: '20m', label: '20 m  14.000–14.350', lo: 14.0, hi: 14.35 },
      { id: '17m', label: '17 m  18.068–18.168', lo: 18.068, hi: 18.168 },
      { id: '15m', label: '15 m  21.000–21.450', lo: 21.0, hi: 21.45 },
      { id: '12m', label: '12 m  24.890–24.990', lo: 24.89, hi: 24.99 },
      { id: '10m', label: '10 m  28.000–29.700', lo: 28.0, hi: 29.7 },
    ],
  },
  {
    label: 'VHF / UHF (Region 2 / US)',
    bands: [
      { id: '6m', label: '6 m  50–54', lo: 50, hi: 54 },
      { id: '2m', label: '2 m  144–148', lo: 144, hi: 148 },
      { id: '1.25m', label: '1.25 m  222–225', lo: 222, hi: 225 },
      { id: '70cm', label: '70 cm  420–450', lo: 420, hi: 450 },
      { id: '33cm', label: '33 cm  902–928', lo: 902, hi: 928 },
      { id: '23cm', label: '23 cm  1240–1300', lo: 1240, hi: 1300 },
    ],
  },
  {
    label: 'Region 1 variants',
    bands: [
      { id: '40m-r1', label: '40 m  7.000–7.200', lo: 7.0, hi: 7.2 },
      { id: '6m-r1', label: '6 m  50–52', lo: 50, hi: 52 },
      { id: '2m-r1', label: '2 m  144–146', lo: 144, hi: 146 },
      { id: '70cm-r1', label: '70 cm  430–440', lo: 430, hi: 440 },
    ],
  },
  {
    label: 'Popular segments',
    bands: [
      { id: '10m-low', label: '10 m CW/SSB  28.000–28.500', lo: 28.0, hi: 28.5 },
      { id: '6m-ws', label: '6 m weak signal  50.0–50.5', lo: 50.0, hi: 50.5 },
      { id: '2m-ws', label: '2 m weak signal  144.0–144.5', lo: 144.0, hi: 144.5 },
      { id: '70cm-ws', label: '70 cm weak signal  432.0–432.5', lo: 432.0, hi: 432.5 },
      { id: '70cm-sat', label: '70 cm satellite  435–438', lo: 435, hi: 438 },
      { id: '23cm-ws', label: '23 cm weak signal  1296.0–1296.5', lo: 1296.0, hi: 1296.5 },
    ],
  },
];

export const ALL_BANDS: Band[] = BAND_GROUPS.flatMap((g) => g.bands);

/** The band whose edges match lo/hi (MHz), if any. */
export function matchBand(lo: number, hi: number): Band | undefined {
  return ALL_BANDS.find((b) => Math.abs(b.lo - lo) < 1e-6 && Math.abs(b.hi - hi) < 1e-6);
}
